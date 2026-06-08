// Slice 749: the auto-reaction policy — engine orchestration around the
// pure decision logic in src/ai/reactions.ts. Not pure (it commits
// reaction events), so it lives in scripts/ apart from the decision
// helpers, mirroring scripts/tactical/move-policy.ts.
//
// makeAutoReactionPolicy returns a ReactionPolicy: after each committed
// action, scan the events it produced for DamageApplied, and for each
// damaged combatant that still has its reaction, fire the single
// damage-mitigation reaction the pure policy selects (Uncanny Dodge /
// Deflect Attacks / Stone's Endurance) via the engine's planner. Those
// planners emit a compensating Healed event, so firing them AFTER the
// damage already committed nets the correct HP — replay-safe.
//
// Determinism: reactors are processed in producedEvents order; each takes
// at most one reaction; the engine enforces one-reaction-per-round and
// rejects an already-spent / ineligible reactor, which we swallow exactly
// like resolveOpportunityAttacks. Depth-bounded — reactions committed
// here are not themselves re-scanned for further reactions.

import { commit, type Campaign } from '../../src/engine/commit.js';
import type { Event } from '../../src/schemas/events/index.js';
import type { DamageAppliedEvent } from '../../src/schemas/events/combat.js';
import type { AttackRolledEvent } from '../../src/schemas/events/attack.js';
import type { CampaignState } from '../../src/schemas/runtime/campaign.js';
import {
  pickDamageReaction,
  type DamageReaction,
  type PhysicalDamageType,
} from '../../src/ai/reactions.js';
import { PHYSICAL_DAMAGE_TYPES } from '../../src/ai/reaction-constants.js';
import type { Engine, ReactionPolicy, ReactionPolicyContext } from '../combat-fuzz-core.js';

const isPhysical = (t: string): t is PhysicalDamageType =>
  (PHYSICAL_DAMAGE_TYPES as readonly string[]).includes(t);

// The dominant B/P/S damage type of a hit: the physical component with
// the largest amount, or undefined if the hit dealt no physical damage.
const dominantPhysicalType = (
  components: DamageAppliedEvent['components'],
): PhysicalDamageType | undefined => {
  let best: { readonly type: PhysicalDamageType; readonly amount: number } | undefined;
  for (const c of components) {
    if (isPhysical(c.type) && (best === undefined || c.amount > best.amount)) {
      best = { type: c.type, amount: c.amount };
    }
  }
  return best?.type;
};

const reactionAvailable = (
  state: CampaignState,
  encounterId: string,
  reactorId: string,
): boolean => {
  const cb = state.encounters[encounterId]?.combatants.find(
    (c) => c.combatantId === reactorId,
  );
  return cb !== undefined && cb.turnUsage.reactionUsedThisRound !== true;
};

// The id of the AttackRolled that caused a DamageApplied: the most recent
// attack (before the damage, in producedEvents) targeting the damaged
// combatant. Links Deflect Attacks to its trigger and proves the damage
// came from an attack (Deflect is attack-only). Undefined for spell/area
// damage with no preceding attack roll.
const triggeringAttackId = (
  producedEvents: ReadonlyArray<Event>,
  damageIdx: number,
  reactorId: string,
): string | undefined => {
  for (let i = damageIdx - 1; i >= 0; i -= 1) {
    const e = producedEvents[i]!;
    if (e.type === 'AttackRolled' && (e as AttackRolledEvent).targetId === reactorId) {
      return (e as AttackRolledEvent).id;
    }
  }
  return undefined;
};

const fireReaction = (
  engine: Engine,
  campaign: Campaign,
  choice: DamageReaction,
  ctx: {
    readonly reactorId: string;
    readonly total: number;
    readonly damageEventId: string;
    readonly attackEventId: string | undefined;
  },
): Campaign => {
  try {
    if (choice.kind === 'uncannyDodge') {
      const { events } = engine.plan.uncannyDodge(campaign.state, {
        characterId: ctx.reactorId,
        triggeringDamageEventId: ctx.damageEventId,
        damageAmount: ctx.total,
      });
      return commit(campaign, events);
    }
    if (choice.kind === 'deflectAttacks') {
      if (ctx.attackEventId === undefined) return campaign;
      const { events } = engine.plan.deflectAttacks(campaign.state, {
        monkId: ctx.reactorId,
        triggeringAttackEventId: ctx.attackEventId,
        incomingDamage: ctx.total,
        damageType: choice.physicalType,
      });
      return commit(campaign, events);
    }
    const { events } = engine.plan.stonesEndurance(campaign.state, {
      goliathId: ctx.reactorId,
      damageAmount: ctx.total,
      triggeringDamageEventId: ctx.damageEventId,
    });
    return commit(campaign, events);
  } catch {
    // Reactor ineligible (reaction already used, missing feature/ancestry,
    // incapacitated, or the reduction was a no-op) — skip this reaction.
    return campaign;
  }
};

export const makeAutoReactionPolicy = (): ReactionPolicy =>
  (ctx: ReactionPolicyContext): Campaign => {
    const { engine, producedEvents, encounterId } = ctx;
    let campaign = ctx.campaign;
    for (let i = 0; i < producedEvents.length; i += 1) {
      const event = producedEvents[i]!;
      if (event.type !== 'DamageApplied') continue;
      const dmg = event as DamageAppliedEvent;
      const reactorId = dmg.targetId;
      const reactor = campaign.state.characters[reactorId];
      if (reactor === undefined) continue;
      if (!reactionAvailable(campaign.state, encounterId, reactorId)) continue;
      const total = dmg.components.reduce((sum, c) => sum + c.amount, 0);
      const attackEventId = triggeringAttackId(producedEvents, i, reactorId);
      const choice = pickDamageReaction(reactor, {
        total,
        physicalType: dominantPhysicalType(dmg.components),
        fromAttack: attackEventId !== undefined,
      });
      if (choice === null) continue;
      campaign = fireReaction(engine, campaign, choice, {
        reactorId,
        total,
        damageEventId: dmg.id,
        attackEventId,
      });
    }
    return campaign;
  };
