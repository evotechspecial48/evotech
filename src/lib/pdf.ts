import { promises as fs } from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { normalizeNewlines, tabColumns } from "./doc-markup";

// Формирование PDF с кириллицей (шрифт DejaVu Sans, лицензия — assets/fonts/LICENSE-DejaVu.txt).

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
let fontCache: { regular: Buffer; bold: Buffer } | null = null;

async function fonts() {
  if (!fontCache) {
    fontCache = {
      regular: await fs.readFile(path.join(FONT_DIR, "DejaVuSans.ttf")),
      bold: await fs.readFile(path.join(FONT_DIR, "DejaVuSans-Bold.ttf")),
    };
  }
  return fontCache;
}

export interface TableOptions {
  /** Доли ширины колонок (сумма = 1); по умолчанию поровну. */
  widths?: number[];
  /** Первая строка — шапка (жирным, с заливкой). */
  header?: boolean;
  /** Без рамок — для блока реквизитов сторон. */
  borderless?: boolean;
  size?: number;
}

export interface PdfWriter {
  doc: PDFDocument;
  heading(text: string, size?: number): void;
  /** Строка по центру (заголовок документа, подзаголовок). */
  centered(text: string, size?: number, bold?: boolean): void;
  paragraph(text: string, size?: number): void;
  /** Таблица; в ячейках допускаются переносы строк «\n». */
  table(rows: string[][], opts?: TableOptions): void;
  /** Горизонтальная линия на всю ширину. */
  rule(): void;
  /** PNG-изображение (логотип), высота в пунктах. */
  image(png: Buffer, height: number, align?: "left" | "center" | "right"): Promise<void>;
  spacer(h?: number): void;
  /** Перенос на новую страницу. */
  pageBreak(): void;
  page(): PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  save(): Promise<Buffer>;
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;
const WIDTH = A4[0] - MARGIN * 2;
const ink = rgb(0.12, 0.16, 0.22);
const line = rgb(0.6, 0.64, 0.7);

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const result: string[] = [];
  for (const raw of text.split("\n")) {
    const words = raw.split(/\s+/);
    let current = "";
    for (const w of words) {
      const candidate = current ? `${current} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) > width && current) {
        result.push(current);
        current = w;
      } else current = candidate;
    }
    result.push(current);
  }
  return result;
}

export async function createPdf(title: string): Promise<PdfWriter> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(title);
  doc.setProducer("ЭвоТех");
  const f = await fonts();
  const regular = await doc.embedFont(f.regular, { subset: true });
  const bold = await doc.embedFont(f.bold, { subset: true });
  let current = doc.addPage(A4);
  let y = A4[1] - MARGIN;

  const ensure = (h: number) => {
    if (y - h < MARGIN) {
      current = doc.addPage(A4);
      y = A4[1] - MARGIN;
    }
  };
  const drawLines = (lines: string[], font: PDFFont, size: number, align: "left" | "center" = "left") => {
    for (const l of lines) {
      ensure(size * 1.45);
      const x = align === "center" ? MARGIN + (WIDTH - font.widthOfTextAtSize(l, size)) / 2 : MARGIN;
      current.drawText(l, { x, y: y - size, size, font, color: ink });
      y -= size * 1.45;
    }
  };

  return {
    doc,
    regular,
    bold,
    heading(text, size = 15) {
      y -= 6;
      drawLines(wrap(text, bold, size, WIDTH), bold, size);
      y -= 4;
    },
    centered(text, size = 12, isBold = true) {
      const font = isBold ? bold : regular;
      drawLines(wrap(text, font, size, WIDTH), font, size, "center");
      y -= 2;
    },
    paragraph(text, size = 10.5) {
      drawLines(wrap(text, regular, size, WIDTH), regular, size);
      y -= 4;
    },
    table(rows, opts = {}) {
      if (!rows.length) return;
      const size = opts.size ?? 9.5;
      const cols = Math.max(...rows.map((r) => r.length));
      const widths = (opts.widths ?? Array(cols).fill(1 / cols)).map((w) => w * WIDTH);
      const pad = opts.borderless ? 2 : 4;
      const lh = size * 1.4;
      y -= 2;
      rows.forEach((row, ri) => {
        const font = opts.header && ri === 0 ? bold : regular;
        const cells = widths.map((w, ci) => wrap(row[ci] ?? "", font, size, w - pad * 2));
        const h = Math.max(...cells.map((c) => c.length)) * lh + pad * 2;
        ensure(h);
        let x = MARGIN;
        cells.forEach((lines, ci) => {
          if (!opts.borderless) {
            current.drawRectangle({ x, y: y - h, width: widths[ci], height: h, borderColor: line, borderWidth: 0.6, color: opts.header && ri === 0 ? rgb(0.94, 0.95, 0.97) : undefined });
          }
          lines.forEach((l, li) => current.drawText(l, { x: x + pad, y: y - pad - size - li * lh + 1, size, font, color: ink }));
          x += widths[ci];
        });
        y -= h;
      });
      y -= 6;
    },
    rule() {
      ensure(8);
      current.drawLine({ start: { x: MARGIN, y: y - 3 }, end: { x: A4[0] - MARGIN, y: y - 3 }, thickness: 0.8, color: line });
      y -= 10;
    },
    async image(png, height, align = "left") {
      const img = await doc.embedPng(png);
      const width = (img.width / img.height) * height;
      ensure(height + 4);
      const x = align === "center" ? MARGIN + (WIDTH - width) / 2 : align === "right" ? A4[0] - MARGIN - width : MARGIN;
      current.drawImage(img, { x, y: y - height, width, height });
      y -= height + 6;
    },
    spacer(h = 10) {
      y -= h;
    },
    pageBreak() {
      if (y < A4[1] - MARGIN) {
        current = doc.addPage(A4);
        y = A4[1] - MARGIN;
      }
    },
    page() {
      return current;
    },
    async save() {
      const pages = doc.getPages();
      pages.forEach((p, i) => {
        p.drawText(`${title} · стр. ${i + 1} из ${pages.length}`, {
          x: MARGIN,
          y: 28,
          size: 8,
          font: regular,
          color: rgb(0.45, 0.5, 0.56),
        });
      });
      return Buffer.from(await doc.save());
    },
  };
}

/**
 * Документ из размеченного текста (шаблоны договоров):
 *   «# » — заголовок раздела; «^ » — строка по центру жирным; «^^ » — по центру обычным;
 *   строки «| a | b |» подряд — таблица (первая строка — шапка; «||» в начале — таблица без рамок и шапки),
 *   «<br>» внутри ячейки — перенос строки; «---» — горизонтальная линия; «===» — новая страница.
 */
export async function textToPdf(title: string, body: string): Promise<Buffer> {
  const pdf = await createPdf(title);
  for (const block of normalizeNewlines(body).split(/\n{2,}/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    // Две колонки, свёрстанные табуляцией (текст из Word), — таблица без рамок
    const columns = tabColumns(block);
    if (columns) {
      pdf.table(columns, { borderless: true, widths: [0.5, 0.5] });
      continue;
    }
    const lines = trimmed.split("\n");
    if (lines.every((l) => l.trim().startsWith("|"))) {
      const borderless = lines[0].trim().startsWith("||");
      const rows = lines.map((l) =>
        l
          .trim()
          .replace(/^\|\|?/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim().replace(/<br>/g, "\n")),
      );
      const widthsRow = rows[0].every((c) => /^\d+%$/.test(c)) ? rows.shift() : undefined;
      pdf.table(rows, { header: !borderless, borderless, widths: widthsRow?.map((c) => Number(c.replace("%", "")) / 100) });
    } else if (trimmed === "---") pdf.rule();
    else if (trimmed === "===") pdf.pageBreak();
    else if (trimmed.startsWith("# ")) pdf.heading(trimmed.slice(2), 12);
    else if (lines.every((l) => l.startsWith("^"))) lines.forEach((l) => (l.startsWith("^^ ") ? pdf.centered(l.slice(3), 10.5, false) : pdf.centered(l.replace(/^\^ ?/, ""), 13, true)));
    else pdf.paragraph(trimmed);
  }
  return pdf.save();
}
