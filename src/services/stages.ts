import type { Prisma, StageVersion } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { NotFoundError, UserError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth";
import { checksum } from "@/domain/spec";
import { checkStageTransition, STAGES, type StageAction, type StageStatusT } from "@/domain/stage";
import { ForbiddenError } from "@/domain/rbac";
import { loadProjectAccess } from "./scope";
import { notifyTimerChange, syncAutoPause } from "./timer";

/** Заказчик видит версии, переданные ему на согласование (внутренние черновики и проверки скрыты). */
export const CUSTOMER_VISIBLE_VERSION = {
  OR: [{ status: { in: ["CUSTOMER_REVIEW", "APPROVED"] } }, { approvals: { some: { kind: "CUSTOMER" } } }],
} satisfies Prisma.StageVersionWhereInput;

export function customerSeesVersion(v: { status: string; approvals: { kind: string }[] }): boolean {
  return v.status === "CUSTOMER_REVIEW" || v.status === "APPROVED" || v.approvals.some((a) => a.kind === "CUSTOMER");
}

async function loadStage(user: SessionUser, stageId: string) {
  const stage = await db.projectStage.findUnique({
    where: { id: stageId },
    include: { versions: { orderBy: { version: "desc" }, take: 1, include: { files: { where: { deletedAt: null } } } } },
  });
  if (!stage) throw new NotFoundError("Этап");
  const access = await loadProjectAccess(user, stage.projectId);
  return { stage, access, latest: stage.versions[0] ?? null };
}

function versionChecksum(v: Pick<StageVersion, "description">, files: { checksum: string; id: string }[]) {
  return checksum({ description: v.description, files: files.map((f) => [f.id, f.checksum]).sort() });
}

/** Новая версия результата этапа. Связывается с предыдущей; согласованная версия не меняется. */
export async function uploadVersion(user: SessionUser, stageId: string, description: string, fileIds: string[]) {
  const { stage, access, latest } = await loadStage(user, stageId);
  if (!access.actorKind || access.actorKind === "customer") throw new ForbiddenError();
  if (description.trim().length < 5) throw new UserError("Опишите, что изменено в версии");
  if (!fileIds.length) throw new UserError("Прикрепите хотя бы один файл результата");
  const check = checkStageTransition(stage.status as StageStatusT, "upload_version", access.actorKind);
  if (!check.ok) throw new UserError(check.reason);
  if (latest && ["INTERNAL_REVIEW", "CUSTOMER_REVIEW"].includes(latest.status)) {
    throw new UserError("Предыдущая версия ещё на проверке");
  }
  const files = await db.fileAsset.findMany({
    where: { id: { in: fileIds }, projectId: stage.projectId, stageVersionId: null, deletedAt: null },
  });
  if (files.length !== fileIds.length) throw new UserError("Часть файлов не найдена или уже прикреплена к другой версии");

  const version = await db.$transaction(async (tx) => {
    const v = await tx.stageVersion.create({
      data: {
        stageId,
        version: (latest?.version ?? 0) + 1,
        description,
        previousVersionId: latest?.id ?? null,
        createdById: user.id,
      },
    });
    await tx.fileAsset.updateMany({ where: { id: { in: fileIds } }, data: { stageVersionId: v.id, stageCode: stage.code } });
    await tx.projectStage.update({
      where: { id: stageId },
      data: { status: "in_progress", startedAt: stage.startedAt ?? new Date() },
    });
    if (stage.status !== "in_progress") {
      await tx.statusChange.create({ data: { entityType: "ProjectStage", entityId: stageId, projectId: stage.projectId, fromStatus: stage.status, toStatus: "in_progress", actorId: user.id, comment: `Версия ${v.version}` } });
    }
    return v;
  });
  await audit({ actorId: user.id, action: "stage.version", entityType: "StageVersion", entityId: version.id, projectId: stage.projectId, meta: { stage: stage.code, version: version.version } });
  return version;
}

/** Переход этапа по действию. Права, статусы и обязательность комментария проверяются доменной моделью. */
export async function stageAction(user: SessionUser, stageId: string, action: StageAction, comment: string) {
  const { stage, access, latest } = await loadStage(user, stageId);
  if (!access.actorKind) throw new ForbiddenError();
  let previousCompleted: boolean | undefined;
  if (action === "start") {
    const def = STAGES.findIndex((s) => s.code === stage.code);
    if (def > 0) {
      const prev = await db.projectStage.findUnique({ where: { projectId_code: { projectId: stage.projectId, code: STAGES[def - 1].code } } });
      previousCompleted = prev?.status === "completed";
    }
  }
  const check = checkStageTransition(stage.status as StageStatusT, action, access.actorKind, {
    comment,
    hasVersion: !!latest && latest.status === "DRAFT",
    previousCompleted,
  });
  if (!check.ok) throw new UserError(check.reason);
  if (stage.code === "brief" && action !== "start") {
    throw new UserError("Этап ТЗ управляется через раздел «Техническое задание»");
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    let versionPatch: Partial<StageVersion> | null = null;
    if (latest) {
      switch (action) {
        case "submit_internal":
          versionPatch = { status: "INTERNAL_REVIEW" };
          break;
        case "confirm_internal":
          versionPatch = { status: "CUSTOMER_REVIEW" };
          break;
        case "return_internal":
          versionPatch = { status: "CHANGES_REQUESTED" };
          break;
        case "customer_request_changes":
          versionPatch = { status: "CHANGES_REQUESTED" };
          break;
        case "customer_approve":
          versionPatch = { status: "APPROVED", lockedAt: now, checksum: versionChecksum(latest, latest.files) };
          break;
      }
      if (versionPatch) await tx.stageVersion.update({ where: { id: latest.id }, data: versionPatch });
      const kind = action.startsWith("customer") ? "CUSTOMER" : "INTERNAL";
      const decision =
        action === "customer_approve" || action === "confirm_internal"
          ? "APPROVED"
          : action === "customer_request_changes" || action === "return_internal"
            ? "CHANGES_REQUESTED"
            : action === "submit_internal"
              ? "SUBMITTED"
              : null;
      if (decision) {
        await tx.approval.create({ data: { stageVersionId: latest.id, kind, decision, comment: comment || null, userId: user.id } });
      }
    }
    await tx.projectStage.update({
      where: { id: stageId },
      data: {
        status: check.to,
        ...(action === "start" ? { startedAt: now } : {}),
        ...(action === "complete" ? { completedAt: now } : {}),
      },
    });
    await tx.statusChange.create({
      data: { entityType: "ProjectStage", entityId: stageId, projectId: stage.projectId, fromStatus: stage.status, toStatus: check.to, actorId: user.id, comment: comment || null },
    });
    // Завершение этапа запускает следующий
    if (action === "complete") {
      const idx = STAGES.findIndex((s) => s.code === stage.code);
      const next = STAGES[idx + 1];
      if (next) {
        await tx.projectStage.updateMany({
          where: { projectId: stage.projectId, code: next.code, status: "not_started" },
          data: { status: "in_progress", startedAt: now },
        });
      } else {
        await tx.project.update({ where: { id: stage.projectId }, data: { status: "COMPLETED" } });
        await tx.timer.updateMany({ where: { projectId: stage.projectId, completedAt: null }, data: { completedAt: now, state: "completed" } });
      }
    }
  });
  await audit({ actorId: user.id, action: "stage.transition", entityType: "ProjectStage", entityId: stageId, projectId: stage.projectId, meta: { action, from: stage.status, to: check.to, comment } });

  // Таймер: ожидание согласования заказчиком — пауза; решение заказчика — возобновление
  const change = await syncAutoPause(stage.projectId, user.id);
  await notifyTimerChange(stage.projectId, change);

  const p = access.project;
  const link = `/cabinet/projects/${p.id}?tab=stages`;
  const team = [p.managerId, ...access.info.memberIds];
  if (action === "confirm_internal") {
    await notify([p.customerId], "approval.pending", `Требуется согласование: ${stage.title.toLowerCase()}`, `Проект №${p.number} «${p.title}». Проверьте версию ${latest?.version} и примите решение.`, link);
  } else if (action === "customer_request_changes") {
    await notify(team, "approval.changes", `Замечания заказчика по этапу «${stage.title}»`, comment, link);
  } else if (action === "customer_approve") {
    await notify(team, "approval.approved", `Этап согласован: ${stage.title}`, `Проект №${p.number}. Версия ${latest?.version} согласована заказчиком.`, link);
  } else if (action === "return_internal") {
    await notify(team, "approval.changes", `Версия возвращена на доработку: ${stage.title}`, comment, link, { exceptUserId: user.id });
  } else if (action === "submit_internal") {
    await notify(team, "approval.pending", `Внутренняя проверка: ${stage.title}`, `Проект №${p.number}, версия ${latest?.version}.`, link, { exceptUserId: user.id });
  } else {
    await notify([...team, p.customerId], "status.changed", `Этап «${stage.title}»: статус изменён`, undefined, link, { exceptUserId: user.id, email: false });
  }
}

/** Проверка целостности согласованной версии: файлы и описание не изменены после согласования. */
export async function verifyVersionIntegrity(versionId: string): Promise<boolean> {
  const v = await db.stageVersion.findUnique({ where: { id: versionId }, include: { files: true } });
  if (!v || !v.checksum) return true;
  return versionChecksum(v, v.files) === v.checksum;
}
