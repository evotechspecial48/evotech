import { promises as fs } from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

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

export interface PdfWriter {
  doc: PDFDocument;
  heading(text: string, size?: number): void;
  paragraph(text: string, size?: number): void;
  spacer(h?: number): void;
  page(): PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  save(): Promise<Buffer>;
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const result: string[] = [];
  for (const raw of text.split("\n")) {
    const words = raw.split(/\s+/);
    let line = "";
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) > width && line) {
        result.push(line);
        line = w;
      } else line = candidate;
    }
    result.push(line);
  }
  return result;
}

export async function createPdf(title: string): Promise<PdfWriter> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(title);
  doc.setProducer("EvoTechnology");
  const f = await fonts();
  const regular = await doc.embedFont(f.regular, { subset: true });
  const bold = await doc.embedFont(f.bold, { subset: true });
  let current = doc.addPage(A4);
  let y = A4[1] - MARGIN;
  const ink = rgb(0.12, 0.16, 0.22);

  const ensure = (h: number) => {
    if (y - h < MARGIN) {
      current = doc.addPage(A4);
      y = A4[1] - MARGIN;
    }
  };
  const drawLines = (lines: string[], font: PDFFont, size: number) => {
    for (const l of lines) {
      ensure(size * 1.45);
      current.drawText(l, { x: MARGIN, y: y - size, size, font, color: ink });
      y -= size * 1.45;
    }
  };

  return {
    doc,
    regular,
    bold,
    heading(text, size = 15) {
      y -= 6;
      drawLines(wrap(text, bold, size, A4[0] - MARGIN * 2), bold, size);
      y -= 4;
    },
    paragraph(text, size = 10.5) {
      drawLines(wrap(text, regular, size, A4[0] - MARGIN * 2), regular, size);
      y -= 4;
    },
    spacer(h = 10) {
      y -= h;
    },
    page() {
      return current;
    },
    async save() {
      const pages = doc.getPages();
      pages.forEach((p, i) => {
        p.drawText(`EvoTechnology · ${title} · стр. ${i + 1} из ${pages.length}`, {
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

/** Документ из простого текста: строки, начинающиеся с «# », — заголовки. */
export async function textToPdf(title: string, body: string): Promise<Buffer> {
  const pdf = await createPdf(title);
  for (const block of body.split(/\n{2,}/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("# ")) pdf.heading(trimmed.slice(2), 14);
    else pdf.paragraph(trimmed);
  }
  return pdf.save();
}
