// Slice 864 (Area 6 `attune-prereq-not-validated`): the RAW attunement
// preconditions the reducer can't enforce. `applyItemAttuned` already gates
// the 3-slot limit and double-attunement, but it is content-less, so it can't
// see whether an item even REQUIRES attunement nor its restriction text.
// Attunement entry is consumer-committed (there is no planAttune planner), so
// — as with `validateMulticlass` (slice 810) and `validateBackgroundAbility
// Increase` (slice 793) — the engine provides the check a consumer runs
// before committing the ItemAttuned event.
//
// RAW (Magic Items / Attunement): a magic item can be attuned only if it
// "Requires Attunement"; some add a restriction ("Requires Attunement by a
// Dwarf", "... by a Spellcaster"). That restriction is free-form prose, so
// the engine can't machine-verify it — it is returned for the consumer / DM
// to confirm.

import type { Character } from '../schemas/runtime/character.js';
import type { ItemInstance } from '../schemas/runtime/item-instance.js';
import type { ResolvedContent } from '../content/pack.js';

// Mirrors the reducer's own limit (src/engine/reducers/inventory.ts). RAW:
// "a creature can be attuned to no more than three magic items at a time."
export const MAX_ATTUNED_ITEMS = 3;

export interface AttunementValidation {
  /** Machine-checkable blockers; empty = the engine sees no blocker. */
  readonly issues: string[];
  /** The item's free-form attunement restriction (class / species / etc.),
   *  which the engine can't verify — the consumer / DM confirms the character
   *  qualifies. Absent when the item carries no restriction. */
  readonly unverifiedCondition?: string;
}

// Returns the attunement blockers the engine CAN check (the item doesn't
// require attunement, is already attuned, or the 3-slot limit is full), plus
// the free-form restriction text for the consumer to confirm. `issues` empty
// + no `unverifiedCondition` ⇒ the character may attune the item outright.
export const validateAttunement = (
  character: Character,
  instance: ItemInstance,
  content: ResolvedContent,
): AttunementValidation => {
  const issues: string[] = [];
  const def = content.items.get(instance.definitionId);
  if (def === undefined) {
    return { issues: [`Unknown item definition ${instance.definitionId}`] };
  }
  const requiresAttunement = (def as { requiresAttunement?: boolean }).requiresAttunement === true;
  if (!requiresAttunement) {
    issues.push(`${def.name} does not require attunement, so it can't be attuned.`);
  }
  if (instance.attuned === true) {
    issues.push(`${def.name} is already attuned.`);
  }
  if (character.equipped.attuned.length >= MAX_ATTUNED_ITEMS) {
    issues.push(`${character.name} already has the maximum of ${MAX_ATTUNED_ITEMS} attuned items.`);
  }
  const unverifiedCondition = (def as { attunementCondition?: string }).attunementCondition;
  return unverifiedCondition !== undefined ? { issues, unverifiedCondition } : { issues };
};
