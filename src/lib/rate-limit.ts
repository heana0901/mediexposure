/**
 * 아주 단순한 인메모리 rate limit.
 *
 * 서버리스 환경에서는 인스턴스마다 카운터가 따로 유지되므로 완벽하지 않습니다.
 * 정교한 제한이 필요해지면 Upstash Redis 같은 외부 저장소로 교체하세요.
 * 지금 목적은 한 사람이 진단 버튼을 연타하는 것을 막는 정도입니다.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    // 오래된 항목 정리 (메모리 누수 방지)
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) {
        if (v.resetAt <= now) buckets.delete(k);
      }
    }
    return { ok: true, retryAfterSec: 0 };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

/** 프록시 뒤에서 클라이언트 IP를 추정합니다. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
