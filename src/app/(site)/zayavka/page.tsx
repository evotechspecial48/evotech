import type { Metadata } from "next";
import { LeadForm } from "@/components/site/lead-form";
import { PageHero } from "@/components/site/page-shell";

export const metadata: Metadata = { title: "Заявка на проектирование", description: "Оставьте заявку на проектирование металлоконструкций — ответим в течение рабочего дня." };

export default function LeadPage() {
  return (
    <>
      <PageHero eyebrow="Заявка" title="Расскажите о вашей задаче" lead="Достаточно краткого описания — детали уточним вместе при подготовке технического задания." />
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
          <LeadForm source="site_form" />
        </div>
      </div>
    </>
  );
}
