// Правила загрузки файлов: допустимые расширения, размер, MIME-тип, предпросмотр.

export const ALLOWED_EXTENSIONS: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  dwg: "application/acad",
  dxf: "image/vnd.dxf",
  ifc: "application/x-step",
  step: "application/step",
  stp: "application/step",
  svg: "image/svg+xml",
  txt: "text/plain",
};

export const DEFAULT_MAX_SIZE_MB = 50;

export function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

export type FileCheck = { ok: true; ext: string; mime: string } | { ok: false; reason: string };

export function checkUpload(name: string, size: number, maxSizeMb = DEFAULT_MAX_SIZE_MB, allowSvg = false): FileCheck {
  const ext = extensionOf(name);
  if (!ext || !(ext in ALLOWED_EXTENSIONS) || (ext === "svg" && !allowSvg) || ext === "txt") {
    return { ok: false, reason: `Формат «.${ext || "?"}» не поддерживается` };
  }
  if (size <= 0) return { ok: false, reason: "Пустой файл" };
  if (size > maxSizeMb * 1024 * 1024) return { ok: false, reason: `Размер превышает ${maxSizeMb} МБ` };
  return { ok: true, ext, mime: ALLOWED_EXTENSIONS[ext] };
}

/** Безопасное имя для заголовка Content-Disposition и хранения. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 180) || "file";
}

export function previewKind(mime: string): "image" | "pdf" | null {
  if (mime === "image/jpeg" || mime === "image/png") return "image";
  if (mime === "application/pdf") return "pdf";
  return null;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}
