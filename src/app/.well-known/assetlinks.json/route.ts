import { env } from "@/lib/env";

// Digital Asset Links: подтверждает, что Android-приложение su.evotechnology.app принадлежит сайту —
// тогда оно открывает кабинет во весь экран, без адресной строки (Trusted Web Activity).
// Отпечаток ключа подписи (SHA-256) — ANDROID_CERT_SHA256 в .env, несколько — через запятую.
export const dynamic = "force-dynamic";

export function GET() {
  const fingerprints = (env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
  const body = fingerprints.length
    ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "su.evotechnology.app", sha256_cert_fingerprints: fingerprints } }]
    : [];
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
