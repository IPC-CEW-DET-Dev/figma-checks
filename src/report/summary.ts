import type { ComponentResult } from "../types.js";

/** A component passes when it has no error and no failing style tokens. */
export function isComponentPassing(result: ComponentResult): boolean {
  if (result.error) return false;
  if (result.styleDiffs.some((d) => !d.pass)) return false;
  return true;
}
