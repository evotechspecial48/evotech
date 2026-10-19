// Параметрический эскиз конструкции в SVG: фасад и план с размерами.
// Используется и демонстрационным, и Claude-провайдером (модель задаёт параметры, отрисовка — здесь).

import type { QuickOrderParams, StructureTypeT } from "@/domain/quick-order";
import { COVERINGS, ROOF_TYPES } from "@/domain/quick-order";

export interface VariantGeometry {
  columnStep: number; // шаг колонн, м
  roofSlopeDeg: number;
  columnProfile: string;
  beamProfile: string;
  purlinStep: number; // шаг прогонов, м
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const f = (n: number) => (Math.round(n * 10) / 10).toString();

export function renderSketchSvg(
  type: StructureTypeT,
  p: QuickOrderParams,
  g: VariantGeometry,
  title: string,
  label: string,
): string {
  const W = 960;
  const H = 600;
  const ink = "#1f2a37";
  const accent = "#1d5fa8";
  const muted = "#7b8794";

  // --- Фасад ---
  const fx = 60;
  const fy = 70;
  const fw = 520;
  const fh = 300;
  const rise = p.roofType === "flat" ? 0 : p.roofType === "arched" ? p.width * 0.25 : Math.tan((g.roofSlopeDeg * Math.PI) / 180) * (p.roofType === "gable" ? p.width / 2 : p.width);
  const totalH = p.height + rise;
  const scale = Math.min(fw / p.length, fh / (totalH * 1.1));
  const groundY = fy + fh;
  const X = (m: number) => fx + m * scale;
  const Y = (m: number) => groundY - m * scale;

  const cols: number[] = [];
  const spans = Math.max(1, Math.round(p.length / g.columnStep));
  for (let i = 0; i <= spans; i++) cols.push((p.length / spans) * i);

  const parts: string[] = [];
  parts.push(`<rect width="${W}" height="${H}" fill="#f7f9fb"/>`);
  // сетка «миллиметровки»
  parts.push(`<defs><pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#e3e8ee" stroke-width="1"/></pattern></defs>`);
  parts.push(`<rect x="20" y="20" width="${W - 40}" height="${H - 40}" fill="url(#g)" stroke="${ink}" stroke-width="1.5"/>`);
  parts.push(`<text x="${fx}" y="${fy - 25}" font-size="15" font-weight="600" fill="${ink}">Фасад (вдоль длины)</text>`);
  parts.push(`<line x1="${fx - 20}" y1="${groundY}" x2="${fx + fw + 20}" y2="${groundY}" stroke="${muted}" stroke-width="2" stroke-dasharray="8 4"/>`);
  for (const c of cols) {
    parts.push(`<line x1="${X(c)}" y1="${groundY}" x2="${X(c)}" y2="${Y(p.height)}" stroke="${ink}" stroke-width="5"/>`);
  }
  // Балка / кровля по фасаду: высота конька видна как верхняя линия
  const ridge = p.roofType === "single" ? p.height + rise : p.height + rise;
  parts.push(`<line x1="${X(0)}" y1="${Y(p.height)}" x2="${X(p.length)}" y2="${Y(p.height)}" stroke="${accent}" stroke-width="4"/>`);
  if (rise > 0) {
    parts.push(`<line x1="${X(0)}" y1="${Y(ridge)}" x2="${X(p.length)}" y2="${Y(ridge)}" stroke="${accent}" stroke-width="2.5"/>`);
    parts.push(`<line x1="${X(0)}" y1="${Y(p.height)}" x2="${X(0)}" y2="${Y(ridge)}" stroke="${accent}" stroke-width="2"/>`);
    parts.push(`<line x1="${X(p.length)}" y1="${Y(p.height)}" x2="${X(p.length)}" y2="${Y(ridge)}" stroke="${accent}" stroke-width="2"/>`);
  }
  // размер длины
  const dy = groundY + 32;
  parts.push(`<line x1="${X(0)}" y1="${dy}" x2="${X(p.length)}" y2="${dy}" stroke="${ink}" marker-start="url(#a)" marker-end="url(#a)"/>`);
  parts.push(`<text x="${(X(0) + X(p.length)) / 2}" y="${dy - 6}" font-size="13" text-anchor="middle" fill="${ink}">${f(p.length)} м (шаг колонн ${f(p.length / spans)} м)</text>`);
  // размер высоты
  const dx = X(p.length) + 30;
  parts.push(`<line x1="${dx}" y1="${groundY}" x2="${dx}" y2="${Y(p.height)}" stroke="${ink}"/>`);
  parts.push(`<text x="${dx + 6}" y="${(groundY + Y(p.height)) / 2}" font-size="13" fill="${ink}">H=${f(p.height)} м</text>`);
  if (rise > 0) parts.push(`<text x="${dx + 6}" y="${Y(ridge) + 4}" font-size="13" fill="${accent}">конёк ${f(ridge)} м</text>`);

  // --- Поперечный разрез ---
  const sx = 640;
  const sw = 260;
  const sScale = Math.min(sw / p.width, 220 / (totalH * 1.1));
  const sGround = fy + 260;
  const SX = (m: number) => sx + m * sScale;
  const SY = (m: number) => sGround - m * sScale;
  parts.push(`<text x="${sx}" y="${fy - 25}" font-size="15" font-weight="600" fill="${ink}">Поперечный разрез</text>`);
  parts.push(`<line x1="${sx - 10}" y1="${sGround}" x2="${sx + sw + 10}" y2="${sGround}" stroke="${muted}" stroke-width="2" stroke-dasharray="8 4"/>`);
  const leftH = p.height;
  const rightH = p.roofType === "single" ? p.height + rise : p.height;
  parts.push(`<line x1="${SX(0)}" y1="${sGround}" x2="${SX(0)}" y2="${SY(leftH)}" stroke="${ink}" stroke-width="5"/>`);
  if (!p.attachedToBuilding || type !== "CANOPY") {
    parts.push(`<line x1="${SX(p.width)}" y1="${sGround}" x2="${SX(p.width)}" y2="${SY(rightH)}" stroke="${ink}" stroke-width="5"/>`);
  } else {
    parts.push(`<rect x="${SX(p.width)}" y="${SY(rightH + 0.6)}" width="16" height="${sGround - SY(rightH + 0.6)}" fill="#cbd2d9" stroke="${ink}"/>`);
  }
  let roof: string;
  if (p.roofType === "gable") roof = `M${SX(0)} ${SY(leftH)} L${SX(p.width / 2)} ${SY(p.height + rise)} L${SX(p.width)} ${SY(rightH)}`;
  else if (p.roofType === "arched") roof = `M${SX(0)} ${SY(leftH)} Q${SX(p.width / 2)} ${SY(p.height + rise * 2)} ${SX(p.width)} ${SY(rightH)}`;
  else roof = `M${SX(0)} ${SY(leftH)} L${SX(p.width)} ${SY(rightH)}`;
  parts.push(`<path d="${roof}" fill="none" stroke="${accent}" stroke-width="5" stroke-linejoin="round"/>`);
  parts.push(`<line x1="${SX(0)}" y1="${sGround + 28}" x2="${SX(p.width)}" y2="${sGround + 28}" stroke="${ink}"/>`);
  parts.push(`<text x="${(SX(0) + SX(p.width)) / 2}" y="${sGround + 22}" font-size="13" text-anchor="middle" fill="${ink}">${f(p.width)} м</text>`);
  if (p.roofType !== "flat") {
    parts.push(`<text x="${SX(p.width / 2)}" y="${SY(p.height + rise) - 12}" font-size="12" text-anchor="middle" fill="${accent}">${p.roofType === "arched" ? "арка" : `уклон ${f(g.roofSlopeDeg)}°`}</text>`);
  }

  // --- План ---
  const px = 640;
  const py = 400;
  const pw = 260;
  const pScale = Math.min(pw / p.length, 110 / p.width);
  parts.push(`<text x="${px}" y="${py - 12}" font-size="15" font-weight="600" fill="${ink}">План колонн</text>`);
  parts.push(`<rect x="${px}" y="${py}" width="${p.length * pScale}" height="${p.width * pScale}" fill="#e8f0f9" stroke="${accent}" stroke-width="2"/>`);
  for (const c of cols) {
    for (const r of [0, p.width]) {
      if (r === p.width && p.attachedToBuilding && type === "CANOPY") continue;
      parts.push(`<rect x="${px + c * pScale - 4}" y="${py + r * pScale - 4}" width="8" height="8" fill="${ink}"/>`);
    }
  }

  // --- Штамп ---
  const area = p.length * p.width;
  const stampY = 420;
  const lines = [
    `${esc(title)}`,
    `Вариант: ${esc(label)}`,
    `Габариты: ${f(p.length)} × ${f(p.width)} м, H = ${f(p.height)} м, S = ${f(area)} м²`,
    `Кровля: ${ROOF_TYPES[p.roofType]}, ${COVERINGS[p.covering].toLowerCase()}`,
    `Колонны: ${esc(g.columnProfile)}; балки: ${esc(g.beamProfile)}`,
    `Шаг прогонов: ${f(g.purlinStep)} м · Снеговой район: ${p.snowDistrict}`,
  ];
  parts.push(`<rect x="${fx - 20}" y="${stampY}" width="540" height="150" fill="#ffffff" stroke="${ink}"/>`);
  lines.forEach((l, i) => {
    parts.push(`<text x="${fx - 8}" y="${stampY + 24 + i * 21}" font-size="${i === 0 ? 15 : 13}" font-weight="${i === 0 ? 600 : 400}" fill="${ink}">${l}</text>`);
  });
  parts.push(`<text x="${W - 30}" y="${H - 30}" font-size="11" text-anchor="end" fill="${muted}">EvoTechnology · демонстрационный эскиз, не для строительства</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Arial, sans-serif" role="img" aria-label="${esc(title)} — ${esc(label)}"><defs><marker id="a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${ink}"/></marker></defs>${parts.join("")}</svg>`;
}
