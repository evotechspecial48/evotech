// Быстрый заказ: параметры по типам конструкций, валидация и расчёт стоимости.
// Цены — демонстрационные значения по умолчанию (см. docs/ASSUMPTIONS.md).

export type StructureTypeT = "CANOPY" | "GARAGE" | "TERRACE" | "GAZEBO" | "HANGAR";

export interface QuickOrderParams {
  length: number; // м
  width: number; // м
  height: number; // м
  roofType: "single" | "gable" | "arched" | "flat";
  covering: "profiled_sheet" | "polycarbonate" | "metal_tile" | "sandwich";
  frame: "profile_pipe" | "i_beam" | "combined";
  foundation: "piles" | "slab" | "columnar" | "existing";
  region: string;
  snowDistrict: "I" | "II" | "III" | "IV" | "V";
  color: string;
  attachedToBuilding: boolean;
  gates?: boolean;
  notes?: string;
}

export const ROOF_TYPES: Record<QuickOrderParams["roofType"], string> = {
  single: "Односкатная",
  gable: "Двускатная",
  arched: "Арочная",
  flat: "Плоская",
};
export const COVERINGS: Record<QuickOrderParams["covering"], string> = {
  profiled_sheet: "Профнастил",
  polycarbonate: "Сотовый поликарбонат",
  metal_tile: "Металлочерепица",
  sandwich: "Сэндвич-панели",
};
export const FRAMES: Record<QuickOrderParams["frame"], string> = {
  profile_pipe: "Профильная труба",
  i_beam: "Двутавр / швеллер",
  combined: "Комбинированный",
};
export const FOUNDATIONS: Record<QuickOrderParams["foundation"], string> = {
  piles: "Винтовые сваи",
  slab: "Монолитная плита",
  columnar: "Столбчатый",
  existing: "Существующее основание",
};

export const STRUCTURE_LIMITS: Record<StructureTypeT, { maxLength: number; maxWidth: number; maxHeight: number; ratePerM2: number; min: number }> = {
  CANOPY: { maxLength: 30, maxWidth: 15, maxHeight: 6, ratePerM2: 450, min: 15000 },
  GARAGE: { maxLength: 15, maxWidth: 12, maxHeight: 5, ratePerM2: 600, min: 25000 },
  TERRACE: { maxLength: 20, maxWidth: 10, maxHeight: 4, ratePerM2: 500, min: 18000 },
  GAZEBO: { maxLength: 8, maxWidth: 8, maxHeight: 4.5, ratePerM2: 900, min: 20000 },
  HANGAR: { maxLength: 60, maxWidth: 24, maxHeight: 10, ratePerM2: 350, min: 40000 },
};

export type ValidationErrors = Partial<Record<keyof QuickOrderParams | "photos", string>>;

export function validateQuickOrder(type: StructureTypeT, p: Partial<QuickOrderParams>): ValidationErrors {
  const e: ValidationErrors = {};
  const lim = STRUCTURE_LIMITS[type];
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  if (!num(p.length) || p.length! <= 0) e.length = "Укажите длину";
  else if (p.length! > lim.maxLength) e.length = `Не более ${lim.maxLength} м для быстрого заказа`;
  if (!num(p.width) || p.width! <= 0) e.width = "Укажите ширину";
  else if (p.width! > lim.maxWidth) e.width = `Не более ${lim.maxWidth} м для быстрого заказа`;
  if (!num(p.height) || p.height! < 2) e.height = "Высота не менее 2 м";
  else if (p.height! > lim.maxHeight) e.height = `Не более ${lim.maxHeight} м для быстрого заказа`;
  if (!p.roofType || !(p.roofType in ROOF_TYPES)) e.roofType = "Выберите тип кровли";
  if (!p.covering || !(p.covering in COVERINGS)) e.covering = "Выберите покрытие";
  if (!p.frame || !(p.frame in FRAMES)) e.frame = "Выберите тип каркаса";
  if (!p.foundation || !(p.foundation in FOUNDATIONS)) e.foundation = "Выберите тип фундамента";
  if (!p.region || p.region.trim().length < 2) e.region = "Укажите регион строительства";
  if (!p.snowDistrict || !["I", "II", "III", "IV", "V"].includes(p.snowDistrict)) e.snowDistrict = "Укажите снеговой район";
  if (type === "TERRACE" && p.roofType === "arched") e.roofType = "Для террасы арочная кровля не предусмотрена";
  return e;
}

/** Стоимость проектирования быстрого заказа, ₽ (округление до 500). */
export function quickOrderPrice(type: StructureTypeT, p: QuickOrderParams, variantDelta = 0): number {
  const lim = STRUCTURE_LIMITS[type];
  const area = p.length * p.width;
  let price = area * lim.ratePerM2;
  if (p.snowDistrict === "IV" || p.snowDistrict === "V") price *= 1.15;
  if (p.attachedToBuilding) price *= 1.1;
  if (p.frame === "combined") price *= 1.1;
  if (p.gates) price += 5000;
  price = Math.max(lim.min, price) + variantDelta;
  return Math.round(price / 500) * 500;
}

// ---------- Калькулятор предварительного расчёта на сайте ----------

export const CALC_WORKS = {
  km: { label: "КМ — конструкции металлические", ratePerTon: 4500 },
  kmd: { label: "КМД — деталировочные чертежи", ratePerTon: 3500 },
  km_kmd: { label: "КМ + КМД", ratePerTon: 7500 },
  model3d: { label: "3D-модель конструкции", ratePerTon: 2500 },
  reverse: { label: "Реверсивный инжиниринг", ratePerTon: 6000 },
} as const;

export type CalcWork = keyof typeof CALC_WORKS;

export function estimateProject(work: CalcWork, tons: number, complexity: 1 | 2 | 3): { min: number; max: number; days: [number, number] } {
  const k = complexity === 1 ? 1 : complexity === 2 ? 1.3 : 1.7;
  const base = Math.max(20000, CALC_WORKS[work].ratePerTon * Math.max(1, tons) * k);
  const round = (v: number) => Math.round(v / 1000) * 1000;
  const days = Math.ceil(5 + Math.sqrt(Math.max(1, tons)) * 2 * k);
  return { min: round(base * 0.85), max: round(base * 1.2), days: [days, Math.ceil(days * 1.4)] };
}
