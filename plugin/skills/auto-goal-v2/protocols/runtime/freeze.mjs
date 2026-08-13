/**
 * Deep-freeze helper for protocol constant tables.
 *
 * Protocol tables are single sources of truth (design §2.4, §2.5, §2.6). A caller
 * that mutates one would silently change gate behaviour everywhere, so every
 * exported table is frozen at module load.
 */

/** Recursively freeze plain objects and arrays. Returns the same reference. */
export function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}
