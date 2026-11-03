export function createRateLimiter({ max = 120, windowMs = 60000, maxKeys = 10000 } = {}) {
  const entries = new Map();
  return (key, now = Date.now()) => {
    // Prune expired entries and cap storage without trusting forwarded IP headers.
    if (entries.size >= maxKeys) {
      for (const [id, entry] of entries) if (entry.reset <= now) entries.delete(id);
      if (!entries.has(key) && entries.size >= maxKeys) return false;
    }
    let entry = entries.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      entries.set(key, entry);
    }
    return ++entry.count <= max;
  };
}
