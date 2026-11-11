// Общий разбор текста договора для PDF (lib/pdf.ts) и просмотра в кабинете (components/cabinet/doc-body.tsx).

/** Переводы строк Windows (текст, вставленный из Word) → «\n». */
export const normalizeNewlines = (s: string) => s.replace(/\r\n?/g, "\n");

/**
 * Блок «в две колонки», свёрстанный в Word табуляцией (реквизиты «ЗАКАЗЧИК / ИСПОЛНИТЕЛЬ»):
 * строка с табуляцией — левая и правая колонки; строка с большим отступом — продолжение правой;
 * остальные строки — левая колонка. Возвращает строки таблицы или null, если блок не такой.
 */
export function tabColumns(block: string): [string, string][] | null {
  const lines = block.split("\n");
  if (lines.filter((l) => /\S\t+\s*\S/.test(l)).length < 2) return null;
  return lines
    .filter((l) => l.trim())
    .map((l): [string, string] => {
      const m = l.match(/^(.*?\S)?[ ]*\t[\t ]*(.*)$/);
      if (m) return [(m[1] ?? "").trim(), m[2].trim()];
      if (/^[ \t]{8,}\S/.test(l)) return ["", l.trim()];
      return [l.trim(), ""];
    });
}
