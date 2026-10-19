"use client";

import { Alert, Button } from "@/components/ui";

export default function CabinetError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const forbidden = /нет доступа|недостаточно прав/i.test(error.message);
  const notFound = /не найден/i.test(error.message);
  return (
    <div className="mx-auto max-w-xl py-12">
      <Alert tone="danger" title={forbidden ? "Нет доступа" : notFound ? "Не найдено" : "Не удалось загрузить страницу"}>
        {forbidden || notFound ? error.message : "Произошла ошибка. Попробуйте обновить страницу; если ошибка повторяется — сообщите в поддержку."}
        {error.digest && <span className="mt-1 block font-mono text-xs opacity-70">Код: {error.digest}</span>}
      </Alert>
      <Button className="mt-4" variant="secondary" onClick={reset}>
        Повторить
      </Button>
    </div>
  );
}
