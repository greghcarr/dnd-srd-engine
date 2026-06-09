// Slice 771: shared creature-target enumeration for the affordance queries
// (bonusActionTargets, actionTargets). Given a reach + self / defeated rules,
// returns the combatants a creature-target option may target. Range is
// chebyshev on the combatants' feet positions (no map required); when a
// position is missing (positionless encounter) or `rangeFeet` is undefined
// (consumer-managed range, e.g. Help's "within 5 ft" gate), the range filter
// is a no-op. The authoritative validity is still the planner.

import type { CampaignState } from '../schemas/runtime/campaign.js';
import type { Position } from '../schemas/runtime/encounter.js';
import { chebyshevDistance } from '../engine/plan/movement.js';

/** Reach + self / defeated rules for a creature-target affordance option. */
export interface CreatureTargeting {
  /** Reach in feet (chebyshev). Undefined = no range filter (consumer-managed). */
  readonly rangeFeet?: number;
  /** May the option target the actor itself (beneficial self-targets like a heal)? */
  readonly includeSelf: boolean;
  /** Include creatures at 0 HP? A heal/cure can target a dying ally; an attack can't. */
  readonly includeDefeated: boolean;
}

/** A legal target: `position` present when the combatant is placed (feet). */
export interface CreatureTarget {
  readonly combatantId: string;
  readonly position?: Position;
}

export const creatureTargetsInReach = (
  state: CampaignState,
  encounterId: string,
  combatantId: string,
  targeting: CreatureTargeting,
): ReadonlyArray<CreatureTarget> => {
  const encounter = state.encounters[encounterId];
  const self = encounter?.combatants.find((c) => c.combatantId === combatantId);
  if (encounter === undefined || self === undefined) return [];
  const { rangeFeet, includeSelf, includeDefeated } = targeting;
  const selfPos = self.position;

  const out: CreatureTarget[] = [];
  for (const cb of encounter.combatants) {
    const isSelf = cb.combatantId === combatantId;
    if (isSelf && !includeSelf) continue;
    if (!includeDefeated && (state.characters[cb.combatantId]?.hp.current ?? 1) <= 0) continue;
    // Range gate (chebyshev, feet): self is always in reach; others gate only
    // when a finite reach is set and both positions are known.
    if (
      !isSelf &&
      rangeFeet !== undefined &&
      selfPos !== undefined &&
      cb.position !== undefined &&
      chebyshevDistance(selfPos, cb.position) > rangeFeet
    ) {
      continue;
    }
    out.push({ combatantId: cb.combatantId, ...(cb.position !== undefined ? { position: cb.position } : {}) });
  }
  out.sort((a, b) => (a.combatantId < b.combatantId ? -1 : a.combatantId > b.combatantId ? 1 : 0));
  return out;
};
