type AdmissionOptions = { maxStarts: number; windowMs: number; maxInFlight: number; now?: () => number };

// A bounded, process-local backstop only. It is not a distributed rate limiter.
// One shared bucket intentionally avoids retaining attacker-controlled keys.
export function createAdmission(options: AdmissionOptions) {
  const { maxStarts, windowMs, maxInFlight, now = () => performance.now() } = options;
  if (!Number.isSafeInteger(maxStarts) || maxStarts < 1 || !Number.isSafeInteger(maxInFlight) || maxInFlight < 1 || !Number.isFinite(windowMs) || windowMs <= 0) throw new Error('Invalid admission settings');
  let start: number | null = null;
  let starts = 0;
  let inFlight = 0;
  return { enter(): (() => void) | null {
    let current: number;
    try { current = now(); } catch { return null; }
    if (!Number.isFinite(current) || (start !== null && current < start)) return null;
    if (start === null || current - start >= windowMs) { start = current; starts = 0; }
    if (starts >= maxStarts || inFlight >= maxInFlight) return null;
    starts++; inFlight++;
    let released = false;
    return () => { if (!released) { released = true; inFlight--; } };
  }};
}

export async function withAdmission<T>(gate: ReturnType<typeof createAdmission>, work: () => Promise<T>): Promise<{ admitted: true; value: T } | { admitted: false }> {
  const release = gate.enter();
  if (!release) return { admitted: false };
  try { return { admitted: true, value: await work() }; }
  finally { release(); }
}
