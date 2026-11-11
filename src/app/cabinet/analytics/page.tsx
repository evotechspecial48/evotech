import { redirect } from "next/navigation";

// Аналитика объединена со стартовой страницей кабинета
export default async function AnalyticsRedirect({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const qs = new URLSearchParams(await searchParams).toString();
  redirect(qs ? `/cabinet?${qs}` : "/cabinet");
}
