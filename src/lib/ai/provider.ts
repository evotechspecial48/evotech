// Абстракция AI-провайдера. Интерфейс не зависит от конкретной нейросети:
// MockAIProvider — демонстрационные ответы, ClaudeProvider — Claude API (см. docs/AI_PROVIDER.md).

import type { QuickOrderParams, StructureTypeT } from "@/domain/quick-order";
import type { VariantGeometry } from "./sketch";

export interface VariantRequest {
  structureType: StructureTypeT;
  params: QuickOrderParams;
  /** Текст утверждённого ТЗ (для обычных проектов) */
  specText?: string;
  count: number;
}

export interface VariantDraft {
  title: string;
  description: string;
  geometry: VariantGeometry;
  priceDelta: number;
  svg: string;
}

export interface PackageRequest {
  orderNumber: string;
  structureType: StructureTypeT;
  params: QuickOrderParams;
  variant: { title: string; description: string; geometry: VariantGeometry; svg: string };
}

export interface PackageFile {
  path: string;
  content: Buffer | string;
}

export interface AIProvider {
  readonly name: string;
  /** Демонстрационный режим — интерфейс показывает предупреждение пользователю */
  readonly demo: boolean;
  generateVariants(req: VariantRequest): Promise<VariantDraft[]>;
  generatePackage(req: PackageRequest): Promise<PackageFile[]>;
}
