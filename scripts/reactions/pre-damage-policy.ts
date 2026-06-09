// Slice 750: the pre-damage reaction window for the combat-fuzz driver.
// The companion to reaction-policy.ts (post-commit damage mitigation):
// this runs BEFORE an attack's damage commits, so prevent-the-trigger
// reactions (Shield, Cutting Words) can genuinely cancel the hit.
//
// The fuzz plans an attack but does NOT commit it; it hands the planned
// (uncommitted) events here. We find the AttackRolled, and on a hit run a
// deterministic Shield -> Cutting Words cascade. A reaction's planner is
// called speculatively against the still-uncommitted state (it reads the
// reactor's slots / Bardic Inspiration / reaction, none of which the
// pending attack has touched); we commit its events only if it actually
// prevents — so a speculative Shield that wouldn't help spends nothing.
// When prevented, we commit the attack MINUS its damage chain.
//
// Determinism: the cascade order is fixed; the defending team is scanned
// in its given (stable) order for a Bard; one reaction per attack. The
// engine enforces each reactor's one-reaction-per-round economy; an
// ineligible reactor throws and is swallowed (as reaction-policy.ts does).

import { commit, type Campaign } from '../../src/engine/commit.js';
import type { Event } from '../../src/schemas/events/index.js';
import type { AttackRolledEvent } from '../../src/schemas/events/attack.js';
import type { Position } from '../../src/schemas/runtime/encounter.js';
import { chebyshevDistance } from '../../src/engine/plan/movement.js';
import { shouldShield, shouldCuttingWords, disadvantageFlipsHit } from '../../src/ai/reactions.js';
import { reactionAvailable } from './reaction-policy.js';
import type { Engine } from '../combat-fuzz-core.js';

// Protection reaches an ally within 5 ft. Positions are stored in feet
// (slice 698), so chebyshevDistance (max axis delta, in feet) is the reach.
const PROTECTION_REACH_FEET = 5;

const combatantPosition = (
  campaign: Campaign,
  encounterId: string,
  combatantId: string,
): Position | undefined =>
  campaign.state.encounters[encounterId]?.combatants.find((c) => c.combatantId === combatantId)?.position;

// Keep every event before the first damage event — this retains the
// front-loaded ActionEconomyConsumed (action + attack) and the AttackRolled
// — plus any WeaponLoaded (the loading-weapon record sits in the tail after
// the damage chain, and the weapon was still fired). Drop the damage chain
// (the damage events + the hit-consequence riders that follow them).
//
// The boundary is the first DamageRolled OR DamageApplied: most hits roll
// then apply (DamageRolled first), but rider damage (e.g. a radiant smite)
// can emit a DamageApplied with no preceding roll, so keying only on
// DamageRolled would miss it and leave the hit dealing damage.
const dropDamageChain = (events: ReadonlyArray<Event>): Event[] => {
  const firstDamage = events.findIndex(
    (e) => e.type === 'DamageRolled' || e.type === 'DamageApplied',
  );
  if (firstDamage === -1) return [...events];
  const preDamage = events.slice(0, firstDamage);
  const loadedTail = events.slice(firstDamage).filter((e) => e.type === 'WeaponLoaded');
  return [...preDamage, ...loadedTail];
};

// Speculative Shield: returns its events only when the +5 AC actually
// converts the hit into a miss (the caller has already confirmed
// shouldShield, so this is normally true; the guard is defensive). Returns
// null on any ineligibility (no slot, reaction spent) — nothing committed.
const tryShield = (
  engine: Engine,
  campaign: Campaign,
  casterId: string,
  ar: AttackRolledEvent,
): ReadonlyArray<Event> | null => {
  try {
    const { events, preventedHit } = engine.plan.shield(campaign.state, {
      casterId,
      triggeringAttackEventId: ar.id,
      triggeringAttackTotal: ar.total,
      originalAC: ar.targetAC,
      slotLevel: 1,
    });
    return preventedHit ? events : null;
  } catch {
    return null;
  }
};

const tryCuttingWords = (
  engine: Engine,
  campaign: Campaign,
  bardId: string,
  ar: AttackRolledEvent,
): { readonly events: ReadonlyArray<Event>; readonly preventedHit: boolean } | null => {
  try {
    const { events, preventedHit } = engine.plan.cuttingWords(campaign.state, {
      bardId,
      originalRollTotal: ar.total,
      threshold: ar.targetAC,
    });
    return { events, preventedHit };
  } catch {
    return null;
  }
};

// Protection: a shield-bearing ally imposes disadvantage on the attack.
// planProtection enforces the shield + Protection-fighting-style + reaction
// gates (it throws — before rolling — for a shield-bearer without the
// style, so we fall through). Returns the events + whether the disadvantage
// reroll flips the hit to a miss.
const tryProtection = (
  engine: Engine,
  campaign: Campaign,
  protectorId: string,
  ar: AttackRolledEvent,
): { readonly events: ReadonlyArray<Event>; readonly flipped: boolean } | null => {
  try {
    const { events, newD20 } = engine.plan.protection(campaign.state, {
      protectorId,
      attackerId: ar.attackerId,
      triggeringAttackEventId: ar.id,
    });
    return { events, flipped: disadvantageFlipsHit(ar.d20[0]!, newD20, ar.attackBonus, ar.targetAC) };
  } catch {
    return null;
  }
};

// Run the pre-damage reaction window over a planned (uncommitted) attack
// and commit the result. On a miss (or no AttackRolled) the full attack is
// committed unchanged.
export const resolveAttackWithReactions = (args: {
  readonly engine: Engine;
  readonly campaign: Campaign;
  readonly encounterId: string;
  readonly attackEvents: ReadonlyArray<Event>;
  /** Character ids on the attack target's team — scanned for Cutting-Words / Protection reactors. */
  readonly defenderTeam: ReadonlyArray<string>;
  /** Slice 753: Protection needs positions, so it only runs in tactical mode. */
  readonly isTactical: boolean;
}): Campaign => {
  const { engine, campaign, encounterId, attackEvents, defenderTeam, isTactical } = args;
  const ar = attackEvents.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
  if (ar === undefined || ar.hit !== true) {
    return commit(campaign, [...attackEvents]);
  }
  const targetId = ar.targetId;

  // 1. Shield — the attack's target defends itself.
  const defender = campaign.state.characters[targetId];
  if (
    defender !== undefined
    && reactionAvailable(campaign.state, encounterId, targetId)
    && shouldShield(defender, ar.total, ar.targetAC)
  ) {
    const shieldEvents = tryShield(engine, campaign, targetId, ar);
    if (shieldEvents !== null) {
      return commit(campaign, [...dropDamageChain(attackEvents), ...shieldEvents]);
    }
  }

  // 2. Protection — a shield-bearing ally within 5 ft imposes disadvantage.
  //    Tactical-only (needs positions); only on a normal single-d20 attack
  //    (no advantage/disadvantage stacking). The reaction is spent whether
  //    or not it flips the hit (RAW: declared before the reroll is known).
  if (isTactical && ar.used === 'none' && ar.d20.length === 1) {
    const targetPos = combatantPosition(campaign, encounterId, targetId);
    if (targetPos !== undefined) {
      const protectorId = defenderTeam.find((id) => {
        if (id === targetId) return false;
        const c = campaign.state.characters[id];
        if (c === undefined || c.equipped.shield === undefined) return false;
        if (!reactionAvailable(campaign.state, encounterId, id)) return false;
        const pos = combatantPosition(campaign, encounterId, id);
        return pos !== undefined && chebyshevDistance(pos, targetPos) <= PROTECTION_REACH_FEET;
      });
      if (protectorId !== undefined) {
        const prot = tryProtection(engine, campaign, protectorId, ar);
        if (prot !== null) {
          const finalEvents = prot.flipped
            ? [...dropDamageChain(attackEvents), ...prot.events]
            : [...attackEvents, ...prot.events];
          return commit(campaign, finalEvents);
        }
      }
    }
  }

  // 3. Cutting Words — a Bard on the target's team reduces the attacker's roll.
  const bardId = defenderTeam.find((id) => {
    const c = campaign.state.characters[id];
    return c !== undefined
      && reactionAvailable(campaign.state, encounterId, id)
      && shouldCuttingWords(c, ar.total, ar.targetAC);
  });
  if (bardId !== undefined) {
    const cut = tryCuttingWords(engine, campaign, bardId, ar);
    if (cut !== null) {
      // Bardic Inspiration is spent whether or not it prevented (RAW). When
      // it prevents, drop the damage; otherwise the hit lands as normal.
      const finalEvents = cut.preventedHit
        ? [...dropDamageChain(attackEvents), ...cut.events]
        : [...attackEvents, ...cut.events];
      return commit(campaign, finalEvents);
    }
  }

  // 4. No reaction — commit the full attack unchanged.
  return commit(campaign, [...attackEvents]);
};
