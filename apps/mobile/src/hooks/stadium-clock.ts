const phaseMs = 6000;

// Anchor server time at the midpoint of the round trip. All phones use the same UTC boundaries.
export function stadiumClock(epochMs: number, sent: number, received: number) {
  if (!Number.isSafeInteger(epochMs) || epochMs <= 0 || received < sent || received - sent > 2000) return null;
  return { epochMs, midpoint: (sent + received) / 2 };
}

export function stadiumPhase(clock: NonNullable<ReturnType<typeof stadiumClock>>, point: number) {
  const time = Math.floor(clock.epochMs + point - clock.midpoint);
  return { white: Math.floor(time / phaseMs) % 2 === 1, nextIn: phaseMs - time % phaseMs };
}
