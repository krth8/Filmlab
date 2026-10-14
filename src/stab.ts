import type { Corr } from './geo';
import type { Item } from './model';

/** Stabilisation correction for item `it` at time `t` (seconds). Filled in by the analysis module. */
export function corrAt(it: Item, t: number, strength: number): Corr | null {
  void it; void t; void strength;
  return null;
}
