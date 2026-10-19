import { NextResponse, type NextRequest } from "next/server";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

// 1) Сохраняет UTM-метки первого визита в cookie (30 дней) — они попадают в заявку.
// 2) Без cookie сессии кабинет недоступен (полная проверка сессии и прав — на сервере).
export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (pathname.startsWith("/cabinet") && !req.cookies.get("evo_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  const utm: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = searchParams.get(k);
    if (v) utm[k] = v.slice(0, 100);
  }
  if (Object.keys(utm).length) {
    res.cookies.set("evo_utm", JSON.stringify(utm), { maxAge: 30 * 86400, sameSite: "lax", path: "/", httpOnly: true });
  }
  return res;
}

export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"] };
