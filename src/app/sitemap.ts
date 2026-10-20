import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return ["", "/o-kompanii", "/raboty", "/bystryj-zakaz", "/zayavka", "/privacy", "/consent"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: p ? "monthly" : "weekly",
    priority: p ? 0.7 : 1,
  }));
}
