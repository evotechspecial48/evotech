"use client";

import Image from "next/image";
import { useState } from "react";

// Галерея первого экрана: большое изображение, подпись и четыре миниатюры-кнопки (без автоперелистывания).
const SLIDES = [
  { src: "/works/hero-1.jpg", title: "Промышленный каркас", alt: "3D-модель Tekla: каркас промышленного здания со связями, кровельными прогонами, площадками обслуживания и лестницами" },
  { src: "/works/hero-2.jpg", title: "Технологический комплекс", alt: "3D-модель технологического комплекса: многоярусная этажерка, перекрытия, фермы и опорные конструкции под ёмкости" },
  { src: "/works/hero-3.webp", title: "Каркас здания", alt: "3D-модель двухэтажного каркаса здания с балками перекрытий, колоннами и ограждением кровли" },
  { src: "/works/hero-4.webp", title: "Стропильные конструкции", alt: "3D-модель стропильных конструкций: двускатные рамы, прогоны и фермы нескольких пролётов" },
];

export function HeroGallery() {
  const [active, setActive] = useState(0);
  const slide = SLIDES[active];
  return (
    <figure className="min-w-0">
      <div className="mb-4 flex items-center justify-between gap-3 font-mono text-xs uppercase tracking-[0.2em]">
        <span className="text-steel-200">Примеры работ</span>
        <span className="text-signal-500">КМ · КМД · 3D</span>
      </div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-steel-100 shadow-2xl ring-1 ring-white/10">
        <Image key={slide.src} src={slide.src} alt={slide.alt} fill priority={active === 0} sizes="(min-width: 1024px) 45vw, 100vw" className="object-contain" />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 sm:gap-3" role="group" aria-label="Выбор примера работы">
        {SLIDES.map((s, i) => (
          <button
            key={s.src}
            type="button"
            onClick={() => setActive(i)}
            aria-pressed={i === active}
            aria-label={`Показать: ${s.title}`}
            className={`relative aspect-[4/3] overflow-hidden rounded-lg bg-steel-100 ring-2 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white ${
              i === active ? "ring-signal-500" : "ring-transparent opacity-80 hover:opacity-100"
            }`}
          >
            <Image src={s.src} alt="" fill sizes="(min-width: 1024px) 11vw, 25vw" className="object-cover" />
          </button>
        ))}
      </div>
      <figcaption className="mt-3 text-sm text-steel-200" aria-live="polite">
        {slide.title}
      </figcaption>
    </figure>
  );
}
