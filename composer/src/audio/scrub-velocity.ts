type ScrubSample = { time: number; wallClockMs: number };

type ComputeScrubVelocityOpts = {
  minDtMs: number;
  minRate: number;
  maxRate: number;
  minAudibleRate: number;
};

function computeScrubVelocity(prev: ScrubSample | null, curr: ScrubSample, opts: ComputeScrubVelocityOpts): number {
  if (!prev) return 0;
  if (!Number.isFinite(curr.time) || !Number.isFinite(prev.time)) return 0;
  if (!Number.isFinite(curr.wallClockMs) || !Number.isFinite(prev.wallClockMs)) return 0;
  const rawDtMs = curr.wallClockMs - prev.wallClockMs;
  const dtMs = rawDtMs > 0 ? rawDtMs : opts.minDtMs;
  const rawRate = (curr.time - prev.time) / (dtMs / 1000);
  const magnitude = Math.abs(rawRate);
  if (magnitude < opts.minAudibleRate) return 0;
  return Math.max(opts.minRate, Math.min(opts.maxRate, magnitude));
}

const DEFAULT_SCRUB_OPTS: ComputeScrubVelocityOpts = {
  minDtMs: 16,
  minRate: 0.25,
  maxRate: 4,
  minAudibleRate: 0.1,
};

export { computeScrubVelocity, DEFAULT_SCRUB_OPTS };
export type { ScrubSample, ComputeScrubVelocityOpts };
