"use client";

import { useState } from "react";
import { createQuickOrderAction } from "@/app/actions/cabinet";
import { COVERINGS, FOUNDATIONS, FRAMES, quickOrderPrice, ROOF_TYPES, STRUCTURE_LIMITS, validateQuickOrder, type QuickOrderParams, type StructureTypeT } from "@/domain/quick-order";
import { STRUCTURE_TYPE } from "@/domain/labels";
import { ActionForm, FileUploader, SubmitButton, type UploadedFile } from "../client";
import { btnClass, cx, fieldClass } from "../ui";

const STEPS = ["Тип конструкции", "Габариты", "Конструкция", "Участок и условия", "Проверка"];

const DEFAULTS: QuickOrderParams = {
  length: 6,
  width: 4,
  height: 2.7,
  roofType: "single",
  covering: "polycarbonate",
  frame: "profile_pipe",
  foundation: "piles",
  region: "",
  snowDistrict: "III",
  color: "",
  attachedToBuilding: false,
  gates: false,
  notes: "",
};

export function QuickOrderWizard({ initialType }: { initialType?: StructureTypeT }) {
  const [step, setStep] = useState(initialType ? 1 : 0);
  const [type, setType] = useState<StructureTypeT>(initialType ?? "CANOPY");
  const [p, setP] = useState<QuickOrderParams>(DEFAULTS);
  const [photos, setPhotos] = useState<UploadedFile[]>([]);
  const [touched, setTouched] = useState(false);
  const errors = validateQuickOrder(type, p);
  const set = <K extends keyof QuickOrderParams>(k: K, v: QuickOrderParams[K]) => setP((s) => ({ ...s, [k]: v }));
  const stepFields: (keyof QuickOrderParams)[][] = [[], ["length", "width", "height"], ["roofType", "covering", "frame", "foundation"], ["region", "snowDistrict"], []];
  const stepValid = stepFields[step].every((f) => !errors[f]);
  const next = () => {
    setTouched(true);
    if (stepValid) {
      setTouched(false);
      setStep((s) => s + 1);
    }
  };
  const err = (k: keyof QuickOrderParams) =>
    touched && errors[k] ? (
      <p className="mt-1 text-xs font-medium text-danger-700" id={`${k}-error`}>
        {errors[k]}
      </p>
    ) : null;
  const lim = STRUCTURE_LIMITS[type];
  const price = Object.keys(errors).length ? null : quickOrderPrice(type, p);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
        <ol className="mb-6 flex flex-wrap gap-2" aria-label="Шаги">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? "step" : undefined} className={cx("rounded-full border px-3 py-1 text-xs", i === step ? "border-accent-600 bg-accent-50 font-medium text-accent-700" : i < step ? "border-[#bfe3cf] bg-success-50 text-success-700" : "border-line text-muted")}>
              {i < step ? "✓ " : `${i + 1}. `}
              {s}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <fieldset>
            <legend className="mb-3 text-lg font-semibold">Что проектируем?</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.keys(STRUCTURE_LIMITS) as StructureTypeT[]).map((t) => (
                <label key={t} className={cx("cursor-pointer rounded-lg border p-4", type === t ? "border-accent-600 bg-accent-50" : "border-line hover:border-line-strong")}>
                  <input type="radio" name="type" className="sr-only" checked={type === t} onChange={() => setType(t)} />
                  <span className="block font-semibold">{STRUCTURE_TYPE[t]}</span>
                  <span className="text-xs text-muted">
                    до {STRUCTURE_LIMITS[t].maxLength}×{STRUCTURE_LIMITS[t].maxWidth} м, от {STRUCTURE_LIMITS[t].min.toLocaleString("ru-RU")} ₽
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-3">
            {(["length", "width", "height"] as const).map((k) => (
              <div key={k}>
                <label htmlFor={k} className="mb-1 block text-sm font-medium text-ink-soft">
                  {k === "length" ? "Длина" : k === "width" ? "Ширина" : "Высота"}, м
                </label>
                <input
                  id={k}
                  type="number"
                  step="0.1"
                  min={0}
                  value={p[k]}
                  onChange={(e) => set(k, Number(e.target.value))}
                  aria-invalid={touched && !!errors[k]}
                  aria-describedby={errors[k] ? `${k}-error` : undefined}
                  className={fieldClass}
                />
                <p className="mt-1 text-xs text-muted">макс. {k === "length" ? lim.maxLength : k === "width" ? lim.maxWidth : lim.maxHeight} м</p>
                {err(k)}
              </div>
            ))}
            <p className="text-sm text-muted sm:col-span-3">Площадь: {(p.length * p.width).toFixed(1)} м²</p>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Choice label="Тип кровли" value={p.roofType} options={ROOF_TYPES} onChange={(v) => set("roofType", v as QuickOrderParams["roofType"])} error={err("roofType")} />
            <Choice label="Покрытие" value={p.covering} options={COVERINGS} onChange={(v) => set("covering", v as QuickOrderParams["covering"])} error={err("covering")} />
            <Choice label="Каркас" value={p.frame} options={FRAMES} onChange={(v) => set("frame", v as QuickOrderParams["frame"])} error={err("frame")} />
            <Choice label="Фундамент" value={p.foundation} options={FOUNDATIONS} onChange={(v) => set("foundation", v as QuickOrderParams["foundation"])} error={err("foundation")} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={p.attachedToBuilding} onChange={(e) => set("attachedToBuilding", e.target.checked)} /> Примыкает к зданию
            </label>
            {(type === "GARAGE" || type === "HANGAR") && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!p.gates} onChange={(e) => set("gates", e.target.checked)} /> Нужны ворота
              </label>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="region" className="mb-1 block text-sm font-medium text-ink-soft">
                Регион / населённый пункт *
              </label>
              <input id="region" value={p.region} onChange={(e) => set("region", e.target.value)} className={fieldClass} aria-invalid={touched && !!errors.region} />
              {err("region")}
            </div>
            <div>
              <label htmlFor="snow" className="mb-1 block text-sm font-medium text-ink-soft">
                Снеговой район
              </label>
              <select id="snow" value={p.snowDistrict} onChange={(e) => set("snowDistrict", e.target.value as QuickOrderParams["snowDistrict"])} className={fieldClass}>
                {["I", "II", "III", "IV", "V"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">Липецкая область — III. Не знаете — оставьте III, уточним.</p>
            </div>
            <div>
              <label htmlFor="color" className="mb-1 block text-sm font-medium text-ink-soft">
                Цвет (RAL)
              </label>
              <input id="color" value={p.color} onChange={(e) => set("color", e.target.value)} className={fieldClass} placeholder="RAL 7024" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="notes" className="mb-1 block text-sm font-medium text-ink-soft">
                Пожелания
              </label>
              <textarea id="notes" rows={3} value={p.notes} onChange={(e) => set("notes", e.target.value)} className={fieldClass} />
            </div>
            <div className="sm:col-span-2">
              <p className="mb-2 text-sm font-medium text-ink-soft">Фотографии участка и исходные материалы</p>
              <FileUploader target={{ draft: "quick-order" }} accept=".jpg,.jpeg,.png,.pdf" hint="JPG, PNG, PDF — до 20 МБ" refreshOnDone={false} onUploaded={(f) => setPhotos((s) => [...s, ...f])} label="Загрузить фото" />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {[
                ["Конструкция", STRUCTURE_TYPE[type]],
                ["Габариты", `${p.length} × ${p.width} м, высота ${p.height} м`],
                ["Кровля", `${ROOF_TYPES[p.roofType]}, ${COVERINGS[p.covering].toLowerCase()}`],
                ["Каркас / фундамент", `${FRAMES[p.frame]} / ${FOUNDATIONS[p.foundation]}`],
                ["Регион, снеговой район", `${p.region}, ${p.snowDistrict}`],
                ["Фото", photos.length ? `${photos.length} шт.` : "не загружены"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {Object.keys(errors).length > 0 && <p className="text-sm text-danger-700">Исправьте ошибки на предыдущих шагах: {Object.values(errors).join("; ")}</p>}
            <ActionForm action={createQuickOrderAction}>
              <input type="hidden" name="structureType" value={type} />
              {Object.entries(p).map(([k, v]) =>
                typeof v === "boolean" ? v && <input key={k} type="hidden" name={k} value="on" /> : <input key={k} type="hidden" name={k} value={String(v ?? "")} />,
              )}
              <input type="hidden" name="photoIds" value={photos.map((f) => f.id).join(",")} />
              <SubmitButton size="lg" variant="signal" disabled={Object.keys(errors).length > 0} pendingText="Создаём заказ…">
                Сформировать варианты эскиза
              </SubmitButton>
            </ActionForm>
          </div>
        )}

        <div className="mt-6 flex justify-between border-t border-line pt-4">
          <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className={btnClass("ghost")}>
            ← Назад
          </button>
          {step < 4 && (
            <button type="button" onClick={next} className={btnClass("primary")}>
              Далее →
            </button>
          )}
        </div>
      </div>
      <aside className="h-fit rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:sticky lg:top-24">
        <p className="text-xs uppercase tracking-wide text-muted">Ориентировочная стоимость</p>
        <p className="mt-1 text-2xl font-semibold">{price ? `${price.toLocaleString("ru-RU")} ₽` : "—"}</p>
        <p className="mt-2 text-xs text-muted">Итоговая цена зависит от выбранного варианта и фиксируется в договоре.</p>
        <p className="mt-4 rounded-lg bg-warning-50 p-3 text-xs text-warning-700">◷ Демонстрационный режим: эскизы формирует тестовый генератор.</p>
      </aside>
    </div>
  );
}

function Choice({ label, value, options, onChange, error }: { label: string; value: string; options: Record<string, string>; onChange: (v: string) => void; error: React.ReactNode }) {
  const id = label.replace(/\s/g, "");
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink-soft">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass}>
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      {error}
    </div>
  );
}
