import type { Character } from '../schemas/runtime/character.js';
import type { ItemInstance } from '../schemas/runtime/item-instance.js';
import type { ResolvedContent } from '../content/pack.js';
import { computeCarryingCapacity } from './carrying-capacity.js';

// Slice 865 — RAW (SRD 5.2.1, Carrying Capacity) has NO 2014-style
// "encumbered" / "heavily encumbered" tiers. A creature can carry up to its
// carry capacity (size × STR × 15); to move more it must drag, lift, or push
// (up to double that), and while doing so "your Speed can be no more than 5
// feet." So encumbrance is binary: within capacity, or over it. The carry +
// push/drag/lift values come from the single `computeCarryingCapacity` source
// (which is size-scaled and Powerful-Build-aware). The over-capacity Speed cap
// itself is applied in the speed derive (slice 866).
export interface EncumbranceResult {
  /** Total weight (lb) of the carried inventory. */
  readonly carriedWeight: number;
  /** Maximum weight the creature can carry (STR × 15 × size factor). */
  readonly carryCapacity: number;
  /** Maximum it can drag, lift, or push (double the carry capacity). */
  readonly pushDragLiftCapacity: number;
  /** True when `carriedWeight` exceeds `carryCapacity` — RAW: the creature is
   *  then dragging/lifting/pushing, so its Speed is capped at 5 ft. */
  readonly overCapacity: boolean;
}

export interface ComputeEncumbranceInput {
  readonly character: Character;
  readonly itemInstances: Readonly<Record<string, ItemInstance>>;
  readonly content: ResolvedContent;
}

export const computeEncumbrance = (input: ComputeEncumbranceInput): EncumbranceResult => {
  const { capacity, pushDragLift } = computeCarryingCapacity(input.character, input.content);
  let carriedWeight = 0;
  for (const instanceId of input.character.inventory) {
    const instance = input.itemInstances[instanceId];
    if (!instance) continue;
    const def = input.content.items.get(instance.definitionId);
    const weight = def?.weight ?? 0;
    carriedWeight += weight * (instance.quantity ?? 1);
  }
  return {
    carriedWeight,
    carryCapacity: capacity,
    pushDragLiftCapacity: pushDragLift,
    overCapacity: carriedWeight > capacity,
  };
};
