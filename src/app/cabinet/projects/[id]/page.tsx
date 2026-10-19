import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { orNotFound } from "@/lib/page";
import { PROJECT_STATUS, SPEC_STATUS } from "@/domain/labels";
import { projectProgress, type StageCodeT, type StageStatusT } from "@/domain/stage";
import { loadProjectAccess } from "@/services/scope";
import { Alert, PageHeader, Progress, StatusBadge, Tabs } from "@/components/ui";
import { CommentsTab, FilesTab, HistoryTab, OverviewTab, RequestsTab, StagesTab, VariantsTab } from "./tabs";

const TABS = [
  ["overview", "Обзор"],
  ["stages", "Этапы и согласования"],
  ["requests", "Запросы"],
  ["comments", "Комментарии"],
  ["files", "Файлы"],
  ["variants", "Варианты (AI)"],
  ["history", "Лента событий"],
] as const;

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const user = await requireUser(["projects.view_all", "projects.view_assigned", "projects.view_own"]);
  const access = await orNotFound(loadProjectAccess(user, id));
  const tab = TABS.some(([k]) => k === tabParam) ? tabParam! : "overview";
  const project = await db.project.findUniqueOrThrow({
    where: { id },
    include: { stages: { orderBy: { order: "asc" } }, spec: { select: { id: true, status: true } }, customer: { select: { name: true } } },
  });
  const [openRequests, comments, files] = await Promise.all([
    db.customerRequest.count({ where: { projectId: id, status: "OPEN" } }),
    db.comment.count({ where: { projectId: id, ...(user.role === "CUSTOMER" ? { internal: false } : {}) } }),
    db.fileAsset.count({ where: { projectId: id, deletedAt: null, ...(user.role === "CUSTOMER" ? { internal: false } : {}) } }),
  ]);
  const progress = projectProgress(project.stages.map((s) => ({ code: s.code as StageCodeT, status: s.status as StageStatusT })));
  const ctx = { user, access, projectId: id };

  return (
    <>
      <PageHeader
        back={{ href: "/cabinet/projects", label: "К проектам" }}
        title={`Проект №${project.number}`}
        subtitle={
          <>
            {project.title} · заказчик {project.customer.name}
            {project.spec && (
              <>
                {" · "}
                <Link href={`/cabinet/specs/${project.spec.id}`} className="text-accent-700 hover:underline">
                  ТЗ
                </Link>{" "}
                <StatusBadge map={SPEC_STATUS} value={project.spec.status} />
              </>
            )}
          </>
        }
        actions={<StatusBadge map={PROJECT_STATUS} value={project.status} />}
      />
      <div className="mb-5 max-w-xl">
        <Progress value={progress} label="Общая готовность проекта" />
      </div>
      {user.role === "CUSTOMER" && project.stages.some((s) => s.status === "customer_review") && (
        <div className="mb-5">
          <Alert tone="warning" title="Ожидается ваше согласование">
            Проверьте версию результата во вкладке{" "}
            <Link href="?tab=stages" className="underline">
              «Этапы и согласования»
            </Link>
            . Пока решение не принято, таймер проекта остановлен.
          </Alert>
        </div>
      )}
      <Tabs
        active={tab}
        items={TABS.map(([k, label]) => ({ key: k, label, href: `?tab=${k}`, count: k === "requests" ? openRequests : k === "comments" ? comments : k === "files" ? files : undefined }))}
      />
      {tab === "overview" && <OverviewTab {...ctx} />}
      {tab === "stages" && <StagesTab {...ctx} />}
      {tab === "requests" && <RequestsTab {...ctx} />}
      {tab === "comments" && <CommentsTab {...ctx} />}
      {tab === "files" && <FilesTab {...ctx} />}
      {tab === "variants" && <VariantsTab {...ctx} />}
      {tab === "history" && <HistoryTab {...ctx} />}
    </>
  );
}
