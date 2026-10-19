// Сборка итогового пакета документации быстрого заказа (одинаково для mock и Claude):
// эскизы, визуализация, 3D-модель (IFC4), чертежи (PDF), спецификации, ведомости, пояснительная записка.

import { rgb } from "pdf-lib";
import { COVERINGS, FOUNDATIONS, FRAMES, ROOF_TYPES } from "@/domain/quick-order";
import { STRUCTURE_TYPE } from "@/domain/labels";
import { createPdf } from "../pdf";
import type { PackageFile, PackageRequest } from "./provider";

// Погонная масса профилей, кг/м (справочные значения для демонстрации)
const PROFILE_MASS: Record<string, number> = {
  "Труба 80×80×3": 7.07,
  "Труба 100×100×4": 11.73,
  "Труба 120×120×5": 17.7,
  "Труба 60×40×3": 4.25,
  "Труба 80×60×3": 6.13,
  "Двутавр 14Б1": 12.9,
  "Двутавр 20Б1": 22.4,
  "Швеллер 16П": 14.2,
};
const massOf = (profile: string) => PROFILE_MASS[profile] ?? 10;

export function steelSchedule(req: PackageRequest) {
  const { params: p, variant } = req;
  const g = variant.geometry;
  const spans = Math.max(1, Math.round(p.length / g.columnStep));
  const rows = p.attachedToBuilding && req.structureType === "CANOPY" ? 1 : 2;
  const columns = (spans + 1) * rows;
  const purlins = Math.max(2, Math.ceil(p.width / g.purlinStep) + 1);
  const rafters = spans + 1;
  const rafterLen = p.roofType === "flat" ? p.width : p.width / Math.cos((g.roofSlopeDeg * Math.PI) / 180);
  const items = [
    { mark: "К-1", name: "Колонна", profile: g.columnProfile, qty: columns, len: p.height },
    { mark: "Б-1", name: "Балка продольная", profile: g.beamProfile, qty: rows, len: p.length },
    { mark: "Ст-1", name: "Стропильная балка", profile: g.beamProfile, qty: rafters, len: rafterLen },
    { mark: "П-1", name: "Прогон", profile: "Труба 60×40×3", qty: purlins, len: p.length },
  ];
  return items.map((i) => ({ ...i, mass: Math.round(i.qty * i.len * massOf(i.profile)) }));
}

function csv(rows: (string | number)[][]): string {
  // BOM для корректного открытия в Excel
  return "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
}

function ifcModel(req: PackageRequest): string {
  const items = steelSchedule(req);
  const lines = [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');",
    `FILE_NAME('model.ifc','${new Date().toISOString()}',('EvoTechnology'),('EvoTechnology'),'','EvoTechnology demo','');`,
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
    "#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'Быстрый заказ " + req.orderNumber + "',$,$,$,$,$,$);",
  ];
  let id = 10;
  for (const it of items) {
    const kind = it.mark.startsWith("К") ? "IFCCOLUMN" : "IFCBEAM";
    for (let n = 0; n < it.qty; n++) {
      lines.push(`#${id++}=${kind}('${(it.mark + n).padEnd(22, "x").slice(0, 22)}',$,'${it.mark}-${n + 1} ${it.profile}',$,$,$,$,$,$);`);
    }
  }
  lines.push("ENDSEC;", "END-ISO-10303-21;");
  return lines.join("\n");
}

async function drawingsPdf(req: PackageRequest): Promise<Buffer> {
  const pdf = await createPdf(`Чертежи — заказ ${req.orderNumber}`);
  const { params: p, variant } = req;
  pdf.heading("Лист 1. Общий вид (схема расположения колонн)");
  const page = pdf.page();
  const ox = 80;
  const oy = 360;
  const scale = Math.min(420 / p.length, 260 / p.width);
  const ink = rgb(0.12, 0.16, 0.22);
  const blue = rgb(0.11, 0.37, 0.66);
  page.drawRectangle({ x: ox, y: oy, width: p.length * scale, height: p.width * scale, borderColor: blue, borderWidth: 1.5 });
  const spans = Math.max(1, Math.round(p.length / variant.geometry.columnStep));
  for (let i = 0; i <= spans; i++) {
    const x = ox + (p.length / spans) * i * scale;
    for (const yy of [oy, oy + p.width * scale]) page.drawRectangle({ x: x - 4, y: yy - 4, width: 8, height: 8, color: ink });
    page.drawText(String(i + 1), { x: x - 3, y: oy - 22, size: 9, font: pdf.regular, color: ink });
  }
  page.drawText(`${p.length} м`, { x: ox + (p.length * scale) / 2 - 12, y: oy - 40, size: 10, font: pdf.regular, color: ink });
  page.drawText(`${p.width} м`, { x: ox + p.length * scale + 10, y: oy + (p.width * scale) / 2, size: 10, font: pdf.regular, color: ink });
  pdf.spacer(330);
  pdf.paragraph(`Вариант: ${variant.title}. Колонны: ${variant.geometry.columnProfile}, балки: ${variant.geometry.beamProfile}, шаг прогонов ${variant.geometry.purlinStep} м.`);
  pdf.paragraph("Демонстрационный лист. Рабочие чертежи КМ/КМД выпускаются проектировщиком после подключения генерации документации (этап 3).");
  return pdf.save();
}

async function notePdf(req: PackageRequest, explanatory: string): Promise<Buffer> {
  const pdf = await createPdf(`Пояснительная записка — заказ ${req.orderNumber}`);
  const p = req.params;
  pdf.heading(`Пояснительная записка к заказу ${req.orderNumber}`);
  pdf.paragraph(`Объект: ${STRUCTURE_TYPE[req.structureType]}. Регион строительства: ${p.region}.`);
  pdf.paragraph(`Габариты: ${p.length} × ${p.width} м, высота ${p.height} м. Кровля: ${ROOF_TYPES[p.roofType]}, покрытие — ${COVERINGS[p.covering]}.`);
  pdf.paragraph(`Каркас: ${FRAMES[p.frame]}. Фундамент: ${FOUNDATIONS[p.foundation]}. Снеговой район: ${p.snowDistrict}. Цвет: ${p.color || "не указан"}.`);
  pdf.heading("Описание принятого решения", 12);
  pdf.paragraph(req.variant.description);
  pdf.heading("Пояснения", 12);
  pdf.paragraph(explanatory);
  return pdf.save();
}

export async function buildPackage(req: PackageRequest, explanatory: string, demo: boolean): Promise<PackageFile[]> {
  const items = steelSchedule(req);
  const total = items.reduce((s, i) => s + i.mass, 0);
  return [
    {
      path: "README.txt",
      content: [
        `Итоговый пакет документации — заказ ${req.orderNumber}`,
        demo ? "ВНИМАНИЕ: пакет сформирован в демонстрационном режиме и не предназначен для строительства." : "",
        "",
        "01_Эскизы — эскиз выбранного варианта (SVG)",
        "02_Визуализации — визуализация (SVG)",
        "03_3D-модель — модель IFC4",
        "04_Чертежи — рабочие чертежи (PDF)",
        "05_Спецификации — спецификация металлопроката (CSV)",
        "06_Ведомости — ведомость расхода стали (CSV)",
        "07_Пояснительная записка (PDF)",
      ].join("\r\n"),
    },
    { path: "01_Эскизы/eskiz.svg", content: req.variant.svg },
    { path: "02_Визуализации/vizualizaciya.svg", content: req.variant.svg.replace("#f7f9fb", "#eef3f8") },
    { path: "03_3D-модель/model.ifc", content: ifcModel(req) },
    { path: "04_Чертежи/chertezhi.pdf", content: await drawingsPdf(req) },
    {
      path: "05_Спецификации/specifikaciya.csv",
      content: csv([["Марка", "Наименование", "Профиль", "Кол-во, шт", "Длина, м", "Масса, кг"], ...items.map((i) => [i.mark, i.name, i.profile, i.qty, i.len.toFixed(2), i.mass])]),
    },
    {
      path: "06_Ведомости/vedomost_rashoda_stali.csv",
      content: csv([["Профиль", "Масса, кг"], ...Object.entries(items.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.profile]: (acc[i.profile] ?? 0) + i.mass }), {})), ["Итого", total]]),
    },
    { path: "07_Пояснительная_записка/poyasnitelnaya.pdf", content: await notePdf(req, explanatory) },
  ];
}
