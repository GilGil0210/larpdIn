import { GenerationError, UpstreamTimeoutError } from "./errors.js";
import type { GeneratePersonas } from "./personas.js";
import { withSignal } from "./signal.js";

export type ProviderGenerator = {
  name: string;
  generate: GeneratePersonas;
  /** Budget for this provider before falling back; null = rest of the overall deadline. */
  timeoutMs: number | null;
};

export type FallbackOptions = {
  /** After a provider-side failure, skip that provider for this long. */
  cooldownMs: number;
  now?: () => number;
};

/**
 * Tries providers in order (Featherless, then Gemini by default). A provider
 * "doesn't work" when it errors, times out, is rate limited, or still returns
 * unusable output after its repair attempt; the next provider then gets the
 * remaining time. Provider-side failures (not bad output) put the provider on
 * a short cooldown so later requests go straight to the fallback.
 */
export function createFallbackGenerator(providers: ProviderGenerator[], opts: FallbackOptions): GeneratePersonas {
  const now = opts.now ?? Date.now;
  const coolingUntil = new Map<string, number>();

  return async (request, signal, context = {}) => {
    const { log } = context;
    const ready = providers.filter((p) => (coolingUntil.get(p.name) ?? 0) <= now());
    // If everything is cooling down, try them all rather than fail outright.
    const order = ready.length > 0 ? ready : providers;
    if (order.length === 0) throw new GenerationError("No generation provider is configured", "provider");

    let lastError: unknown = new GenerationError("No generation provider succeeded", "provider");
    for (const [i, provider] of order.entries()) {
      if (signal.aborted) throw new UpstreamTimeoutError();
      const next = order[i + 1];
      // The last provider always gets whatever is left of the overall deadline.
      const budgeted = provider.timeoutMs !== null && next;
      const attemptSignal = budgeted ? AbortSignal.any([signal, AbortSignal.timeout(provider.timeoutMs!)]) : signal;
      const deadlineAt = budgeted
        ? Math.min(context.deadlineAt ?? Infinity, Date.now() + provider.timeoutMs!)
        : context.deadlineAt;
      try {
        const result = await withSignal(provider.generate(request, attemptSignal, { log, deadlineAt }), attemptSignal);
        coolingUntil.delete(provider.name);
        log?.info({ provider: provider.name }, "personas generated");
        return result;
      } catch (err) {
        // Overall deadline passed or client went away: no time left to fall back.
        if (signal.aborted) throw new UpstreamTimeoutError();
        lastError = err;
        const badOutput = err instanceof GenerationError && err.source === "output";
        if (!badOutput) coolingUntil.set(provider.name, now() + opts.cooldownMs);
        log?.warn(
          {
            provider: provider.name,
            errType: (err as Error)?.name,
            failure: badOutput ? "output" : "provider",
            fallback: next?.name ?? null,
          },
          "provider failed",
        );
      }
    }
    throw lastError;
  };
}
