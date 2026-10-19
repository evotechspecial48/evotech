import type { FileCategory, Prisma } from "@prisma/client";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { one } from "@/lib/page";
import { FILE_CATEGORY } from "@/domain/labels";
import { leadScope, projectScope, quickOrderScope } from "@/services/scope";
import { CUSTOMER_VISIBLE_VERSION } from "@/services/stages";
import { FileList } from "@/components/cabinet/shared";
import { btnClass, Card, fieldClass, PageHeader } from "@/components/ui";

export default async function FilesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser("files.download");
  const sp = await searchParams;
  const category = one(sp.category);
  const q = one(sp.q).trim();
  const isCustomer = user.role === "CUSTOMER";
  const where: Prisma.FileAssetWhereInput = {
    deletedAt: null,
    category: category in FILE_CATEGORY ? (category as FileCategory) : { not: "ARCHIVE" },
    ...(q ? { originalName: { contains: q, mode: "insensitive" } } : {}),
    OR: [
      { project: projectScope(user), ...(isCustomer ? { internal: false, OR: [{ stageVersionId: null }, { stageVersion: CUSTOMER_VISIBLE_VERSION }] } : {}) },
      ...(user.role === "DESIGNER" ? [] : [{ lead: leadScope(user), projectId: null, ...(isCustomer ? { internal: false } : {}) }]),
      ...(user.role === "DESIGNER" ? [] : [{ quickOrder: quickOrderScope(user) }]),
    ],
  };
  const files = await db.fileAsset.findMany({ where, include: { project: { select: { id: true, number: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <PageHeader title="Файлы и версии" subtitle="Все доступные вам файлы. Скачивание — по временным защищённым ссылкам." />
      <form className="mb-5 grid gap-3 sm:grid-cols-[2fr_1fr_auto]" role="search">
        <input name="q" defaultValue={q} placeholder="Имя файла" className={fieldClass} aria-label="Поиск по имени" />
        <select name="category" defaultValue={category} className={fieldClass} aria-label="Категория">
          <option value="">Все категории</option>
          {Object.entries(FILE_CATEGORY)
            .filter(([k]) => k !== "ARCHIVE")
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </select>
        <button className={btnClass("secondary")}>Найти</button>
      </form>
      <Card>
        <FileList files={files} emptyText="Файлов не найдено" />
        {files.some((f) => f.project) && (
          <p className="mt-4 text-xs text-muted">
            Файлы проектов также доступны во вкладке «Файлы» карточки проекта.{" "}
            <Link href="/cabinet/projects" className="text-accent-700">
              К проектам
            </Link>
          </p>
        )}
      </Card>
    </>
  );
}
