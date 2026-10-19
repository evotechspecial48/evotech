import { env } from "../env";
import { ClaudeProvider } from "./claude-provider";
import { MockAIProvider } from "./mock-provider";
import type { AIProvider } from "./provider";

export type { AIProvider } from "./provider";

let instance: AIProvider | null = null;

/** Единственная точка выбора провайдера: AI_PROVIDER=mock | claude. */
export function aiProvider(): AIProvider {
  if (!instance) {
    instance = env.AI_PROVIDER === "claude" ? new ClaudeProvider(env.ANTHROPIC_API_KEY, env.CLAUDE_MODEL) : new MockAIProvider(env.MOCK_AI_DELAY_MS);
  }
  return instance;
}
