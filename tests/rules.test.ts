import { describe, expect, it } from "vitest";
import { can, navFor, ROLES } from "@/domain/rbac";
import { canDownloadResult, canPay, canViewLead, canViewProject, canWorkOnProject } from "@/domain/access";
import { checkLeadTransition } from "@/domain/lead";
import { availableActions, checkStageTransition, projectProgress } from "@/domain/stage";
import { canTransitionJob, retryTarget } from "@/domain/ai-job";
import { checkUpload } from "@/domain/files";
import { diffSpec, missingRequired, renderTemplate } from "@/domain/spec";
import { quickOrderPrice, validateQuickOrder } from "@/domain/quick-order";

describe("RBAC", () => {
  it("заказчик не управляет пользователями и не видит аналитику", () => {
    expect(can("CUSTOMER", "users.manage")).toBe(false);
    expect(can("CUSTOMER", "analytics.view")).toBe(false);
    expect(can("CUSTOMER", "contracts.accept")).toBe(true);
  });
  it("проектировщик не видит заявки и финансы", () => {
    expect(can("DESIGNER", "leads.view_all")).toBe(false);
    expect(can("DESIGNER", "payments.view_all")).toBe(false);
  });
  it("директор имеет административные права", () => {
    expect(can("DIRECTOR", "timer.delete_pause")).toBe(true);
    expect(can("PROJECT_MANAGER", "timer.delete_pause")).toBe(false);
  });
  it("меню формируется по роли", () => {
    const designerMenu = navFor("DESIGNER").map((i) => i.href);
    expect(designerMenu).not.toContain("/cabinet/leads");
    expect(designerMenu).not.toContain("/cabinet/users");
    expect(navFor("DIRECTOR").length).toBeGreaterThan(designerMenu.length);
    for (const r of ROLES) expect(navFor(r).some((i) => i.href === "/cabinet")).toBe(true);
  });
});

describe("Изоляция данных", () => {
  const project = { customerId: "c1", managerId: "pm1", salesManagerId: "s1", memberIds: ["d1"] };
  it("заказчик видит только свой проект", () => {
    expect(canViewProject({ id: "c1", role: "CUSTOMER" }, project)).toBe(true);
    expect(canViewProject({ id: "c2", role: "CUSTOMER" }, project)).toBe(false);
  });
  it("проектировщик — только назначенные", () => {
    expect(canViewProject({ id: "d1", role: "DESIGNER" }, project)).toBe(true);
    expect(canViewProject({ id: "d2", role: "DESIGNER" }, project)).toBe(false);
    expect(canWorkOnProject({ id: "d2", role: "DESIGNER" }, project)).toBe(false);
  });
  it("заявки заказчика изолированы", () => {
    expect(canViewLead({ id: "c1", role: "CUSTOMER" }, { customerId: "c2", managerId: null })).toBe(false);
    expect(canViewLead({ id: "d1", role: "DESIGNER" }, { customerId: "c2", managerId: null })).toBe(false);
  });
});

describe("Оплата и скачивание результата", () => {
  it("оплата недоступна до подтверждения договора", () => {
    const r = canPay({ contractStatus: "AWAITING_SIGNATURE", acceptedVersion: null, currentVersion: 1, alreadyPaid: false });
    expect(r.ok).toBe(false);
  });
  it("оплата недоступна, если подтверждена старая версия", () => {
    expect(canPay({ contractStatus: "SIGNED", acceptedVersion: 1, currentVersion: 2, alreadyPaid: false }).ok).toBe(false);
  });
  it("оплата доступна после подтверждения актуальной версии", () => {
    expect(canPay({ contractStatus: "SIGNED", acceptedVersion: 2, currentVersion: 2, alreadyPaid: false }).ok).toBe(true);
  });
  it("архив недоступен без оплаты", () => {
    const r = canDownloadResult({ isOwner: true, isStaff: false, contractStatus: "SIGNED", paymentRequired: true, paymentStatus: "pending", resultStatus: "completed" });
    expect(r.ok).toBe(false);
  });
  it("архив недоступен до завершения", () => {
    const r = canDownloadResult({ isOwner: true, isStaff: false, contractStatus: "SIGNED", paymentRequired: true, paymentStatus: "paid", resultStatus: "generating_package" });
    expect(r.ok).toBe(false);
  });
  it("архив недоступен чужому заказчику", () => {
    const r = canDownloadResult({ isOwner: false, isStaff: false, contractStatus: "SIGNED", paymentRequired: true, paymentStatus: "paid", resultStatus: "completed" });
    expect(r.ok).toBe(false);
  });
  it("архив доступен при выполнении всех условий", () => {
    const r = canDownloadResult({ isOwner: true, isStaff: false, contractStatus: "SIGNED", paymentRequired: true, paymentStatus: "paid", resultStatus: "completed" });
    expect(r.ok).toBe(true);
  });
});

describe("Воронка заявок", () => {
  it("отказ требует причину", () => {
    expect(checkLeadTransition("new", "lost").ok).toBe(false);
    expect(checkLeadTransition("new", "lost", { reason: "Дорого" }).ok).toBe(true);
  });
  it("won — только через конвертацию", () => {
    expect(checkLeadTransition("awaiting_signature", "won").ok).toBe(false);
    expect(checkLeadTransition("awaiting_signature", "won", { viaConversion: true }).ok).toBe(true);
  });
  it("из отказа — только в новую", () => {
    expect(checkLeadTransition("lost", "qualification").ok).toBe(false);
    expect(checkLeadTransition("lost", "new").ok).toBe(true);
  });
});

describe("Этапы и согласования", () => {
  it("возврат на доработку требует комментарий", () => {
    expect(checkStageTransition("customer_review", "customer_request_changes", "customer").ok).toBe(false);
    const r = checkStageTransition("customer_review", "customer_request_changes", "customer", { comment: "Увеличить шаг колонн" });
    expect(r).toEqual({ ok: true, to: "changes_requested" });
  });
  it("заказчик не может отправить на проверку", () => {
    expect(checkStageTransition("in_progress", "submit_internal", "customer").ok).toBe(false);
  });
  it("нельзя отправить на проверку без версии", () => {
    expect(checkStageTransition("in_progress", "submit_internal", "designer", { hasVersion: false }).ok).toBe(false);
  });
  it("проверка проектировщиком предшествует отправке заказчику", () => {
    expect(availableActions("in_progress", "designer")).not.toContain("confirm_internal");
    expect(availableActions("internal_review", "designer")).toContain("confirm_internal");
  });
  it("процент готовности", () => {
    expect(projectProgress([{ code: "brief", status: "completed" }])).toBe(10);
  });
});

describe("AI-задачи", () => {
  it("корректные переходы", () => {
    expect(canTransitionJob("queued", "processing")).toBe(true);
    expect(canTransitionJob("draft", "completed")).toBe(false);
    expect(retryTarget("generating_package")).toBe("generating_package");
    expect(retryTarget("processing")).toBe("queued");
  });
});

describe("Файлы", () => {
  it("разрешённые форматы", () => {
    expect(checkUpload("plan.DWG", 1000).ok).toBe(true);
    expect(checkUpload("model.ifc", 1000).ok).toBe(true);
    expect(checkUpload("virus.exe", 1000).ok).toBe(false);
    expect(checkUpload("big.pdf", 60 * 1024 * 1024, 50).ok).toBe(false);
  });
});

describe("ТЗ и шаблоны", () => {
  it("находит незаполненные обязательные поля", () => {
    expect(missingRequired({ objectName: "Навес" }).length).toBeGreaterThan(0);
  });
  it("diff по полям", () => {
    expect(diffSpec({ a: "1", b: "2" }, { a: "1", b: "3", c: "x" }).sort()).toEqual(["b", "c"]);
  });
  it("подстановка переменных", () => {
    expect(renderTemplate("Договор № {{number}} от {{date}}", { number: "Д-1" })).toBe("Договор № Д-1 от ________");
  });
});

describe("Быстрый заказ", () => {
  const params = {
    length: 6, width: 4, height: 2.7, roofType: "single", covering: "polycarbonate", frame: "profile_pipe",
    foundation: "piles", region: "Липецк", snowDistrict: "III", color: "RAL 7024", attachedToBuilding: false,
  } as const;
  it("валидирует обязательные поля", () => {
    expect(Object.keys(validateQuickOrder("CANOPY", {}))).toContain("length");
    expect(validateQuickOrder("CANOPY", params)).toEqual({});
    expect(validateQuickOrder("CANOPY", { ...params, length: 100 }).length).toBeDefined();
  });
  it("минимальная стоимость", () => {
    expect(quickOrderPrice("CANOPY", params)).toBe(15000);
  });
});
