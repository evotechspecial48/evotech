// Просмотр текста договора в кабинете — та же разметка, что у PDF (src/lib/pdf.ts → textToPdf):
// «# » раздел, «^ »/«^^ » по центру, «| … |» таблица («||» — без рамок), «<br>» перенос, «---» линия, «===» новая страница.

function cells(line: string) {
  return line
    .trim()
    .replace(/^\|\|?/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function Cell({ text }: { text: string }) {
  const parts = text.split("<br>");
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} className="block">
          {p}
        </span>
      ))}
    </>
  );
}

export function DocBody({ body }: { body: string }) {
  const blocks = body.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        if (lines.every((l) => l.trim().startsWith("|"))) {
          const borderless = lines[0].trim().startsWith("||");
          const rows = lines.map(cells);
          if (rows[0].every((c) => /^\d+%$/.test(c))) rows.shift();
          return (
            <div key={bi} className="overflow-x-auto">
              <table className={`w-full text-left text-xs ${borderless ? "" : "border border-line-strong"}`}>
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={ri} className={!borderless && ri === 0 ? "bg-steel-100 font-semibold" : ""}>
                      {r.map((c, ci) => (
                        <td key={ci} className={`align-top ${borderless ? "py-1 pr-4" : "border border-line-strong px-2 py-1.5"}`}>
                          <Cell text={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block === "---") return <hr key={bi} className="border-line-strong" />;
        if (block === "===") return <hr key={bi} className="my-6 border-dashed border-line-strong" aria-label="Новая страница" />;
        if (block.startsWith("# ")) return <h3 key={bi} className="pt-2 font-semibold text-ink">{block.slice(2)}</h3>;
        if (lines.every((l) => l.startsWith("^")))
          return (
            <div key={bi} className="text-center">
              {lines.map((l, li) => (l.startsWith("^^ ") ? <p key={li}>{l.slice(3)}</p> : <p key={li} className="text-base font-semibold text-ink">{l.replace(/^\^ ?/, "")}</p>))}
            </div>
          );
        return (
          <p key={bi} className="whitespace-pre-line">
            {block}
          </p>
        );
      })}
    </div>
  );
}
