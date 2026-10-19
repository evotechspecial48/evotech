// Поля технического задания, сравнение версий и шаблонизатор документов.

import { createHash } from "node:crypto";

export type SpecFieldType = "text" | "textarea" | "select" | "date";

export interface SpecField {
  key: string;
  label: string;
  type: SpecFieldType;
  required?: boolean;
  options?: string[];
  group: string;
  hint?: string;
}

export const SPEC_FIELDS: SpecField[] = [
  { key: "objectName", label: "Название объекта", type: "text", required: true, group: "Объект" },
  { key: "objectType", label: "Тип объекта", type: "select", required: true, group: "Объект",
    options: ["Каркас здания", "Навес", "Ангар / склад", "Площадка обслуживания", "Эстакада", "Лестница / ограждение", "Малая архитектурная форма", "Другое"] },
  { key: "purpose", label: "Назначение конструкции", type: "textarea", required: true, group: "Объект" },
  { key: "address", label: "Адрес или регион строительства", type: "text", required: true, group: "Объект" },
  { key: "dimensions", label: "Габариты и основные размеры", type: "text", required: true, group: "Геометрия", hint: "Например: 24 × 48 м" },
  { key: "spans", label: "Пролёты, высота и этажность", type: "text", group: "Геометрия" },
  { key: "materials", label: "Материалы и предпочтительные профили", type: "textarea", group: "Конструкция" },
  { key: "foundation", label: "Тип фундамента", type: "select", group: "Конструкция",
    options: ["Не определён", "Столбчатый", "Ленточный", "Свайный", "Монолитная плита", "Существующий"] },
  { key: "loads", label: "Нагрузки и условия эксплуатации", type: "textarea", group: "Условия" },
  { key: "climate", label: "Климатические условия (снеговой, ветровой район)", type: "text", group: "Условия" },
  { key: "appearance", label: "Требования к внешнему виду", type: "textarea", group: "Внешний вид" },
  { key: "coating", label: "Покрытие и цвет", type: "text", group: "Внешний вид" },
  { key: "deliverables", label: "Необходимые результаты проектирования", type: "textarea", required: true, group: "Результат",
    hint: "КМ, КМД, 3D-модель (IFC), спецификации, ведомости…" },
  { key: "deadline", label: "Желаемый срок", type: "date", group: "Сроки и бюджет" },
  { key: "budget", label: "Бюджетный диапазон", type: "text", group: "Сроки и бюджет" },
  { key: "comments", label: "Комментарии", type: "textarea", group: "Прочее" },
];

export type SpecData = Record<string, string>;

export function missingRequired(data: SpecData): SpecField[] {
  return SPEC_FIELDS.filter((f) => f.required && !(data[f.key] ?? "").trim());
}

export function diffSpec(prev: SpecData, next: SpecData): string[] {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  return [...keys].filter((k) => (prev[k] ?? "").trim() !== (next[k] ?? "").trim());
}

export function sanitizeSpec(input: Record<string, unknown>): SpecData {
  const out: SpecData = {};
  for (const f of SPEC_FIELDS) {
    const v = input[f.key];
    if (typeof v === "string") out[f.key] = v.slice(0, 5000).trim();
  }
  return out;
}

export function checksum(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

/** Подстановка {{переменных}} в шаблон документа. Отсутствующие значения — «________». */
export function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v === null || v === undefined || v === "" ? "________" : String(v);
  });
}

export function templateVariables(template: string): string[] {
  return [...new Set([...template.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map((m) => m[1]))];
}
