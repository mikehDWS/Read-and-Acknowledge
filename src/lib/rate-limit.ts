// Fixed-window, in-memory rate limiter. Good for a single server; put a shared store
// (or the hosting platform's limiter) in front when running more than one instance.
type Bucket = { count: number; resetAt: number };

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Records a hit and returns whether it is within the limit. */
  hit(key: string, now: number = Date.now()): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      this.prune(now);
      return true;
    }
    bucket.count += 1;
    return bucket.count <= this.limit;
  }

  private prune(now: number) {
    if (this.buckets.size < 10_000) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

const globalForLimits = globalThis as unknown as { loginLimiter?: RateLimiter };
export const loginLimiter = (globalForLimits.loginLimiter ??= new RateLimiter(20, 15 * 60_000));
