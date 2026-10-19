import Link from "next/link";
import { btnClass } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="grid-paper grid min-h-screen place-items-center px-4">
      <div className="text-center">
        <p className="font-mono text-sm text-muted">404</p>
        <h1 className="mt-2 text-3xl font-semibold">Страница не найдена</h1>
        <p className="mt-2 text-muted">Возможно, ссылка устарела или у вас нет доступа к этому объекту.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className={btnClass("secondary")}>
            На главную
          </Link>
          <Link href="/cabinet" className={btnClass("primary")}>
            В кабинет
          </Link>
        </div>
      </div>
    </div>
  );
}
