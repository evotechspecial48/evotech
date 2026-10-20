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
    serverActions: { bodySizeLimit: "30mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Услуги, процесс и контакты объединены в /o-kompanii — старые адреса ведут на разделы страницы
  async redirects() {
    return [
      { source: "/uslugi", destination: "/o-kompanii#uslugi", permanent: true },
      { source: "/process", destination: "/o-kompanii#process", permanent: true },
      { source: "/kontakty", destination: "/o-kompanii#kontakty", permanent: true },
    ];
  },
};

export default nextConfig;
