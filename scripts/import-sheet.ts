// Импорт таблицы учёта (Google Таблицы → CSV) за октябрь 2026:
//   data/import/october-contracts.csv — вкладка «Октябрь»: договоры в работе → проекты
//   data/import/leads-journal.csv     — журнал обращений: строки до разделителя «Сентябрь» → заявки
// Повторный запуск безопасен: уже импортированные записи пропускаются.
// Клиентам письма не отправляются, их учётные записи создаются в статусе «приглашён» без пароля.
// Запуск: npm run import:sheet

import { readFileSync } from "node:fs";
import type { LeadSource, LeadStatus, Prisma, Role } from "@prisma/client";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import { checksum, renderTemplate } from "../src/domain/spec";
import { createProjectTx } from "../src/services/projects";
import { CONTRACT_TEMPLATE } from "../prisma/templates";

const IMPORT_TAG = "sheet-2026-10";
const STAFF_PASSWORD = process.env.IMPORT_STAFF_PASSWORD ?? "Demo2026!";

// ---------- CSV ----------

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows.map((r) => r.map((v) => v.replace(/\s+/g, " ").trim()));
}

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const isMessenger = (v: string) => /^(макс|max|тг|телега|telegram|whatsapp)$/i.test(v);

function phone(v: string): string | null {
  const d = v.replace(/\D/g, "");
  if (d.length === 10) return `+7${d}`;
  if (d.length === 11 && (d[0] === "7" || d[0] === "8")) return `+7${d.slice(1)}`;
  return null;
}

/** «1 086 000» → 1086000; «80000+2400» → 82400; «2100(200р/т откат)» → 2100. */
function money(v: string): number | null {
  if (!v) return null;
  const plus = v.split("+").map((p) => Number((p.match(/[\d\s]+/)?.[0] ?? "").replace(/\s/g, "")));
  const sum = plus.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
  return sum > 0 ? sum : null;
}

function translit(s: string): string {
  const map: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ы: "y", э: "e", ю: "yu", я: "ya" };
  return s
    .toLowerCase()
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

const normName = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[«»"()]/g, "").replace(/\s+/g, " ").trim();

// ---------- Сотрудники ----------

// Список сотрудников с контактами хранится вне репозитория: data/import/staff.json
// [{ "name": "...", "role": "DIRECTOR|PROJECT_MANAGER|SALES_MANAGER", "phone": "+7...", "position": "...", "login": "латиницей" }]
const STAFF: { name: string; role: Role; phone: string; position: string; login: string }[] = JSON.parse(readFileSync("data/import/staff.json", "utf8"));

async function upsertStaff() {
  const passwordHash = await hashPassword(STAFF_PASSWORD);
  const result: Record<string, string> = {};
  for (const s of STAFF) {
    const email = `${s.login}@evotech.local`;
    const u = await db.user.upsert({
      where: { email },
      create: { email, name: s.name, role: s.role, phone: s.phone, position: s.position, passwordHash, emailVerifiedAt: new Date() },
      update: { name: s.name, role: s.role, phone: s.phone, position: s.position },
    });
    result[s.role] = u.id;
  }
  return result as Record<"DIRECTOR" | "PROJECT_MANAGER" | "SALES_MANAGER", string>;
}

/** Исполнитель из таблицы → проектировщик (учётная запись без пароля до приглашения). */
async function designer(name: string): Promise<string | null> {
  const clean = name.trim();
  if (!clean) return null;
  const email = `designer-${translit(clean)}@evotech.local`;
  const u = await db.user.upsert({ where: { email }, create: { email, name: clean, role: "DESIGNER", status: "INVITED", position: "Исполнитель (из таблицы учёта)" }, update: {} });
  return u.id;
}

/** Заказчик: по почте из таблицы или служебная почта по названию организации. */
async function customer(name: string, emailRaw: string, phoneRaw: string): Promise<{ id: string; email: string }> {
  const email = isEmail(emailRaw) ? emailRaw.toLowerCase() : `client-${translit(name) || "noname"}@import.local`;
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { id: existing.id, email };
  const u = await db.user.create({
    data: { email, name, role: "CUSTOMER", status: "INVITED", phone: phone(phoneRaw), company: /^(ООО|ИП|АО|ПАО|СП|ЗАО)\b/i.test(name) ? { create: { name } } : undefined },
  });
  return { id: u.id, email };
}

// ---------- Проекты (вкладка «Октябрь») ----------

interface ContractRow {
  row: number;
  client: string;
  number: string;
  scope: string;
  amount: number;
  email: string;
  phone: string;
  days: number;
  deadline: string;
  fee: number | null;
  advance: number | null;
  executor: string;
}

function readContracts(): ContractRow[] {
  const rows = parseCsv(readFileSync("data/import/october-contracts.csv", "utf8"));
  // Заголовок — третья строка: ФИО | № Договора | ТЗ | Оценка | Телефон | Почта | Срок | Дата сдачи | Стоимость | Зарплата | Аванс | Исполнитель
  return rows
    .slice(3)
    .map((r, i) => ({
      row: i + 4,
      client: r[0],
      number: r[1],
      scope: r[2],
      amount: money(r[8]) ?? money(r[3]) ?? 0,
      phone: r[4],
      email: r[5],
      days: Number(r[6]) || 10,
      deadline: r[7],
      fee: money(r[9]),
      advance: money(r[10]),
      executor: r[11],
    }))
    .filter((r) => r.client);
}

function contractNumber(raw: string, client: string): string {
  const base = raw.replace(/\s+/g, " ").trim();
  // «спец 3» без номера основного договора — добавляем заказчика для уникальности
  return /^\d/.test(base) ? `Д-${base}` : `Д-${base} · ${client}`;
}

/** Дата начала по дате сдачи «23.10» и сроку в рабочих днях (без даты — таймер не запускается). */
function startFromDeadline(deadline: string, days: number): Date | null {
  const m = deadline.match(/^(\d{1,2})\.(\d{1,2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(2026, Number(m[2]) - 1, Number(m[1]), 6));
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}

const SCOPE_TYPE: [RegExp, string][] = [
  [/МАФ/i, "Малая архитектурная форма"],
  [/редакц/i, "Корректировка документации"],
  [/КЖ/i, "Железобетонные конструкции"],
  [/КМ|КМД/i, "Металлоконструкции"],
];

async function importProjects(staff: Awaited<ReturnType<typeof upsertStaff>>) {
  const tpl = await db.documentTemplate.findFirst({ where: { kind: "CONTRACT", active: true } });
  let created = 0;
  let skipped = 0;
  const byClient = new Map<string, string>(); // нормализованный клиент → id проекта (для связи с заявками)
  const byNumber = new Map<string, string>();
  for (const r of readContracts()) {
    const number = contractNumber(r.number, r.client);
    const existing = await db.contract.findUnique({ where: { number } });
    if (existing) {
      skipped++;
      if (existing.projectId) {
        byClient.set(normName(r.client), existing.projectId);
        byNumber.set(r.number.replace(/s+/g, " ").trim(), existing.projectId);
      }
      continue;
    }
    const cust = await customer(r.client, r.email, r.phone);
    const designerId = await designer(r.executor);
    const startedAt = startFromDeadline(r.deadline, r.days);
    const objectType = SCOPE_TYPE.find(([re]) => re.test(r.scope))?.[1] ?? "Проектирование";
    const title = `${r.scope} — ${r.client}`;
    const body = renderTemplate(tpl?.body ?? CONTRACT_TEMPLATE, {
      number,
      date: "01.10.2026",
      city: "Липецк",
      executorName: "ООО «ЭвоТехнолоджи»",
      customerName: r.client,
      customerContact: r.client,
      customerEmail: cust.email,
      subject: title,
      amount: r.amount.toLocaleString("ru-RU"),
      termDays: String(r.days),
    });
    const project = await db.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          title,
          contactName: r.client,
          email: cust.email,
          phone: phone(r.phone),
          companyName: r.client,
          objectType,
          budget: `${r.amount.toLocaleString("ru-RU")} ₽`,
          status: "won",
          source: "manual",
          utm: { import: IMPORT_TAG, sheet: "Октябрь", row: r.row } as Prisma.InputJsonValue,
          managerId: staff.SALES_MANAGER,
          customerId: cust.id,
          createdAt: new Date("2026-10-01T09:00:00+03:00"),
        },
      });
      const p = await createProjectTx(
        tx,
        { title, customerId: cust.id, leadId: lead.id, managerId: staff.PROJECT_MANAGER, salesManagerId: staff.SALES_MANAGER, objectType, description: `Импорт из таблицы учёта (вкладка «Октябрь», строка ${r.row}).${r.deadline ? ` Дата сдачи по таблице: ${r.deadline}.` : " Даты начала и сдачи в таблице нет — таймер не запущен."}`, durationDays: r.days, startedAt, briefApproved: true },
        staff.PROJECT_MANAGER,
      );
      await tx.contract.create({
        data: {
          number,
          status: "SIGNED",
          signedAt: startedAt ?? new Date("2026-10-01T09:00:00+03:00"),
          customerId: cust.id,
          amount: r.amount,
          termDays: r.days,
          leadId: lead.id,
          projectId: p.id,
          versions: { create: { version: 1, body, checksum: checksum(body), templateId: tpl?.id, createdById: staff.SALES_MANAGER } },
        },
      });
      if (designerId) {
        await tx.projectMember.create({ data: { projectId: p.id, userId: designerId, fee: r.fee, advance: r.advance } });
        await tx.projectStage.updateMany({ where: { projectId: p.id, code: "sketch" }, data: { assigneeId: designerId } });
      }
      await tx.auditEvent.create({ data: { actorId: staff.DIRECTOR, action: "project.create", entityType: "Project", entityId: p.id, projectId: p.id, meta: { import: IMPORT_TAG, row: r.row } } });
      return p;
    });
    byClient.set(normName(r.client), project.id);
    byNumber.set(r.number.replace(/s+/g, " ").trim(), project.id);
    created++;
  }
  return { created, skipped, byClient, byNumber };
}

// ---------- Заявки (журнал обращений) ----------

interface LeadRow {
  row: number;
  name: string;
  contract: string;
  scope: string;
  estimate: string;
  source: string;
  phone: string;
  contact: string;
  days: string;
  status: string;
  note: string;
}

function readLeads(): LeadRow[] {
  const rows = parseCsv(readFileSync("data/import/leads-journal.csv", "utf8"));
  const out: LeadRow[] = [];
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    if (r.filter(Boolean).length === 1 && /сентябр/i.test(r.join(""))) break; // дальше — предыдущие месяцы
    if (!r[0]) continue;
    // Колонки «Телефон / Почта / Срок» в части строк сдвинуты — классифицируем ячейки по содержимому
    const cells = r.slice(5, 9);
    const phoneCell = cells.find((v) => phone(v)) ?? "";
    const contact = cells.find((v) => isEmail(v) || isMessenger(v) || /\.[a-z]{2,}$/i.test(v)) ?? "";
    const days = r.slice(6, 9).find((v) => v && v !== phoneCell && v !== contact && /^[\d\s?–-]+$/.test(v) && Number(v.split(/[-–]/)[0]) < 200) ?? "";
    const source = /^(авито|сайт|постоянник)$/i.test(r[4]) ? r[4] : "";
    out.push({ row: i + 1, name: r[0], contract: r[1], scope: r[2], estimate: r[3], source, phone: phoneCell || (phone(r[4]) ? r[4] : ""), contact, days, status: r[10] ?? "", note: r[11] ?? "" });
  }
  return out;
}

const LOST = /дорого|игнор|не актуал|не будут|не дали|не выиграл|выбрали|не взяли|отказ/i;
const WAITING = /писал|жд[уёе]|рассмотр|отправил/i;

async function importLeads(staff: Awaited<ReturnType<typeof upsertStaff>>, projects: { byClient: Map<string, string>; byNumber: Map<string, string> }) {
  let created = 0;
  let skipped = 0;
  let linked = 0;
  for (const r of readLeads()) {
    const already = await db.lead.findFirst({ where: { AND: [{ utm: { path: ["sheet"], equals: "Журнал" } }, { utm: { path: ["row"], equals: r.row } }] } });
    if (already) {
      skipped++;
      continue;
    }
    // Связь с проектом: точное совпадение номера договора, а без номера — совпадение заказчика
    const projectId = r.contract ? projects.byNumber.get(r.contract) : projects.byClient.get(normName(r.name));
    if (projectId) {
      // Обращение уже стало проектом — дополняем заявку проекта данными из журнала, дубль не создаём
      const project = await db.project.findUnique({ where: { id: projectId }, select: { leadId: true } });
      if (project?.leadId) {
        const lead = await db.lead.findUniqueOrThrow({ where: { id: project.leadId } });
        await db.lead.update({
          where: { id: lead.id },
          data: {
            source: /авито/i.test(r.source) ? "avito" : lead.source,
            phone: lead.phone ?? phone(r.phone),
            // Сведения из журнала добавляются один раз (повторный импорт перезаписывает, а не дописывает)
            description: `${(lead.description ?? "").replace(/\s*Журнал обращений, строка[\s\S]*$/, "")} Журнал обращений, строка ${r.row}: оценка ${r.estimate || "—"}, срок ${r.days || "—"} раб. дн.`.trim(),
            utm: { ...(lead.utm as object), journalRow: r.row } as Prisma.InputJsonValue,
          },
        });
        linked++;
      }
      continue;
    }
    const email = isEmail(r.contact) ? r.contact.toLowerCase() : isEmail(r.name.split(" ")[0]) ? r.name.split(" ")[0] : null;
    const amount = money(r.estimate);
    const perTon = amount !== null && amount < 10000;
    const statusText = [r.status, r.note].filter(Boolean).join("; ");
    const status: LeadStatus = LOST.test(statusText) ? "lost" : r.contract ? "awaiting_signature" : WAITING.test(statusText) || amount ? "commercial_offer" : "qualification";
    const source: LeadSource = /авито/i.test(r.source) ? "avito" : "manual";
    const description = [
      `Импорт из таблицы учёта (журнал обращений, строка ${r.row}).`,
      r.contract && `Номер договора в таблице: ${r.contract}.`,
      /d/.test(r.days) && `Срок: ${r.days} раб. дн.`,
      isMessenger(r.contact) && `Связь: ${r.contact.toUpperCase() === "МАКС" ? "мессенджер MAX" : "Telegram"}.`,
      r.estimate && `Оценка: ${r.estimate}${perTon ? " ₽/т" : " ₽"}.`,
      statusText && `Статус в таблице: ${statusText}.`,
    ]
      .filter(Boolean)
      .join(" ");
    const lead = await db.lead.create({
      data: {
        title: `${r.scope || "Проектирование"} — ${r.name}`.slice(0, 200),
        contactName: r.name.slice(0, 120),
        email: email ?? `no-email-row${r.row}@import.local`,
        phone: phone(r.phone),
        companyName: /^(ООО|ИП|АО|ПАО|СП|ЗАО)\b/i.test(r.name) ? r.name : null,
        objectType: SCOPE_TYPE.find(([re]) => re.test(r.scope))?.[1] ?? null,
        description,
        budget: r.estimate ? `${r.estimate}${perTon ? " ₽/т" : " ₽"}` : null,
        status,
        lostReason: status === "lost" ? statusText : null,
        source,
        utm: { import: IMPORT_TAG, sheet: "Журнал", row: r.row, ...(source === "avito" ? { utm_source: "avito" } : {}) } as Prisma.InputJsonValue,
        managerId: staff.SALES_MANAGER,
        createdAt: new Date("2026-10-01T09:00:00+03:00"),
        spec: { create: { data: { objectName: r.name, purpose: r.scope } } },
      },
    });
    await db.statusChange.create({ data: { entityType: "Lead", entityId: lead.id, toStatus: status, actorId: staff.SALES_MANAGER, comment: "Импорт из таблицы учёта" } });
    if (amount && !perTon) {
      await db.commercialOffer.create({
        data: { leadId: lead.id, items: [{ title: r.scope || "Проектирование", qty: 1, unit: "компл.", price: amount }], total: amount, termDays: Number(r.days) || 10, validUntil: new Date("2026-11-01"), status: "SENT", createdById: staff.SALES_MANAGER, notes: "Оценка из таблицы учёта" },
      });
    }
    created++;
  }
  return { created, skipped, linked };
}

async function main() {
  if (process.argv.includes("--dry")) {
    console.table(readContracts().map((r) => ({ row: r.row, client: r.client.slice(0, 28), number: contractNumber(r.number, r.client), amount: r.amount, days: r.days, fee: r.fee, executor: r.executor })));
    console.table(readLeads().map((r) => ({ row: r.row, name: r.name.slice(0, 26), contract: r.contract, est: r.estimate, src: r.source, phone: r.phone, contact: r.contact.slice(0, 22), days: r.days, status: r.status.slice(0, 24) })));
    return;
  }
  const staff = await upsertStaff();
  const projects = await importProjects(staff);
  const leads = await importLeads(staff, projects);
  console.log(JSON.stringify({ staff: Object.keys(staff).length, projects: { created: projects.created, skipped: projects.skipped }, leads }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
