import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { applyHalflingLuckFromFlag, applyHalflingLuckForCharacter } from './_halfling-luck.js';
import { newEventId } from '../../ids.js';
import { D20_SIDES } from '../../internal/constants.js';
import { nowIso } from '../../internal/clock.js';
import { invariant } from '../../internal/invariants.js';
import { abilityModifier, proficiencyBonus } from '../../derive/ability.js';
import { computeTotalLevel } from '../../schemas/runtime/character.js';
import { computeSpellSaveDC } from '../../derive/spell-dc.js';
import type { ULID } from '../ids-utils.js';
import type {
  ActionEconomyConsumedEvent,
} from '../../schemas/events/action-economy.js';
import type {
  SpellCounteredEvent,
  SpellDispelledEvent,
  ItemIdentifiedEvent,
  ShieldCastEvent,
  SanctuaryProtectedEvent,
  ProtectionUsedEvent,
  GuidanceUsedEvent,
  UncannyDodgeUsedEvent,
} from '../../schemas/events/reactive-spells.js';
import { buildEffectStack } from '../../derive/effect-stack.js';
import { resolvePerDayFreeCast } from './_per-day-free-cast.js';
import type { Character } from '../../schemas/runtime/character.js';
import { computeSavingThrow } from '../../derive/save.js';
import { rollSaveBonusDice } from './_bonus-dice.js';
import type { ConditionAppliedEvent, ConditionRemovedEvent, HealedEvent } from '../../schemas/events/combat.js';
import type { DamageType } from '../../schemas/primitives.js';
import type { ConcentrationBrokenEvent } from '../../schemas/events/concentration.js';
import { newAppliedConditionId } from '../../ids.js';
import type {
  SpellSlotConsumedEvent,
} from '../../schemas/events/spellcasting.js';
import type {
  SaveRolledEvent,
  AbilityCheckRolledEvent,
} from '../../schemas/events/checks.js';

const DC_ABOVE_AUTO_FAIL = 10;
const COUNTERSPELL_SLOT_LEVEL = 3;

export const economyConsumedIfEncountered = (
  state: CampaignState,
  combatantId: string,
  at: string,
  kind: 'action' | 'reaction',
): ActionEconomyConsumedEvent | undefined => {
  if (state.activeEncounterId === undefined) return undefined;
  const encounter = state.encounters[state.activeEncounterId];
  if (encounter === undefined) return undefined;
  if (!encounter.combatants.some((c) => c.combatantId === combatantId)) return undefined;
  return {
    id: newEventId() as ULID,
    at,
    type: 'ActionEconomyConsumed',
    encounterId: encounter.id,
    combatantId,
    kind,
  };
};

/**
 * RAW 2024 PHB ch.1: "You can take only one Reaction per round." This
 * helper throws if the combatant has already used their reaction since
 * the last round boundary. Out-of-encounter (no active encounter) is a
 * no-op — reactions only exist inside initiative.
 */
export const assertReactionAvailable = (state: CampaignState, combatantId: string, label: string): void => {
  if (state.activeEncounterId === undefined) return;
  const encounter = state.encounters[state.activeEncounterId];
  if (!encounter) return;
  const combatant = encounter.combatants.find((c) => c.combatantId === combatantId);
  if (!combatant) return;
  if (combatant.turnUsage.reactionUsedThisRound) {
    const name = state.characters[combatantId]?.name ?? combatantId;
    throw new Error(`${name} cannot ${label}: reaction already used this round`);
  }
};

export interface CounterspellIntent {
  readonly type: 'Counterspell';
  readonly counterCasterId: string;
  readonly targetCasterId: string;
  readonly originalSpellEventId: string;
  readonly spellId: string;
  readonly castingClassId: string;
  readonly slotLevelToConsume?: number;
  // The slot level the target caster used. Counterspell doesn't "save"
  // the original caster's slot — the act of casting still spent it,
  // even on a successful counter (2024 RAW). Set to 0 if the countered
  // spell was a cantrip. Required so the engine can emit the original
  // caster's SpellSlotConsumed and the transcript reflects the loss.
  readonly originalSpellLevel: number;
  // Slice 819: cast from an NPC "N/Day" pool (the Mage/Archmage "Protective
  // Magic 3/Day" reaction) instead of a spell slot. The counter-caster's
  // slot is replaced by a PerDayCastUsed against the shared pool.
  readonly useFreeCast?: boolean;
  readonly at?: string;
}

export const planCounterspell = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: CounterspellIntent,
): ReadonlyArray<Event> => {
  const caster = state.characters[intent.counterCasterId];
  invariant(caster !== undefined, `Counter caster ${intent.counterCasterId} not found`);
  const target = state.characters[intent.targetCasterId];
  invariant(target !== undefined, `Target caster ${intent.targetCasterId} not found`);
  assertReactionAvailable(state, intent.counterCasterId, 'cast Counterspell');
  const at = intent.at ?? nowIso();
  const dcResult = computeSpellSaveDC({
    character: caster,
    itemInstances: state.itemInstances,
    content,
    pendingChoices: state.pendingChoices,
    classId: intent.castingClassId,
    characters: state.characters,
  });
  const dc = dcResult.total;
  const conBonus = abilityModifier(target.abilityScores.CON);
  const rolls: number[] = [rollDie(D20_SIDES, rng)];
  // Slice 543: Halfling Luck on Counterspell CON save (target side).
  const d20 = applyHalflingLuckForCharacter(rolls[0]!, target.id, state, content, rolls, rng);
  const total = d20 + conBonus;
  const saveSucceeded = total >= dc;
  const slotLevel = intent.slotLevelToConsume ?? COUNTERSPELL_SLOT_LEVEL;
  invariant(slotLevel >= COUNTERSPELL_SLOT_LEVEL, `Counterspell requires a 3rd-level or higher slot`);

  const events: Event[] = [];
  const reaction = economyConsumedIfEncountered(state, intent.counterCasterId, at, 'reaction');
  if (reaction !== undefined) events.push(reaction);
  // The original caster spent their slot the moment they began casting;
  // RAW the slot is lost even when the spell is countered. Emit that
  // first so the transcript reads in cast-then-react order.
  if (intent.originalSpellLevel > 0) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'SpellSlotConsumed',
      characterId: intent.targetCasterId,
      slotLevel: intent.originalSpellLevel,
    } satisfies SpellSlotConsumedEvent);
  }
  // Slice 819: a slot-less NPC caster (Mage/Archmage "Protective Magic
  // 3/Day") meters via the shared per-day pool instead of expending a slot.
  events.push(
    intent.useFreeCast === true
      ? resolvePerDayFreeCast(state, content, intent.counterCasterId, 'counterspell', at)
      : ({
          id: newEventId() as ULID,
          at,
          type: 'SpellSlotConsumed',
          characterId: intent.counterCasterId,
          slotLevel,
        } satisfies SpellSlotConsumedEvent),
  );
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'SaveRolled',
    targetId: intent.targetCasterId,
    ability: 'CON',
    dc,
    d20: [d20],
    used: 'none',
    bonus: conBonus,
    total,
    success: saveSucceeded,
  } satisfies SaveRolledEvent);
  if (!saveSucceeded) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'SpellCountered',
      originalSpellEventId: intent.originalSpellEventId,
      counterCasterId: intent.counterCasterId,
      targetCasterId: intent.targetCasterId,
      spellId: intent.spellId,
    } satisfies SpellCounteredEvent);
  }
  return events;
};

export interface DispelMagicIntent {
  readonly type: 'DispelMagic';
  readonly casterId: string;
  readonly effectInstanceId: string;
  readonly targetSpellLevel: number;
  readonly slotLevel: number;
  readonly castingClassId: string;
  readonly at?: string;
}

export const planDispelMagic = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: DispelMagicIntent,
): ReadonlyArray<Event> => {
  const caster = state.characters[intent.casterId];
  invariant(caster !== undefined, `Caster ${intent.casterId} not found`);
  const effect = state.effectInstances[intent.effectInstanceId];
  invariant(effect !== undefined, `EffectInstance ${intent.effectInstanceId} not found`);
  invariant(intent.slotLevel >= 3, `Dispel Magic requires a 3rd-level or higher slot`);
  const at = intent.at ?? nowIso();

  const events: Event[] = [];
  const action = economyConsumedIfEncountered(state, intent.casterId, at, 'action');
  if (action !== undefined) events.push(action);
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'SpellSlotConsumed',
    characterId: intent.casterId,
    slotLevel: intent.slotLevel,
  } satisfies SpellSlotConsumedEvent);

  const autoSucceed = intent.targetSpellLevel <= intent.slotLevel;
  let dispelSucceeds = autoSucceed;
  if (!autoSucceed) {
    const dc = DC_ABOVE_AUTO_FAIL + intent.targetSpellLevel;
    const cls = content.classes.get(intent.castingClassId);
    const rawAbility = cls?.spellcasting?.ability;
    const ability: 'INT' | 'WIS' | 'CHA' =
      rawAbility === 'INT' || rawAbility === 'WIS' || rawAbility === 'CHA' ? rawAbility : 'INT';
    const totalLevel = computeTotalLevel(caster);
    const bonus = abilityModifier(caster.abilityScores[ability]) + proficiencyBonus(totalLevel);
    const rolls: number[] = [rollDie(D20_SIDES, rng)];
    // Slice 543: Halfling Luck on Dispel Magic ability check (caster side).
    const d20 = applyHalflingLuckForCharacter(rolls[0]!, intent.casterId, state, content, rolls, rng);
    const total = d20 + bonus;
    dispelSucceeds = total >= dc;
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'AbilityCheckRolled',
      characterId: intent.casterId,
      ability,
      dc,
      success: dispelSucceeds,
      d20: rolls,
      used: 'none',
      bonus,
      total,
    } satisfies AbilityCheckRolledEvent);
  }
  if (dispelSucceeds) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'SpellDispelled',
      effectInstanceId: intent.effectInstanceId,
      dispelledByCharacterId: intent.casterId,
    } satisfies SpellDispelledEvent);
  }
  return events;
};

// Slice 134: Remove Curse. Action, 3rd-level abjuration, range
// Touch. RAW 2024: "Until the spell ends, you touch one creature
// or object, and any curse affecting that creature or object
// ends." The engine models curses as conditions with
// `category: 'curse'`. The planner walks the touched target's
// appliedConditions, emits a ConditionRemoved for each match, and
// consumes the slot + action. No save, no roll.
export interface RemoveCurseIntent {
  readonly type: 'RemoveCurse';
  readonly casterId: string;
  // The creature whose curses are being stripped. (Object curses
  // aren't modeled; the engine has no curse target shape for items.)
  readonly targetId: string;
  readonly slotLevel?: number;
  readonly at?: string;
}

const REMOVE_CURSE_MIN_SLOT_LEVEL = 3;

export const planRemoveCurse = (
  state: CampaignState,
  content: ResolvedContent,
  _rng: RNG,
  intent: RemoveCurseIntent,
): ReadonlyArray<Event> => {
  const caster = state.characters[intent.casterId];
  invariant(caster !== undefined, `Caster ${intent.casterId} not found`);
  const target = state.characters[intent.targetId];
  invariant(target !== undefined, `Target ${intent.targetId} not found`);
  const slotLevel = intent.slotLevel ?? REMOVE_CURSE_MIN_SLOT_LEVEL;
  invariant(
    slotLevel >= REMOVE_CURSE_MIN_SLOT_LEVEL,
    'Remove Curse requires a 3rd-level or higher slot',
  );
  const knowsSpell =
    caster.knownSpells.includes('remove-curse') || caster.preparedSpells.includes('remove-curse');
  invariant(knowsSpell, `Caster ${intent.casterId} does not know Remove Curse`);

  const at = intent.at ?? nowIso();
  const events: Event[] = [];
  const action = economyConsumedIfEncountered(state, intent.casterId, at, 'action');
  if (action !== undefined) events.push(action);
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'SpellCastDeclared',
    characterId: intent.casterId,
    spellId: 'remove-curse',
    slotLevel,
    slotSource: 'standard',
    targetIds: [intent.targetId],
    castAsRitual: false,
  });
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'SpellSlotConsumed',
    characterId: intent.casterId,
    slotLevel,
  } satisfies SpellSlotConsumedEvent);

  // Walk the target's applied conditions; strip every entry whose
  // content-pack definition has `category: 'curse'`. RAW: "any
  // curse affecting that creature ends": no per-curse save or
  // ability check.
  for (const applied of target.appliedConditions) {
    const conditionDef = content.conditions.get(applied.conditionId);
    if (conditionDef?.category !== 'curse') continue;
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'ConditionRemoved',
      targetId: intent.targetId,
      conditionId: applied.conditionId,
    } satisfies ConditionRemovedEvent);
  }

  return events;
};

export interface IdentifyIntent {
  readonly type: 'Identify';
  readonly casterId: string;
  readonly itemInstanceId: string;
  readonly slotLevel?: number;
  readonly at?: string;
}

export const planIdentify = (
  state: CampaignState,
  _content: ResolvedContent,
  _rng: RNG,
  intent: IdentifyIntent,
): ReadonlyArray<Event> => {
  const caster = state.characters[intent.casterId];
  invariant(caster !== undefined, `Caster ${intent.casterId} not found`);
  const item = state.itemInstances[intent.itemInstanceId];
  invariant(item !== undefined, `Item ${intent.itemInstanceId} not found`);
  const at = intent.at ?? nowIso();
  const events: Event[] = [];
  const action = economyConsumedIfEncountered(state, intent.casterId, at, 'action');
  if (action !== undefined) events.push(action);
  if (intent.slotLevel !== undefined && intent.slotLevel >= 1) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'SpellSlotConsumed',
      characterId: intent.casterId,
      slotLevel: intent.slotLevel,
    } satisfies SpellSlotConsumedEvent);
  }
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ItemIdentified',
    itemInstanceId: intent.itemInstanceId,
    identifiedByCharacterId: intent.casterId,
  } satisfies ItemIdentifiedEvent);
  return events;
};

const SHIELD_AC_BONUS = 5;
const SHIELD_MIN_SLOT_LEVEL = 1;

export interface ShieldIntent {
  readonly type: 'Shield';
  readonly casterId: string;
  // The AttackRolled event id that triggered the reaction. Recorded on
  // the ShieldCast event for the transcript and for later auditing.
  readonly triggeringAttackEventId: string;
  // The d20 total (d20 + all attack modifiers) on the triggering attack.
  // Consumers extract this from the AttackRolledEvent. Used to determine
  // whether +5 AC would reduce the hit to a miss.
  readonly triggeringAttackTotal: number;
  // The AC of the caster against which the attack resolved (pre-shield).
  // Consumers extract this from the AttackRolledEvent.
  readonly originalAC: number;
  readonly slotLevel?: number;
  // Slice 819: cast from an NPC "N/Day" pool (the Mage/Archmage "Protective
  // Magic 3/Day" reaction) instead of a spell slot.
  readonly useFreeCast?: boolean;
  readonly at?: string;
}

export interface ShieldOutcome {
  readonly events: ReadonlyArray<Event>;
  readonly preventedHit: boolean;
}

/**
 * RAW 2024 PHB Shield: reaction triggered when you're hit by an attack or
 * targeted by Magic Missile. +5 to AC against the triggering attack and
 * until the start of your next turn; immune to Magic Missile damage for
 * the duration.
 *
 * The planner emits the reaction, slot, and ConditionApplied('shielded')
 * events, plus a ShieldCast notification with `preventedHit` set to
 * indicate whether the +5 was enough to convert the hit into a miss.
 * The consumer is responsible for omitting the DamageRolled/DamageApplied
 * chain when `preventedHit === true`.
 *
 * Magic Missile immunity is not yet modeled (would need per-spell
 * immunity primitive); the AC bonus is.
 */
export const planShield = (
  state: CampaignState,
  content: ResolvedContent,
  intent: ShieldIntent,
): ShieldOutcome => {
  const caster = state.characters[intent.casterId];
  invariant(caster !== undefined, `Caster ${intent.casterId} not found`);
  const slotLevel = intent.slotLevel ?? SHIELD_MIN_SLOT_LEVEL;
  invariant(slotLevel >= SHIELD_MIN_SLOT_LEVEL, 'Shield is a 1st-level spell');
  assertReactionAvailable(state, intent.casterId, 'cast Shield');
  const at = intent.at ?? nowIso();

  const events: Event[] = [];
  const reaction = economyConsumedIfEncountered(state, intent.casterId, at, 'reaction');
  if (reaction !== undefined) events.push(reaction);
  // Slice 819: Protective Magic 3/Day — a slot-less NPC caster meters via the
  // shared per-day pool instead of expending a slot.
  events.push(
    intent.useFreeCast === true
      ? resolvePerDayFreeCast(state, content, intent.casterId, 'shield', at)
      : ({
          id: newEventId() as ULID,
          at,
          type: 'SpellSlotConsumed',
          characterId: intent.casterId,
          slotLevel,
        } satisfies SpellSlotConsumedEvent),
  );
  const shieldedApplied: ConditionAppliedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ConditionApplied',
    targetId: intent.casterId,
    conditionId: 'shielded',
    appliedConditionId: newAppliedConditionId(),
  };
  events.push(shieldedApplied);
  const preventedHit = intent.triggeringAttackTotal < intent.originalAC + SHIELD_AC_BONUS;
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ShieldCast',
    casterId: intent.casterId,
    triggeringAttackEventId: intent.triggeringAttackEventId,
    preventedHit,
  } satisfies ShieldCastEvent);
  return { events, preventedHit };
};

const UNCANNY_DODGE_SOURCE = 'uncanny-dodge';

export interface UncannyDodgeIntent {
  readonly type: 'UncannyDodge';
  readonly characterId: string;
  // The DamageApplied event id whose damage prompted the reaction.
  // Recorded on the UncannyDodgeUsed event for the transcript.
  readonly triggeringDamageEventId: string;
  // The original damage amount from the triggering event. The planner
  // halves it (rounded down per RAW) and emits a compensating `Healed`
  // event so the bearer's HP nets out at half the original damage.
  readonly damageAmount: number;
  readonly at?: string;
}

export interface UncannyDodgeOutcome {
  readonly events: ReadonlyArray<Event>;
  // The damage absorbed back via the `Healed` event. Returned in the
  // outcome for transcript / consumer convenience; also surfaced on
  // the UncannyDodgeUsed notification.
  readonly halvedAmount: number;
}

/**
 * RAW 2024 PHB Rogue L5 Uncanny Dodge: when an attacker that you can
 * see hits you with an attack roll, you can take a Reaction to halve
 * the attack's damage against you (round down).
 *
 * Event-sourcing approach mirrors Absorb Elements: the triggering
 * DamageApplied has already committed when the planner runs, so
 * rather than mutate that event we emit a compensating `Healed`
 * event for `floor(damage / 2)`. The bearer's HP nets out at half
 * the original damage and the audit trail preserves both the full
 * hit and the reaction outcome.
 *
 * The "you can see the attacker" gate is consumer-side: the engine
 * doesn't model line of sight. Consumers that want to enforce it can
 * skip calling this planner when the attacker is invisible / behind
 * total cover. The reaction-economy gate (one reaction per round)
 * runs via the shared `assertReactionAvailable` helper.
 */
export const planUncannyDodge = (
  state: CampaignState,
  content: ResolvedContent,
  intent: UncannyDodgeIntent,
): UncannyDodgeOutcome => {
  const character = state.characters[intent.characterId];
  invariant(character !== undefined, `Character ${intent.characterId} not found`);

  if (intent.damageAmount < 0) {
    throw new Error('Uncanny Dodge damageAmount must be non-negative');
  }

  const effects = buildEffectStack({
    character,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  });
  if (!effects.hasUncannyDodge()) {
    throw new Error(`${character.name} does not have Uncanny Dodge`);
  }

  assertReactionAvailable(state, intent.characterId, 'use Uncanny Dodge');

  const at = intent.at ?? nowIso();
  const halvedAmount = Math.floor(intent.damageAmount / 2);

  const events: Event[] = [];
  const reaction = economyConsumedIfEncountered(state, intent.characterId, at, 'reaction');
  if (reaction !== undefined) events.push(reaction);

  if (halvedAmount > 0) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'Healed',
      targetId: intent.characterId as ULID,
      amount: halvedAmount,
      source: UNCANNY_DODGE_SOURCE,
    } satisfies HealedEvent);
  }

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'UncannyDodgeUsed',
    characterId: intent.characterId as ULID,
    triggeringDamageEventId: intent.triggeringDamageEventId as ULID,
    halvedAmount,
  } satisfies UncannyDodgeUsedEvent);

  return { events, halvedAmount };
};

const GUIDANCE_DIE_SIDES = 4;

export interface ConsumeGuidanceIntent {
  readonly type: 'ConsumeGuidance';
  readonly targetId: string;
  // Optional reference to the AbilityCheckRolledEvent the d4 is being
  // added to — purely informational, surfaces on the GuidanceUsed event
  // for transcript clarity.
  readonly abilityCheckEventId?: string;
  readonly at?: string;
}

export interface ConsumeGuidanceOutcome {
  readonly events: ReadonlyArray<Event>;
  readonly d4: number;
}

/**
 * RAW 2024 Guidance: cantrip, V/S, touch, concentration up to 1 minute.
 * The target rolls a d4 and adds the result to one ability check of
 * their choice; can roll before or after making the check; the spell
 * then ends.
 *
 * Implementation: the consumer calls this planner when the target wants
 * to spend their Guidance d4. The engine rolls the d4 and emits a
 * `GuidanceUsed` event with the value, plus a `ConcentrationBroken`
 * (reason='used') that lifts the `guided` condition from the target
 * via the standard concentration-cleanup path.
 *
 * The d4 value is returned in the outcome so the consumer can add it
 * to whichever ability check they're applying it to. The engine does
 * not modify the check's stored bonus — Guidance is the player's
 * choice to apply, and the consumer is responsible for the addition.
 */
export const planConsumeGuidance = (
  state: CampaignState,
  _content: ResolvedContent,
  rng: RNG,
  intent: ConsumeGuidanceIntent,
): ConsumeGuidanceOutcome => {
  const target = state.characters[intent.targetId];
  invariant(target !== undefined, `Target ${intent.targetId} not found`);
  const applied = target.appliedConditions.find((c) => c.conditionId === 'guided');
  invariant(
    applied !== undefined,
    `Target ${intent.targetId} does not have the guided condition`,
  );
  const effectInstanceId = (() => {
    for (const inst of Object.values(state.effectInstances)) {
      if (inst.spellId !== 'guidance') continue;
      if (inst.conditionsApplied.some((c) => c.appliedConditionId === applied.id)) {
        return inst.id;
      }
    }
    return undefined;
  })();
  invariant(
    effectInstanceId !== undefined,
    'No active Guidance effect instance backs the guided condition',
  );
  const caster = (() => {
    const inst = state.effectInstances[effectInstanceId];
    return inst === undefined ? undefined : state.characters[inst.casterId];
  })();
  invariant(caster !== undefined, 'Guidance caster not found');

  const at = intent.at ?? nowIso();
  const d4 = rollDie(GUIDANCE_DIE_SIDES, rng);
  const events: Event[] = [];
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'GuidanceUsed',
    targetId: intent.targetId as ULID,
    d4,
    ...(intent.abilityCheckEventId !== undefined
      ? { abilityCheckEventId: intent.abilityCheckEventId as ULID }
      : {}),
  } satisfies GuidanceUsedEvent);
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ConcentrationBroken',
    effectInstanceId: effectInstanceId as ULID,
    casterId: caster.id as ULID,
    reason: 'used',
  } satisfies ConcentrationBrokenEvent);
  return { events, d4 };
};

// SRD 5.2.1 Resistance lists exactly these eleven damage types (Force
// and Psychic are excluded).
const RESISTANCE_TYPES: readonly DamageType[] = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'radiant',
  'slashing',
  'thunder',
];
const RESISTANCE_DIE_SIDES = 4;
const RESISTED_CONDITION_ID = 'resisted';

export interface ConsumeResistanceIntent {
  readonly type: 'ConsumeResistance';
  readonly targetId: string;
  // The damage type the protected creature is taking. Must be the type
  // chosen at cast time and one of the eleven Resistance types. The
  // consumer supplies it (the chosen type is consumer-coordinated, the
  // same way Absorb Elements takes its triggering `damageType`).
  readonly damageType: DamageType;
  // The amount of that damage the creature just took (the reduction is
  // capped at this, so a small hit can't net into healing).
  readonly damageAmount: number;
  readonly at?: string;
}

export interface ConsumeResistanceOutcome {
  readonly events: ReadonlyArray<Event>;
  readonly d4: number;
  // The damage actually reduced (min(d4, damageAmount)).
  readonly reduction: number;
}

/**
 * SRD 5.2.1 Resistance: cantrip, V/S, touch, concentration up to 1 minute.
 * You choose a damage type at cast time; when the creature takes damage of
 * that type before the spell ends, it reduces the total by 1d4. A creature
 * can benefit only once per turn.
 *
 * Implementation mirrors Absorb Elements: the triggering DamageApplied has
 * already committed, so rather than mutate it we roll the 1d4 here and emit
 * a compensating `Healed` for the reduced amount (capped at the damage
 * taken). The consumer calls this when their `resisted` creature takes
 * damage of the chosen type. Two edges are consumer-coordinated (documented
 * on the `resisted` condition): the once-per-turn cap and that the supplied
 * `damageType` matches the type chosen at cast (the generic `resisted`
 * marker doesn't pin the type, exactly as Absorb Elements trusts its
 * consumer-supplied type). The reaction costs no action and does not end
 * the spell (Resistance persists for its duration).
 */
export const planConsumeResistance = (
  state: CampaignState,
  _content: ResolvedContent,
  rng: RNG,
  intent: ConsumeResistanceIntent,
): ConsumeResistanceOutcome => {
  const target = state.characters[intent.targetId];
  invariant(target !== undefined, `Target ${intent.targetId} not found`);
  invariant(
    target.appliedConditions.some((c) => c.conditionId === RESISTED_CONDITION_ID),
    `Target ${intent.targetId} does not have the resisted condition (Resistance not active)`,
  );
  if (!RESISTANCE_TYPES.includes(intent.damageType)) {
    throw new Error(
      `Resistance damage type '${intent.damageType}' not in allowed list [${RESISTANCE_TYPES.join(', ')}]`,
    );
  }
  if (intent.damageAmount < 0) {
    throw new Error('Resistance damageAmount must be non-negative');
  }

  const at = intent.at ?? nowIso();
  const d4 = rollDie(RESISTANCE_DIE_SIDES, rng);
  const reduction = Math.min(d4, intent.damageAmount);
  const events: Event[] = [];
  if (reduction > 0) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'Healed',
      targetId: intent.targetId as ULID,
      amount: reduction,
      source: 'resistance',
    } satisfies HealedEvent);
  }
  return { events, d4, reduction };
};

const SANCTUARY_CONDITION_ID = 'sanctuary-active';

const findPrimarySpellcastingClass = (
  character: Character,
  content: ResolvedContent,
): string | undefined => {
  for (const enrollment of character.classes) {
    const cls = content.classes.get(enrollment.classId);
    if (cls?.spellcasting !== undefined) return enrollment.classId;
  }
  return undefined;
};

export interface SanctuaryWardSaveIntent {
  readonly type: 'SanctuaryWardSave';
  // The creature that is about to attack the warded creature. Rolls
  // a WIS save against the sanctuary caster's spell DC.
  readonly attackerId: string;
  // The creature that is protected by Sanctuary. Must currently carry
  // the `sanctuary-active` condition, and that condition's
  // `sourceCharacterId` must point at a character with a spellcasting
  // class.
  readonly wardedCharacterId: string;
  // Optional override of the caster's spellcasting class id for DC
  // computation. Defaults to the caster's first class that has a
  // `spellcasting` entry.
  readonly castingClassId?: string;
  readonly at?: string;
}

export interface SanctuaryWardSaveOutcome {
  readonly events: ReadonlyArray<Event>;
  // True when the attacker failed the WIS save: per RAW the attack is
  // averted and the consumer must redirect or drop it. Surfaced on the
  // outcome (alongside SaveRolled in `events`) so the consumer can
  // branch without re-parsing the event list.
  readonly prevented: boolean;
}

/**
 * RAW 2024 PHB Sanctuary: until the spell ends, any creature who
 * targets the warded creature with an attack roll or a harmful spell
 * must first make a Wisdom save against the caster's spell DC. On a
 * failed save the attacker loses the action (must redirect or drop
 * the attack). Pre-attack target-selection rider — different shape
 * from Counterspell / Shield / Absorb Elements (which are bearer-side
 * reactions); here the save is rolled on the *attacker's* side.
 *
 * The planner doesn't itself cancel the downstream attack — the
 * engine has no `AttackTargeted` pre-event. Instead the consumer
 * calls this planner before invoking `planAttack`; on a failed save
 * the `SanctuaryProtected` event records the outcome and the
 * consumer is responsible for not proceeding with the attack roll.
 *
 * The "spell ends if the warded creature attacks / casts a harmful
 * spell / deals damage" clause rides on an OnEvent rider on the
 * `sanctuary-active` condition (AttackRolled with attackerIsSelf,
 * consumeOnTrigger). Only the AttackRolled vector is wired today;
 * the harmful-spell / damage-deal cases are not modeled (the engine
 * has no SpellCast-with-hostile-intent fact today).
 */
export const planSanctuaryWardSave = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: SanctuaryWardSaveIntent,
): SanctuaryWardSaveOutcome => {
  const attacker = state.characters[intent.attackerId];
  invariant(attacker !== undefined, `Attacker ${intent.attackerId} not found`);
  const warded = state.characters[intent.wardedCharacterId];
  invariant(warded !== undefined, `Warded character ${intent.wardedCharacterId} not found`);

  const sanctuary = warded.appliedConditions.find(
    (c) => c.conditionId === SANCTUARY_CONDITION_ID,
  );
  if (sanctuary === undefined) {
    throw new Error(`${warded.name} is not warded by Sanctuary`);
  }
  if (sanctuary.sourceCharacterId === undefined) {
    throw new Error('Sanctuary applied condition is missing sourceCharacterId');
  }
  const caster = state.characters[sanctuary.sourceCharacterId];
  invariant(
    caster !== undefined,
    `Sanctuary caster ${sanctuary.sourceCharacterId} not found in state`,
  );
  const castingClassId =
    intent.castingClassId ?? findPrimarySpellcastingClass(caster, content);
  if (castingClassId === undefined) {
    throw new Error(`Sanctuary caster ${caster.name} has no spellcasting class`);
  }

  const at = intent.at ?? nowIso();
  const dcResult = computeSpellSaveDC({
    character: caster,
    itemInstances: state.itemInstances,
    content,
    pendingChoices: state.pendingChoices,
    classId: castingClassId,
    characters: state.characters,
  });
  const dc = dcResult.total;

  const saveDerivation = computeSavingThrow({
    character: attacker,
    itemInstances: state.itemInstances,
    content,
    ability: 'WIS',
    pendingChoices: state.pendingChoices,
    characters: state.characters,
    // Slice 133: Sanctuary is a spell; the attacker's ward-bypass
    // save counts as a magical effect for Magic Resistance purposes.
    sourceIsMagical: true,
  });
  const useAdv: 'advantage' | 'disadvantage' | 'none' = saveDerivation.hasAdvantage
    ? saveDerivation.hasDisadvantage
      ? 'none'
      : 'advantage'
    : saveDerivation.hasDisadvantage
      ? 'disadvantage'
      : 'none';
  const firstRoll = rollDie(D20_SIDES, rng);
  let d20s: number[] = [firstRoll];
  let d20 = firstRoll;
  if (useAdv !== 'none') {
    const second = rollDie(D20_SIDES, rng);
    d20s = [firstRoll, second];
    d20 = useAdv === 'advantage' ? Math.max(firstRoll, second) : Math.min(firstRoll, second);
  }
  // Slice 543: Halfling Luck on reactive-spell save (target side).
  d20 = applyHalflingLuckFromFlag(d20, saveDerivation.hasHalflingLuck, d20s, rng);
  const saveBonus = rollSaveBonusDice(saveDerivation.bonusDice, rng);
  const bonus = saveDerivation.total + saveBonus.total;
  const total = d20 + bonus;
  const success = total >= dc;

  const saveEvent: SaveRolledEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SaveRolled',
    targetId: intent.attackerId as ULID,
    ability: 'WIS',
    dc,
    d20: d20s,
    used: useAdv,
    bonus,
    total,
    success,
    breakdown: [...saveDerivation.breakdown, ...saveBonus.breakdown],
  };

  if (success) {
    return { events: [saveEvent], prevented: false };
  }

  const protectedEvent: SanctuaryProtectedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SanctuaryProtected',
    attackerId: intent.attackerId as ULID,
    wardedCharacterId: intent.wardedCharacterId as ULID,
    triggeringSaveEventId: saveEvent.id,
  };
  return { events: [saveEvent, protectedEvent], prevented: true };
};

// Slice 120 — Protection Fighting Style reaction. RAW 2024:
// "When a creature you can see attacks a target other than you that
// is within 5 feet of you, you can use your reaction to impose
// Disadvantage on the attack roll. You must be wielding a Shield."
//
// The "you can see attacker" and "ally within 5 ft" preconditions are
// position / vision concerns the engine doesn't model — the consumer
// owns those checks. This planner enforces what the engine does know:
// the protector exists, has the Fighting Style: Protection marker in
// their effect stack, has a shield equipped, and hasn't used their
// reaction this round. Then it rolls one fresh d20 for the consumer
// to pair with the original AttackRolled.d20 (lower-of-two = the
// disadvantage outcome).

export interface ProtectionIntent {
  readonly type: 'Protection';
  readonly protectorId: string;
  readonly attackerId: string;
  // The AttackRolled event id whose roll is being given disadvantage.
  // Recorded on the ProtectionUsed event so the consumer can pair the
  // fresh d20 with the original.
  readonly triggeringAttackEventId: string;
  readonly at?: string;
}

export interface ProtectionOutcome {
  readonly events: ReadonlyArray<Event>;
  readonly newD20: number;
}

export const planProtection = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: ProtectionIntent,
): ProtectionOutcome => {
  const protector = state.characters[intent.protectorId];
  invariant(protector !== undefined, `Protector ${intent.protectorId} not found`);
  if (protector.equipped.shield === undefined) {
    throw new Error(
      `${protector.name} cannot use Protection: a shield must be equipped`,
    );
  }
  const effects = buildEffectStack({
    character: protector,
    itemInstances: state.itemInstances,
    content,
    pendingChoices: state.pendingChoices,
    characters: state.characters,
  });
  if (!effects.hasProtectionFightingStyle()) {
    throw new Error(
      `${protector.name} cannot use Protection: does not have the Fighting Style`,
    );
  }
  assertReactionAvailable(state, intent.protectorId, 'use Protection');
  const at = intent.at ?? nowIso();

  const newD20 = rollDie(D20_SIDES, rng);
  const events: Event[] = [];
  const reaction = economyConsumedIfEncountered(state, intent.protectorId, at, 'reaction');
  if (reaction !== undefined) events.push(reaction);
  const protectionEvent: ProtectionUsedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ProtectionUsed',
    protectorId: intent.protectorId as ULID,
    attackerId: intent.attackerId as ULID,
    triggeringAttackEventId: intent.triggeringAttackEventId as ULID,
    newD20,
  };
  events.push(protectionEvent);
  return { events, newD20 };
};
