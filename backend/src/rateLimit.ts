/**
 * Single-instance, in-memory sliding-window limiter. Suitable only because the
 * demo runs exactly one service instance; state resets on restart.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a hit if allowed. Returns 0 when allowed, otherwise ms until a slot frees up. */
  take(key: string): number {
    const t = this.now();
    const cutoff = t - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((ts) => ts > cutoff);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return Math.max(1, list[0]! + this.windowMs - t);
    }
    list.push(t);
    this.hits.set(key, list);
    return 0;
  }

  /** Undo the most recent hit for a key (used when a later limiter rejects the request). */
  release(key: string): void {
    const list = this.hits.get(key);
    if (list && list.length > 0) list.pop();
  }

  /** Drop empty/expired keys so the map cannot grow unbounded. */
  sweep(): void {
    const cutoff = this.now() - this.windowMs;
    for (const [key, list] of this.hits) {
      const kept = list.filter((ts) => ts > cutoff);
      if (kept.length === 0) this.hits.delete(key);
      else this.hits.set(key, kept);
    }
  }
}
