// Same estimate lens uses while assembling a caption (argus_lens.assembly.token_budget).
// CLIP for SDXL and the other CLIP backends; T5 for Flux, SD3, Kolors, and PixArt.
// Budgets are the usable counts after BOS/EOS and a trigger word.

const T5_BACKENDS = new Set(["flux", "sd3", "kolors", "pixart"]);

const BUDGETS: Record<string, number> = {
  sd15: 60,
  sdxl: 60,
  flux: 200,
  sd3: 200,
  kolors: 200,
  pixart: 200,
  playground: 60,
};

const DEFAULT_BUDGET = 60;

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function count(text: string, mark: string): number {
  return text.split(mark).length - 1;
}

/** Rough CLIP-L/G count: words at ~1.3 tokens, and each comma or underscore is its own token. */
export function estimateClipTokens(text: string): number {
  if (!text) return 0;
  return Math.trunc(words(text) * 1.3) + count(text, ",") + count(text, "_");
}

/** Rough T5-XXL count: words at ~1.1 tokens, plus a token per comma. */
export function estimateT5Tokens(text: string): number {
  if (!text) return 0;
  return Math.trunc(words(text) * 1.1) + count(text, ",");
}

export function estimateTokens(text: string, backend?: string): number {
  const name = (backend ?? "").toLowerCase().trim();
  return T5_BACKENDS.has(name) ? estimateT5Tokens(text) : estimateClipTokens(text);
}

export function tokenBudget(backend?: string): number {
  const name = (backend ?? "").toLowerCase().trim();
  return BUDGETS[name] ?? DEFAULT_BUDGET;
}

export function tokenUse(text: string, backend?: string): { used: number; budget: number; over: boolean } {
  const used = estimateTokens(text, backend);
  const budget = tokenBudget(backend);
  return { used, budget, over: used > budget };
}
