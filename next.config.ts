import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client", "bcryptjs", "nodemailer", "pdf-lib", "@pdf-lib/fontkit"],
  experimental: {
    // 100 МБ — вложения формы заявки (DWG, IFC, архивы); см. LEAD_FORM_FILES
    serverActions: { bodySizeLimit: "110mb" },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Service worker должен обновляться сразу после выкладки
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
  // Разделы «О компании», «Услуги», «Как мы работаем», «Контакты» объединены на главной странице
  async redirects() {
    return [
      { source: "/o-kompanii", destination: "/#o-nas", permanent: true },
      { source: "/uslugi", destination: "/#uslugi", permanent: true },
      { source: "/process", destination: "/#process", permanent: true },
      { source: "/kontakty", destination: "/#kontakty", permanent: true },
    ];
  },
};

export default nextConfig;
