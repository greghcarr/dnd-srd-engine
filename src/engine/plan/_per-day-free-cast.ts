// Slice 819: shared per-day "N/Day" free-cast metering for the dedicated
// planners that live OFF the generic castSpell path — Misty Step (817),
// Counterspell, and Shield (Protective Magic). Each of those is its own
// planner (it needs a destination, a triggering attack, etc.), yet a
// slot-less NPC caster casts it from a `perLongRest` GrantSpell bucket the
// same way: meter against `perDayCastsUsed` and emit `PerDayCastUsed`
// instead of `SpellSlotConsumed`.
//
// This mirrors castSpell's slice-794/818 free-cast path (resolve the
// `perLongRest` grant → check the budget, shared across a `perDayPoolId`
// group when set → emit PerDayCastUsed). castSpell keeps its own copy
// because it also handles the oncePerLongRest / pool-resource paths; this
// helper is the perDay+pool subset the three dedicated planners share.

import { buildEffectStack } from '../../derive/effect-stack.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { PerDayCastUsedEvent } from '../../schemas/events/spellcasting.js';
import type { ULID } from '../ids-utils.js';

/**
 * Resolve a slot-less per-day free cast of `spellId` by the bearer, returning
 * the `PerDayCastUsed` event to emit in place of `SpellSlotConsumed`. Throws
 * if the bearer has no `perLongRest` grant for the spell, or the (possibly
 * pooled) daily budget is spent.
 */
export const resolvePerDayFreeCast = (
  state: CampaignState,
  content: ResolvedContent,
  casterId: string,
  spellId: string,
  at?: string,
): PerDayCastUsedEvent => {
  const caster = state.characters[casterId];
  if (caster === undefined) throw new Error(`Caster ${casterId} not found`);
  const name = content.spells.get(spellId)?.name ?? spellId;
  const granted = buildEffectStack({
    character: caster,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  }).grantedSpells();
  const perDayGrant = granted.find((g) => g.spellId === spellId && g.preparation === 'perLongRest');
  if (perDayGrant === undefined) {
    throw new Error(`${caster.name} cannot free-cast ${name}: no per-day grant for this spell`);
  }
  const budget = perDayGrant.usesPerLongRest ?? 1;
  // Slice 818: a `perDayPoolId` shares one budget across every granted spell
  // tagged with the same pool (Protective Magic = Counterspell + Shield,
  // 3/Day total). Sum each member's per-spell counter; else meter this spell.
  const poolId = perDayGrant.perDayPoolId;
  const used =
    poolId !== undefined
      ? granted
          .filter((g) => g.perDayPoolId === poolId)
          .reduce((sum, g) => sum + (caster.perDayCastsUsed[g.spellId] ?? 0), 0)
      : caster.perDayCastsUsed[spellId] ?? 0;
  if (used >= budget) {
    throw new Error(`${caster.name} has no remaining daily uses of ${name} (${budget}/day)`);
  }
  return {
    id: newEventId() as ULID,
    at: at ?? nowIso(),
    type: 'PerDayCastUsed',
    characterId: casterId as ULID,
    spellId,
  };
};
