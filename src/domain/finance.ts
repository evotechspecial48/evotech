// Финансовая модель директора по месяцам (по таблице учёта компании), ₽.

export const FINANCE_RULES = {
  /** Руководитель проектов: 10% от выручки, но не менее 50 000. */
  pmRate: 0.1,
  pmMin: 50_000,
  /** Менеджер проектов: оклад 30 000 + 3% от подписанных им договоров (без редакций). */
  managerSalary: 30_000,
  managerRate: 0.03,
  /** АУСН «доходы» — 8%, ориентировочно от выручки подписанных договоров. */
  taxRate: 0.08,
};

export interface FinanceInput {
  revenue: number;
  designers: number;
  /** База бонуса по каждому менеджеру проектов: сумма его договоров месяца без редакций. */
  managerBases: number[];
  sro: number;
  ads: number;
  adsPlatforms: number;
  other: number;
}

export interface FinanceRow extends FinanceInput {
  pm: number;
  managers: number;
  tax: number;
  profit: number;
}

export function computeFinance(i: FinanceInput, rules = FINANCE_RULES): FinanceRow {
  const pm = Math.round(Math.max(i.revenue * rules.pmRate, rules.pmMin));
  const managers = Math.round(i.managerBases.reduce((s, base) => s + rules.managerSalary + base * rules.managerRate, 0));
  const tax = Math.round(i.revenue * rules.taxRate);
  const profit = i.revenue - i.designers - pm - managers - tax - i.sro - i.ads - i.adsPlatforms - i.other;
  return { ...i, pm, managers, tax, profit };
}
