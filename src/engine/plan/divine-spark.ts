import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { DamageAppliedEvent, HealedEvent } from '../../schemas/events/combat.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import { rollSaveAgainstDC } from './_save-roll.js';
import { rollDie } from '../../rng/dice.js';
import { computeSpellSaveDC } from '../../derive/spell-dc.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { interceptFatalDamage } from '../../derive/fatal-damage-intercept.js';
import { planConcentrationOnDamage } from './concentration.js';
import { applyAll } from '../apply.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const CLERIC_CLASS_ID = 'cleric';
const CHANNEL_DIVINITY_LEVEL = 2;
const CHANNEL_DIVINITY_RESOURCE = 'channel-divinity';
const DIVINE_SPARK_DIE = 8;
const DIVINE_SPARK_BASE_DICE = 1;
const DIVINE_SPARK_SCALE_LEVEL_FIRST = 7;
const DIVINE_SPARK_SCALE_LEVEL_SECOND = 13;
const DIVINE_SPARK_SCALE_LEVEL_THIRD = 18;
const WIS_MOD_BREAKDOWN_SOURCE = 'WIS-mod';
const DIVINE_SPARK_SOURCE = 'divine-spark';
const DIVINE_SPARK_DAMAGE_TYPES = ['necrotic', 'radiant'] as const;
type DivineSparkDamageType = (typeof DIVINE_SPARK_DAMAGE_TYPES)[number];

// RAW dice progression (PHB 2024 / SRD 5.2.1):
//   levels 2-6:   1d8
//   levels 7-12:  2d8
//   levels 13-17: 3d8
//   levels 18+:   4d8
export const divineSparkDiceCount = (clericLevel: number): number =>
  DIVINE_SPARK_BASE_DICE +
  (clericLevel >= DIVINE_SPARK_SCALE_LEVEL_FIRST ? 1 : 0) +
  (clericLevel >= DIVINE_SPARK_SCALE_LEVEL_SECOND ? 1 : 0) +
  (clericLevel >= DIVINE_SPARK_SCALE_LEVEL_THIRD ? 1 : 0);

const rollPool = (count: number, rng: RNG): number => {
  let total = 0;
  for (let i = 0; i < count; i++) total += rollDie(DIVINE_SPARK_DIE, rng);
  return total;
};

export interface DivineSparkIntent {
  readonly type: 'DivineSpark';
  readonly clericId: string;
  readonly targetId: string;
  // Caster picks the mode at activation. RAW: "You either restore Hit
  // Points to the creature equal to that total or force the creature
  // to make a Constitution saving throw."
  readonly mode: 'heal' | 'damage';
  // Required in damage mode (RAW: caster's choice between Necrotic and
  // Radiant). Ignored in heal mode.
  readonly damageType?: DivineSparkDamageType;
  readonly at?: string;
}

// Cleric L2 Channel Divinity option (PHB 2024, SRD 5.2.1): "As a Magic
// action, you point your Holy Symbol at another creature you can see
// within 30 feet of yourself and focus divine energy at it. Roll 1d8
// and add your Wisdom modifier. You either restore Hit Points to the
// creature equal to that total or force the creature to make a
// Constitution saving throw. On a failed save, the creature takes
// Necrotic or Radiant damage (your choice) equal to that total. On a
// successful save, the creature takes half as much damage (round down)."
//
// Spends 1 Channel Divinity use. Save DC = cleric's spell save DC
// (8 + WIS + PB). Dice scale 1d8 / 2d8 / 3d8 / 4d8 at cleric levels 2 /
// 7 / 13 / 18. The WIS modifier is added once to the rolled total (not
// per-die), per RAW. The pooled total drives both the heal amount and
// the damage amount; the damage path mitigates via the standard
// pipeline (resistance / vulnerability / immunity / fatal intercept /
// concentration-on-damage) and the heal path emits a single Healed
// event matching the lay-on-hands / lands-aid shape.
//
// Sibling of planTurnUndead and planLandsAid; mirror the same action-
// economy gate (Magic action consumed only when the cleric is the
// active combatant). Range (30 ft) and target visibility are consumer-
// supplied (the engine has no positions).
export const planDivineSpark = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: DivineSparkIntent,
): ReadonlyArray<Event> => {
  const cleric = state.characters[intent.clericId];
  if (!cleric) throw new Error(`Unknown character ${intent.clericId}`);
  const enrollment = cleric.classes.find((c) => c.classId === CLERIC_CLASS_ID);
  if (enrollment === undefined || enrollment.level < CHANNEL_DIVINITY_LEVEL) {
    throw new Error(
      `${cleric.name} does not have Channel Divinity (requires Cleric level ${CHANNEL_DIVINITY_LEVEL})`,
    );
  }

  const resource = cleric.resources.find((r) => r.resourceId === CHANNEL_DIVINITY_RESOURCE);
  if (resource === undefined || resource.current <= 0) {
    throw new Error(
      `${cleric.name} has no Channel Divinity uses remaining (regain on a Short or Long Rest)`,
    );
  }

  if (intent.mode === 'damage' && intent.damageType === undefined) {
    throw new Error(
      `Divine Spark damage mode requires damageType ('necrotic' or 'radiant')`,
    );
  }

  const target = state.characters[intent.targetId];
  if (!target) throw new Error(`Unknown target ${intent.targetId}`);

  const at = intent.at ?? nowIso();
  const dcResult = computeSpellSaveDC({
    character: cleric,
    itemInstances: state.itemInstances,
    content,
    classId: CLERIC_CLASS_ID,
    pendingChoices: state.pendingChoices,
  });
  const dc = dcResult.total;
  const wisMod =
    dcResult.breakdown.find((e) => e.source === WIS_MOD_BREAKDOWN_SOURCE)?.value ?? 0;
  const diceCount = divineSparkDiceCount(enrollment.level);

  const events: Event[] = [];

  // Action-economy gate (Magic action). Only in-combat / active-turn
  // calls consume the action; out-of-combat use just resolves the
  // effect.
  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const clericCb = encounter?.combatants.find((c) => c.combatantId === intent.clericId);
    if (clericCb !== undefined) {
      const active = encounter?.combatants[encounter.activeIndex];
      if (active?.combatantId === intent.clericId) {
        if (active.turnUsage.actionUsed) {
          throw new Error(`${cleric.name} has already used their action this turn`);
        }
        events.push({
          id: newEventId() as ULID,
          at,
          type: 'ActionEconomyConsumed',
          encounterId: activeEncounterId,
          combatantId: intent.clericId,
          kind: 'action',
        } satisfies ActionEconomyConsumedEvent);
      }
    }
  }

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ResourceSpent',
    characterId: intent.clericId as ULID,
    resourceId: CHANNEL_DIVINITY_RESOURCE,
    amount: 1,
  } satisfies ResourceSpentEvent);

  // One pooled roll drives both modes. WIS mod added once (RAW).
  const rolled = rollPool(diceCount, rng);
  const total = Math.max(0, rolled + wisMod);

  if (intent.mode === 'heal') {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'Healed',
      targetId: intent.targetId as ULID,
      amount: total,
      source: DIVINE_SPARK_SOURCE,
    } satisfies HealedEvent);
    return events;
  }

  // Damage mode: CON save, full on fail, half on success.
  const damageType = intent.damageType as DivineSparkDamageType;
  const saveResult = rollSaveAgainstDC({
    state,
    content,
    targetId: intent.targetId,
    ability: 'CON',
    dc,
    sourceIsMagical: true,
    rng,
    at,
  });
  if (saveResult === undefined) return events;
  events.push(saveResult.event);

  const dealt = saveResult.success ? Math.floor(total / 2) : total;
  if (dealt <= 0) return events;

  const mitigated = mitigateDamage({
    character: target,
    itemInstances: state.itemInstances,
    content,
    rawComponents: [{ amount: dealt, type: damageType }],
    characters: state.characters,
    sourceIsMagical: true,
  });
  const intercept = interceptFatalDamage({
    state: applyAll(state, events),
    content,
    targetId: intent.targetId,
    mitigatedComponents: mitigated,
    causedByEventId: saveResult.event.id,
    at,
    rng,
  });
  const damageApplied: DamageAppliedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'DamageApplied',
    targetId: intent.targetId as ULID,
    components: intercept.components,
    causedByEventId: saveResult.event.id,
    sourceCharacterId: intent.clericId as ULID,
    source: DIVINE_SPARK_SOURCE,
  };
  events.push(damageApplied);
  events.push(...intercept.extraEvents);
  events.push(
    ...planConcentrationOnDamage(
      state,
      content,
      rng,
      target,
      intercept.components,
      damageApplied.id,
      at,
    ),
  );

  return events;
};
