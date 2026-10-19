import { STRUCTURE_TYPE } from "@/domain/labels";
import { renderSketchSvg, type VariantGeometry } from "./sketch";
import { buildPackage } from "./package-builder";
import type { AIProvider, PackageFile, PackageRequest, VariantDraft, VariantRequest } from "./provider";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Демонстрационный провайдер: детерминированные варианты по параметрам заказа.
 * Задержка имитирует работу модели. Слово «ошибка-ai» в примечаниях заказа
 * вызывает сбой — для проверки повторного запуска задачи.
 */
export class MockAIProvider implements AIProvider {
  readonly name = "mock";
  readonly demo = true;

  constructor(private delayMs = 2500) {}

  async generateVariants(req: VariantRequest): Promise<VariantDraft[]> {
    await sleep(this.delayMs);
    if (req.params.notes?.toLowerCase().includes("ошибка-ai")) {
      throw new Error("Демонстрационный сбой генерации (в примечаниях указано «ошибка-ai»)");
    }
    const heavy = req.params.snowDistrict === "IV" || req.params.snowDistrict === "V" || req.params.width > 8;
    const presets: { title: string; description: string; geometry: VariantGeometry; priceDelta: number }[] = [
      {
        title: "Экономичный",
        description:
          "Каркас из профильной трубы с увеличенным шагом колонн. Минимальная металлоёмкость, быстрый монтаж на винтовых сваях.",
        geometry: { columnStep: 3, roofSlopeDeg: 8, columnProfile: heavy ? "Труба 100×100×4" : "Труба 80×80×3", beamProfile: "Труба 80×60×3", purlinStep: 1 },
        priceDelta: 0,
      },
      {
        title: "Оптимальный",
        description:
          "Сбалансированное решение: уменьшенный шаг колонн, усиленные балки и уклон кровли для схода снега. Рекомендуется для большинства участков.",
        geometry: { columnStep: 2.5, roofSlopeDeg: 15, columnProfile: "Труба 100×100×4", beamProfile: heavy ? "Двутавр 14Б1" : "Труба 80×60×3", purlinStep: 0.8 },
        priceDelta: 3000,
      },
      {
        title: "Усиленный",
        description:
          "Колонны и балки из прокатных профилей, запас по снеговой нагрузке, возможность подвески оборудования и последующего расширения.",
        geometry: { columnStep: 2, roofSlopeDeg: 20, columnProfile: "Труба 120×120×5", beamProfile: heavy ? "Двутавр 20Б1" : "Двутавр 14Б1", purlinStep: 0.6 },
        priceDelta: 7000,
      },
    ];
    const title = `${STRUCTURE_TYPE[req.structureType]} ${req.params.length}×${req.params.width} м`;
    return presets.slice(0, req.count).map((v) => ({
      ...v,
      svg: renderSketchSvg(req.structureType, req.params, v.geometry, title, v.title),
    }));
  }

  async generatePackage(req: PackageRequest): Promise<PackageFile[]> {
    await sleep(this.delayMs);
    const note =
      "Пакет сформирован демонстрационным провайдером. Расчёты несущей способности не выполнялись; " +
      "профили подобраны по типовым решениям для заданных габаритов и снегового района. " +
      "Перед изготовлением конструкция должна быть проверена инженером-конструктором.";
    return buildPackage(req, note, true);
  }
}
