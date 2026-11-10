// Сумма прописью для договоров и счетов: 120000 → «сто двадцать тысяч рублей 00 копеек».

const ONES_M = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const ONES_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const TEENS = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

/** Форма слова по числу: 1 рубль, 2 рубля, 5 рублей. */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b >= 2 && b <= 4) return forms[1];
  return forms[2];
}

function triad(n: number, feminine: boolean): string[] {
  const words = [HUNDREDS[Math.floor(n / 100)]];
  const rest = n % 100;
  if (rest >= 10 && rest < 20) words.push(TEENS[rest - 10]);
  else words.push(TENS[Math.floor(rest / 10)], (feminine ? ONES_F : ONES_M)[rest % 10]);
  return words.filter(Boolean);
}

const SCALES: { forms: [string, string, string]; feminine: boolean }[] = [
  { forms: ["", "", ""], feminine: false },
  { forms: ["тысяча", "тысячи", "тысяч"], feminine: true },
  { forms: ["миллион", "миллиона", "миллионов"], feminine: false },
  { forms: ["миллиард", "миллиарда", "миллиардов"], feminine: false },
];

/** Целое число прописью (мужской род): 21 → «двадцать один». */
export function numberToWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return "ноль";
  const parts: string[] = [];
  for (let i = 0; n > 0 && i < SCALES.length; i++, n = Math.floor(n / 1000)) {
    const t = n % 1000;
    if (!t) continue;
    const scale = SCALES[i];
    parts.unshift([...triad(t, scale.feminine), i ? plural(t, scale.forms) : ""].filter(Boolean).join(" "));
  }
  return parts.join(" ");
}

/** «сто двадцать тысяч рублей 00 копеек». */
export function rublesInWords(amount: number): string {
  const rub = Math.floor(amount);
  const kop = Math.round((amount - rub) * 100);
  return `${numberToWords(rub)} ${plural(rub, ["рубль", "рубля", "рублей"])} ${String(kop).padStart(2, "0")} ${plural(kop, ["копейка", "копейки", "копеек"])}`;
}
