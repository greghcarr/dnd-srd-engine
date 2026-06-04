import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { SpellSlotConsumedEvent } from '../../schemas/events/spellcasting.js';
import type { DamageAppliedEvent } from '../../schemas/events/combat.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { applyAll } from '../apply.js';
import { planConcentrationOnDamage } from './concentration.js';
import { invariant } from '../../internal/invariants.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { computeAvailableSpellSlots } from '../../derive/spell-slots.js';
import type { ULID } from '../ids-utils.js';

const D8_SIDES = 8;
const PALADIN_SMITE_BASE_DICE = 2;
const MAX_PALADIN_SLOT_LEVEL = 5;

export interface PaladinsSmiteIntent {
  readonly type: 'PaladinsSmite';
  readonly paladinId: string;
  readonly targetId: string;
  // The slot level being spent. RAW: 1st-level slot deals 2d8; +1d8
  // per slot level above 1st (max 6d8 at a 5th-level slot — Paladin's
  // top spell level). Throws on slotLevel < 1 or > 5.
  readonly slotLevel: number;
  // The triggering AttackRolled event id — caller must have just
  // committed a hit with a melee weapon or Unarmed Strike. Surfaced
  // on the emitted DamageApplied event's `causedByEventId` so the
  // chain is traceable.
  readonly triggeringAttackEventId: string;
  // True when the target is Undead or Fiend. RAW: +1d8 radiant in
  // that case. Consumer determines (engine doesn't model creature
  // types beyond statblock + species).
  readonly targetIsUndeadOrFiend?: boolean;
  readonly at?: string;
}

/**
 * RAW 2024 PHB Paladin L2 Paladin's Smite: "When you hit a creature
 * with a melee weapon or an Unarmed Strike, you can use a Bonus
 * Action to expend a Paladin spell slot to deal Radiant damage to
 * the target, in addition to the weapon's damage. The extra damage
 * is 2d8 plus 1d8 for each spell slot level higher than 1st. The
 * damage increases by 1d8 if the target is an Undead or a Fiend."
 *
 * Implementation: the consumer calls this planner after a confirmed
 * hit. The planner consumes a bonus action (when invoked on the
 * paladin's turn in an active encounter), consumes the spell slot,
 * rolls the radiant dice, and emits a DamageApplied event scoped to
 * the target. The triggering attack's own damage chain is unaffected
 * (already committed); the smite stacks on top.
 *
 * Resistances / immunities apply normally via `mitigateDamage`; the
 * smite is sourced as magical (`sourceIsMagical: true`) per RAW
 * "spell slot used" framing — radiant damage from a paladin spell
 * counts as magical for resistance-qualifier checks.
 */
export const planPaladinsSmite = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: PaladinsSmiteIntent,
): ReadonlyArray<Event> => {
  const paladin = state.characters[intent.paladinId];
  invariant(paladin !== undefined, `Character ${intent.paladinId} not found`);
  const target = state.characters[intent.targetId];
  invariant(target !== undefined, `Character ${intent.targetId} not found`);

  if (intent.slotLevel < 1 || intent.slotLevel > MAX_PALADIN_SLOT_LEVEL) {
    throw new Error(
      `Paladin's Smite requires a slot level between 1 and ${MAX_PALADIN_SLOT_LEVEL} (got ${intent.slotLevel})`,
    );
  }
  const available = computeAvailableSpellSlots(paladin, content.classes);
  const slotsLeft = available.standardByLevel[intent.slotLevel - 1] ?? 0;
  if (slotsLeft <= 0) {
    throw new Error(
      `${paladin.name} has no level-${intent.slotLevel} spell slot remaining`,
    );
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const active = encounter?.combatants[encounter.activeIndex];
    if (active && active.combatantId === intent.paladinId) {
      if (active.turnUsage.bonusActionUsed) {
        throw new Error(`${paladin.name} has already used their bonus action this turn`);
      }
      const bonusActionConsumed: ActionEconomyConsumedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: activeEncounterId,
        combatantId: intent.paladinId,
        kind: 'bonusAction',
      };
      events.push(bonusActionConsumed);
    }
  }

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'SpellSlotConsumed',
    characterId: intent.paladinId,
    slotLevel: intent.slotLevel,
  } satisfies SpellSlotConsumedEvent);

  const baseDice = PALADIN_SMITE_BASE_DICE + (intent.slotLevel - 1);
  const totalDice = baseDice + (intent.targetIsUndeadOrFiend === true ? 1 : 0);
  let rawTotal = 0;
  for (let i = 0; i < totalDice; i += 1) {
    rawTotal += rollDie(D8_SIDES, rng);
  }

  const mitigated = mitigateDamage({
    character: target,
    itemInstances: state.itemInstances,
    content,
    rawComponents: [{ amount: rawTotal, type: 'radiant' }],
    characters: state.characters,
    sourceIsMagical: true,
  });

  const damageAppliedId = newEventId() as ULID;
  events.push({
    id: damageAppliedId,
    at,
    type: 'DamageApplied',
    targetId: intent.targetId as ULID,
    components: mitigated,
    causedByEventId: intent.triggeringAttackEventId as ULID,
    sourceCharacterId: intent.paladinId as ULID,
    source: 'paladins-smite',
  } satisfies DamageAppliedEvent);

  // Slice 621: Paladin's Smite damage triggers a CON save on a
  // concentrating target like every other damage source. Same shape as
  // slice 601/612/620 wirings.
  events.push(
    ...planConcentrationOnDamage(
      applyAll(state, events),
      content,
      rng,
      target,
      mitigated,
      damageAppliedId,
      at,
    ),
  );

  return events;
};
