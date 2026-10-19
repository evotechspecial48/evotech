import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { COVERINGS, FOUNDATIONS, FRAMES, ROOF_TYPES } from "@/domain/quick-order";
import { STRUCTURE_TYPE } from "@/domain/labels";
import { renderSketchSvg } from "./sketch";
import { buildPackage } from "./package-builder";
import type { AIProvider, PackageFile, PackageRequest, VariantDraft, VariantRequest } from "./provider";

// Claude API: модель возвращает параметры вариантов в виде структурированного JSON
// (output_config.format), отрисовка эскиза и сборка пакета — на нашей стороне.
// Включены серверные резервные модели (fallbacks: "default") на случай отказа классификатора.

const VariantsSchema = z.object({
  variants: z.array(
    z.object({
      title: z.string().describe("Короткое название варианта на русском"),
      description: z.string().describe("2–3 предложения: конструктивное решение и для кого подходит"),
      columnStep: z.number().describe("Шаг колонн, м (1.5–6)"),
      roofSlopeDeg: z.number().describe("Уклон кровли, градусы (0–35)"),
      columnProfile: z.string().describe("Профиль колонн, напр. «Труба 100×100×4»"),
      beamProfile: z.string().describe("Профиль балок, напр. «Двутавр 14Б1»"),
      purlinStep: z.number().describe("Шаг прогонов, м"),
      priceDelta: z.number().describe("Надбавка к базовой стоимости проектирования, руб., 0–15000"),
    }),
  ),
});

const SYSTEM = [
  "Ты — инженер-конструктор металлоконструкций в проектной компании EvoTechnology.",
  "По параметрам заказа предложи конструктивные варианты для эскизного проектирования малых конструкций (навесы, гаражи, террасы, беседки, ангары).",
  "Используй сортамент, доступный в России (ГОСТ 30245 для труб, СТО АСЧМ 20-93 для двутавров), учитывай снеговой район по СП 20.13330.",
  "Варианты должны заметно отличаться по металлоёмкости и стоимости. Отвечай на русском.",
].join(" ");

export class ClaudeProvider implements AIProvider {
  readonly name = "claude";
  readonly demo = false;
  private client: Anthropic;

  constructor(
    apiKey: string | undefined,
    private model: string,
  ) {
    // Без ключа SDK использует ANTHROPIC_AUTH_TOKEN или профиль `ant auth login`
    this.client = new Anthropic(apiKey ? { apiKey } : {});
  }

  private describe(req: Pick<VariantRequest, "structureType" | "params" | "specText">): string {
    const p = req.params;
    return [
      `Тип: ${STRUCTURE_TYPE[req.structureType]}`,
      `Габариты: ${p.length} × ${p.width} м, высота ${p.height} м`,
      `Кровля: ${ROOF_TYPES[p.roofType]}, покрытие: ${COVERINGS[p.covering]}`,
      `Каркас: ${FRAMES[p.frame]}, фундамент: ${FOUNDATIONS[p.foundation]}`,
      `Регион: ${p.region}, снеговой район ${p.snowDistrict}`,
      `Примыкает к зданию: ${p.attachedToBuilding ? "да" : "нет"}`,
      p.notes ? `Пожелания заказчика: ${p.notes}` : "",
      req.specText ? `Техническое задание:\n${req.specText}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  async generateVariants(req: VariantRequest): Promise<VariantDraft[]> {
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(VariantsSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: `Предложи ${req.count} варианта конструкции.\n\n${this.describe(req)}` }],
    });
    if (response.stop_reason === "refusal") throw new Error("Модель отклонила запрос");
    const parsed = response.parsed_output;
    if (!parsed) throw new Error("Модель вернула ответ в неожиданном формате");
    const title = `${STRUCTURE_TYPE[req.structureType]} ${req.params.length}×${req.params.width} м`;
    return parsed.variants.slice(0, req.count).map((v) => {
      const geometry = {
        columnStep: Math.min(6, Math.max(1.5, v.columnStep)),
        roofSlopeDeg: Math.min(35, Math.max(0, v.roofSlopeDeg)),
        columnProfile: v.columnProfile,
        beamProfile: v.beamProfile,
        purlinStep: Math.min(2, Math.max(0.4, v.purlinStep)),
      };
      return {
        title: v.title,
        description: v.description,
        geometry,
        priceDelta: Math.round(Math.min(15000, Math.max(0, v.priceDelta)) / 500) * 500,
        svg: renderSketchSvg(req.structureType, req.params, geometry, title, v.title),
      };
    });
  }

  async generatePackage(req: PackageRequest): Promise<PackageFile[]> {
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Составь пояснения к пояснительной записке (5–8 абзацев, без заголовков): принятые нагрузки, обоснование профилей, требования к антикоррозийной защите и монтажу.\n\n${this.describe(req)}\n\nВыбранный вариант: ${req.variant.title}. ${req.variant.description}\nКолонны ${req.variant.geometry.columnProfile}, балки ${req.variant.geometry.beamProfile}, шаг колонн ${req.variant.geometry.columnStep} м.`,
        },
      ],
    });
    if (response.stop_reason === "refusal") throw new Error("Модель отклонила запрос");
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n\n");
    return buildPackage(req, text, false);
  }
}
