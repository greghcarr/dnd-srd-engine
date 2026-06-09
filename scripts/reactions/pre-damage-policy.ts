// Slice 750: the pre-damage reaction window for the combat-fuzz driver.
// The companion to reaction-policy.ts (post-commit damage mitigation):
// this runs BETWEEN an attack's roll and its damage, so prevent-the-trigger
// reactions (Shield, Cutting Words, Protection) can genuinely cancel the hit.
//
// Slice 755: re-wired onto the engine two-phase attack API. We take the
// attack INTENT (not pre-planned events) and call engine.plan.attackRoll
// (uncommitted) to get the roll events + an opaque handle. On a hit we run a
// deterministic Shield -> Protection -> Cutting Words cascade; a reaction's
// planner is called speculatively against the still-uncommitted state (it
// reads the reactor's slots / Bardic Inspiration / reaction, none of which
// the roll has touched), and we commit its events only if it actually
// prevents. When prevented we commit the roll events + the loading-weapon
// tail and NEVER call engine.plan.attackDamage — so the damage dice and
// on-hit riders are never rolled (no discarded rng). When the hit stands we
// commit the roll + engine.plan.attackDamage(roll) (the full attack).
//
// engine.plan.attackDamage(roll) consumes the damage rng, so it is called
// at most once per attack, only on a path that actually deals damage.
//
// Determinism: the cascade order is fixed; the defending team is scanned
// in its given (stable) order for a Bard; one reaction per attack. The
// engine enforces each reactor's one-reaction-per-round economy; an
// ineligible reactor throws and is swallowed (as reaction-policy.ts does).

import { commit, type Campaign } from '../../src/engine/commit.js';
import type { Event } from '../../src/schemas/events/index.js';
import type { AttackRolledEvent } from '../../src/schemas/events/attack.js';
import type { AttackIntent } from '../../src/engine/plan/attack.js';
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

// Run the pre-damage reaction window over an attack intent and commit the
// result. Phase 1 (engine.plan.attackRoll) is planned here, uncommitted; on
// a miss the full attack is committed (roll + the loading-weapon tail, no
// damage rolled). On a hit, a Shield -> Protection -> Cutting Words cascade
// decides whether the hit is prevented (commit roll + tail + the reaction,
// no engine.plan.attackDamage call) or stands (commit roll + attackDamage +
// any spent-but-ineffective reaction).
export const resolveAttackWithReactions = (args: {
  readonly engine: Engine;
  readonly campaign: Campaign;
  readonly encounterId: string;
  readonly attackIntent: Omit<AttackIntent, 'type'>;
  /** Character ids on the attack target's team — scanned for Cutting-Words / Protection reactors. */
  readonly defenderTeam: ReadonlyArray<string>;
  /** Slice 753: Protection needs positions, so it only runs in tactical mode. */
  readonly isTactical: boolean;
}): Campaign => {
  const { engine, campaign, encounterId, attackIntent, defenderTeam, isTactical } = args;
  const { events: rollEvents, roll } = engine.plan.attackRoll(campaign.state, attackIntent);
  const ar: AttackRolledEvent | undefined = roll.attackRolled;

  // The full attack (roll + damage): engine.plan.attackDamage rolls the
  // damage dice + on-hit riders. Called at most once, only when the hit
  // stands. On a prevent we never call it (no discarded rng).
  const damageEvents = (): ReadonlyArray<Event> => engine.plan.attackDamage(roll).events;

  // Miss (or no roll) — commit roll + the loading-weapon tail (attackDamage
  // on a miss contributes only the tail; no damage rolled).
  if (!roll.hit || ar === undefined) {
    return commit(campaign, [...rollEvents, ...damageEvents()]);
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
      return commit(campaign, [...rollEvents, ...roll.tail, ...shieldEvents]);
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
          return prot.flipped
            ? commit(campaign, [...rollEvents, ...roll.tail, ...prot.events])
            : commit(campaign, [...rollEvents, ...damageEvents(), ...prot.events]);
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
      // it prevents, the damage is never rolled; otherwise the hit lands.
      return cut.preventedHit
        ? commit(campaign, [...rollEvents, ...roll.tail, ...cut.events])
        : commit(campaign, [...rollEvents, ...damageEvents(), ...cut.events]);
    }
  }

  // 4. No reaction — commit the full attack.
  return commit(campaign, [...rollEvents, ...damageEvents()]);
};
