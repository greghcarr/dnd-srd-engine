import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type {
  FreeCastUsedEvent,
  PerDayCastUsedEvent,
  PactSlotConsumedEvent,
  SpellCastDeclaredEvent,
  SpellCastFizzledEvent,
  SpellSlotConsumedEvent,
  SpellSlotSource,
} from '../../schemas/events/spellcasting.js';
import type {
  AttackRolledEvent,
  DamageRolledEvent,
  DamageRoll,
} from '../../schemas/events/attack.js';
import type {
  DamageAppliedEvent,
  ConditionAppliedEvent,
  ConditionRemovedEvent,
  CreatureDestroyedEvent,
  HealedEvent,
  TempHPGrantedEvent,
} from '../../schemas/events/combat.js';
import type { SaveRolledEvent } from '../../schemas/events/checks.js';
import type {
  ConcentrationBrokenEvent,
  ConcentrationStartedEvent,
  SpellEffectStartedEvent,
} from '../../schemas/events/concentration.js';
import type { CompanionSummonedEvent } from '../../schemas/events/summons.js';
import type { TrapArmedEvent } from '../../schemas/events/traps.js';
import type { Spell, SpellMechanic } from '../../schemas/content/spell.js';
import { cantripExtraDice } from '../../schemas/content/spell.js';
import type { DamageType } from '../../schemas/primitives.js';
import type { Character } from '../../schemas/runtime/character.js';
import { computeTotalLevel } from '../../schemas/runtime/character.js';
import type { AppliedConditionRef } from '../../schemas/runtime/effect-instance.js';
import type { RNG } from '../../rng/index.js';
import { rollDie, rollExpression, parseDiceExpression } from '../../rng/dice.js';
import {
  newAppliedConditionId,
  newCharacterId,
  newEffectInstanceId,
  newEventId,
  newItemInstanceId,
  newTrapId,
} from '../../ids.js';
import type { ItemBuffAppliedEvent } from '../../schemas/events/inventory.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import { computeSpellSaveDC, computeSpellAttackBonus } from '../../derive/spell-dc.js';
import { effectiveSpellList } from '../../derive/effective-spell-list.js';
import { computeAvailableSpellSlots } from '../../derive/spell-slots.js';
import { computeAC } from '../../derive/ac.js';
import { computeSavingThrow } from '../../derive/save.js';
import { getCreatureType } from '../../derive/creature-type.js';
import { creatureSize, isLargeOrLarger } from '../../derive/creature-size.js';
import { rollSaveBonusDice } from './_bonus-dice.js';
import { abilityModifier } from '../../derive/ability.js';
import { resolveAttack } from './attack.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { interceptFatalDamage } from '../../derive/fatal-damage-intercept.js';
import { applyAll } from '../apply.js';
import { dispatchTriggers } from '../triggers/dispatch.js';
import { buildEffectStack } from '../../derive/effect-stack.js';
import { wearsUntrainedBodyArmor } from '../../derive/armor-training.js';
import { isImmuneToCondition } from '../../derive/condition-immunity.js';
import { isHealingBlocked } from '../../derive/healing-block.js';
import { planConcentrationOnDamage } from './concentration.js';
import { resolveAttackRoll } from './_attack-roll.js';
import { assertActorCanAct, findActorBlockingCondition } from './_actor-state.js';
import {
  assertWithinSpellRange,
  enforceableSpellRangeFeet,
  parseSpellRange,
} from './_spatial-gates.js';
import { creaturesInSpellArea } from './_spell-area.js';
import { parseSpellDurationMinutes } from '../../internal/spell-duration.js';
import {
  CANTRIP_LEVEL,
  D20_SIDES,
  NAT_1,
  NAT_20,
} from '../../internal/constants.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

// Caster-chosen options resolved at cast time (immediate, not stored
// in state). Distinct from the `PendingChoice` protocol, which models
// deferred decisions (level-up ASI / feat picks, subclass selection)
// that persist between sessions. Cast-time choices are passed inline
// with the intent and consumed at plan time.
//
// - `damageType` picks one of an allowed list of DamageType values
//   (Chromatic Orb: acid / cold / fire / lightning / poison / thunder).
// - `variant` picks a spell-defined string key from a set of variants,
//   each of which routes to a different condition or effect (Enlarge /
//   Reduce: 'enlarge' → enlarged-active, 'reduce' → reduced-active).
export type CasterChoice =
  | { readonly kind: 'damageType'; readonly value: DamageType }
  | { readonly kind: 'variant'; readonly value: string };

export interface CastSpellIntent {
  readonly type: 'CastSpell';
  readonly characterId: string;
  readonly spellId: string;
  readonly slotLevel: number;
  readonly slotSource?: SpellSlotSource;
  readonly targetIds: ReadonlyArray<string>;
  readonly castingClassId?: string;
  readonly asRitual?: boolean;
  // Required when the chosen mechanic carries `casterChoosesDamageType`
  // (Chromatic Orb picks acid / cold / fire / lightning / poison /
  // thunder at cast). Ignored otherwise.
  readonly casterChoice?: CasterChoice;
  // Slice 219: when true, the cast skips both the slot-availability
  // gate and the SpellSlotConsumed / PactSlotConsumed emission. The
  // chosen `slotLevel` still drives any per-slot upcast scaling. Used
  // by features that grant a free cast: Cleric Divine Intervention,
  // Warlock Contact Patron `oncePerLongRest` preparation, magic-item
  // "casts X without expending a slot" riders.
  readonly noSlotCost?: boolean;
  // Slice 220: when true, the cast skips the "does the bearer know or
  // prepare this spell?" gate. The consumer (always a feature-driven
  // planner) is responsible for validating the spell against the
  // feature's eligibility rule before delegating here. Used by
  // Cleric Divine Intervention (any Cleric spell L5 or lower), and
  // by magic items that let the bearer cast from a fixed catalog
  // regardless of class.
  readonly ignorePreparation?: boolean;
  // Slice 486: opts this cast into the once-per-long-rest free-cast
  // tracker. Validates that the spell is granted with `oncePerLongRest`
  // preparation (Magic Initiate L1 spell, Warlock Contact Patron) AND
  // hasn't already been used since the last long rest, then implies
  // `noSlotCost: true` and emits a FreeCastUsed event so the reducer
  // records the consumption. Without this flag, the same caster can
  // still cast the spell normally via an owned slot (RAW: "You can
  // also cast the spell using any spell slots you have").
  readonly useFreeCast?: boolean;
  // Slice 494: required by spells whose mechanicalEffects include a
  // `weaponAttack` mechanic (True Strike). Names the weapon instance
  // the caster uses to make the attack. The planner reads this and
  // delegates to resolveAttack with the caster's spellcasting ability
  // as the abilityOverride. Throws if a weaponAttack-mechanic spell is
  // cast without this field set.
  readonly weaponInstanceId?: string;
  // Slice 495: required by spells whose mechanicalEffects include a
  // `zone` mechanic (Fog Cloud, Darkness, Silent Image, etc.). Names
  // the center of the AOE. The planner reads this + the spell's
  // `targeting` shape/size and stamps a `zone` field on the emitted
  // ConcentrationStarted event. Throws if a zone-mechanic spell is
  // cast without this field set.
  readonly targetPosition?: { readonly x: number; readonly y: number };
  // Slice 732: Wizard Evoker L6 Sculpt Spells. Names the creatures the
  // caster excludes from an Evocation save spell — each auto-succeeds on
  // the save and takes no damage (modeled as full exclusion). Honored
  // only when the caster bears `GrantSculptSpells` and the spell's school
  // is Evocation; the count is capped at 1 + the slot level. Each id must
  // be among `targetIds`.
  readonly sculptedTargetIds?: ReadonlyArray<string>;
  // Slice 787: opt-in area enforcement. When set on an area spell (one with
  // an authored `targeting` shape/size), the engine runs the canonical AoE
  // rasterizer from this aim point (in feet) and uses the creatures it
  // covers — with line of effect from the point of origin — as the target
  // set, IGNORING `targetIds`. The per-target range gate is skipped for this
  // path (RAW: an area spell's range is to its point of origin, not to each
  // creature, so a foe on the far edge of the blast can be past the range
  // and still caught). Without `aim`, the cast trusts `targetIds` unchanged.
  readonly aim?: { readonly x: number; readonly y: number };
  readonly at?: string;
}

// Slice 487: returns undefined when the character has no spellcasting
// class (Magic Initiate Fighter / Rogue / Barbarian). The caller falls
// back to the GrantSpell entry's `spellcastingAbility` via
// `resolveCastingAbility` below to compute DC / attack. Pre-487 this
// threw at this point, blocking non-spellcasters from casting their
// granted spells through the planner.
const findCastingClass = (
  character: Character,
  content: ResolvedContent,
  preferred?: string,
): string | undefined => {
  if (preferred !== undefined) return preferred;
  for (const enrollment of character.classes) {
    const cls = content.classes.get(enrollment.classId);
    if (cls?.spellcasting !== undefined) return enrollment.classId;
  }
  return undefined;
};

// Slice 487: resolves the spellcasting ability the cast should use.
// Class first (preserves existing behavior for spellcasters); falls back
// to the GrantSpell entry's `spellcastingAbility` for the spell being
// cast. Returns undefined when the bearer can't cast the spell via any
// recognized path; the caller throws an intent-revealing error.
const resolveCastingAbility = (
  character: Character,
  content: ResolvedContent,
  state: CampaignState,
  classId: string | undefined,
  spellId: string,
): 'INT' | 'WIS' | 'CHA' | undefined => {
  if (classId !== undefined) {
    const cls = content.classes.get(classId);
    const ability = cls?.spellcasting?.ability;
    if (ability === 'INT' || ability === 'WIS' || ability === 'CHA') return ability;
  }
  const effects = buildEffectStack({
    character,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  });
  const grant = effects.grantedSpells().find((g) => g.spellId === spellId);
  const grantAbility = grant?.spellcastingAbility;
  if (grantAbility === 'INT' || grantAbility === 'WIS' || grantAbility === 'CHA') {
    return grantAbility;
  }
  // Slice 794: an NPC caster (Mage, Priest, ...) carries one
  // SetSpellcastingProfile trait whose `ability` covers all of its
  // granted spells, so the per-spell GrantSpell entries need not repeat
  // `spellcastingAbility`. Fall back to the profile ability here.
  const profileAbility = effects.spellcastingProfile()?.ability;
  if (profileAbility === 'INT' || profileAbility === 'WIS' || profileAbility === 'CHA') {
    return profileAbility;
  }
  return undefined;
};

const characterKnowsSpell = (
  state: CampaignState,
  content: ResolvedContent,
  character: Character,
  spellId: string,
): boolean => {
  // Slice 212: also consult the effect stack for GrantSpell entries
  // (subclass domain spell lists, "extra cantrip" feature grants,
  // magic-item always-prepared spells). Pre-slice 212 the engine
  // ignored these even though the GrantSpell primitive existed in
  // the schema.
  if (character.knownSpells.includes(spellId) || character.preparedSpells.includes(spellId)) {
    return true;
  }
  const effective = effectiveSpellList({
    character,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  });
  return effective.includes(spellId);
};

const chooseSlotSource = (
  spell: Spell,
  intent: CastSpellIntent,
  state: CampaignState,
  content: ResolvedContent,
): SpellSlotSource => {
  if (intent.slotSource !== undefined) return intent.slotSource;
  if (spell.level === CANTRIP_LEVEL) return 'standard';
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  const available = computeAvailableSpellSlots(character, content.classes);
  if (
    available.pact !== undefined &&
    available.pact.count > 0 &&
    intent.slotLevel <= available.pact.level
  ) {
    return 'pact';
  }
  return 'standard';
};

const rollDamage = (
  baseExpression: string,
  bonusDice: number,
  rng: RNG,
  doubleDice: boolean,
): { rolls: number[]; modifier: number } => {
  const parsed = parseDiceExpression(baseExpression);
  const totalDieCount = (parsed.count + bonusDice) * (doubleDice ? 2 : 1);
  const rolls: number[] = [];
  for (let i = 0; i < totalDieCount; i++) {
    rolls.push(rollDie(parsed.die, rng));
  }
  return { rolls, modifier: parsed.modifier };
};

const rollCantripScaling = (
  scalingExpression: string | undefined,
  extraSteps: number,
  rng: RNG,
  doubleDice: boolean,
): number[] => {
  if (scalingExpression === undefined || extraSteps <= 0) return [];
  const parsed = parseDiceExpression(scalingExpression);
  const dieCount = parsed.count * extraSteps * (doubleDice ? 2 : 1);
  const rolls: number[] = [];
  for (let i = 0; i < dieCount; i++) {
    rolls.push(rollDie(parsed.die, rng));
  }
  return rolls;
};

const halveDamage = (totalDamage: number): number => Math.floor(totalDamage / 2);

// Slice 498: exploding ("aceing") damage. Each die in `initialRolls`
// that already rolled the max face spawns one extra die of `dieSize`;
// an extra die that also maxes spawns another (chained), with the total
// number of extra dice capped at `extraCap`. Returns only the extra
// rolls (the caller appends them to the base rolls). Cap <= 0 -> no
// extras. Canonical user: Sorcerous Burst (cap = spellcasting mod).
const rollExplodingExtras = (
  initialRolls: ReadonlyArray<number>,
  dieSize: number,
  extraCap: number,
  rng: RNG,
): number[] => {
  const extras: number[] = [];
  if (extraCap <= 0) return extras;
  let pendingExplosions = initialRolls.filter((r) => r === dieSize).length;
  while (pendingExplosions > 0 && extras.length < extraCap) {
    pendingExplosions -= 1;
    const roll = rollDie(dieSize, rng);
    extras.push(roll);
    if (roll === dieSize) pendingExplosions += 1;
  }
  return extras;
};

// Shared variant-resolution for buff and save mechanics. The two
// mechanic kinds share the same `casterChoosesVariant` shape (a
// list of { key, conditionId } pairs); when present, the caster must
// supply `intent.casterChoice` with `kind: 'variant'` and a matching
// key. Throws with intent-revealing messages on misuse.
const resolveVariantConditionId = (
  casterChoosesVariant: { variants: readonly { key: string; conditionId: string }[] },
  intent: CastSpellIntent,
  spellId: string,
  mechanicKind: 'buff' | 'save',
): string => {
  const choice = intent.casterChoice;
  if (choice === undefined || choice.kind !== 'variant') {
    throw new Error(
      `Spell ${spellId} ${mechanicKind} mechanic requires a casterChoice { kind: 'variant', value }; received ${choice?.kind ?? 'none'}`,
    );
  }
  const match = casterChoosesVariant.variants.find((v) => v.key === choice.value);
  if (match === undefined) {
    const keys = casterChoosesVariant.variants.map((v) => v.key).join(', ');
    throw new Error(
      `Spell ${spellId}: variant '${choice.value}' not in allowed list [${keys}]`,
    );
  }
  return match.conditionId;
};

// Resolves the conditionId applied on a failed save. Returns
// `undefined` when the mechanic has neither `conditionOnFail` nor
// `casterChoosesVariant` (a damage-only save mechanic). Throws when
// both are set.
const resolveSaveConditionOnFail = (
  mechanic: Extract<SpellMechanic, { kind: 'save' }>,
  intent: CastSpellIntent,
  spellId: string,
): string | undefined => {
  if (mechanic.casterChoosesVariant !== undefined) {
    if (mechanic.conditionOnFail !== undefined) {
      throw new Error(
        `Spell ${spellId} save mechanic sets both conditionOnFail and casterChoosesVariant; pick exactly one`,
      );
    }
    return resolveVariantConditionId(mechanic.casterChoosesVariant, intent, spellId, 'save');
  }
  return mechanic.conditionOnFail;
};

// Resolves the buff conditionId, honoring caster choice when the
// mechanic flags `casterChoosesVariant`. Throws on missing / wrong-kind
// / unknown-key choices so misuse surfaces at plan time.
const resolveBuffConditionId = (
  mechanic: Extract<SpellMechanic, { kind: 'buff' }>,
  intent: CastSpellIntent,
  spellId: string,
): string => {
  if (mechanic.casterChoosesVariant !== undefined) {
    if (mechanic.conditionId !== undefined) {
      throw new Error(
        `Spell ${spellId} buff mechanic sets both conditionId and casterChoosesVariant; pick exactly one`,
      );
    }
    return resolveVariantConditionId(mechanic.casterChoosesVariant, intent, spellId, 'buff');
  }
  if (mechanic.conditionId === undefined) {
    throw new Error(
      `Spell ${spellId} buff mechanic has neither conditionId nor casterChoosesVariant`,
    );
  }
  return mechanic.conditionId;
};

// Resolves the damage type for an attack mechanic, honoring caster
// choice when the mechanic flags `casterChoosesDamageType`. Throws on
// missing or invalid choices so misuse surfaces at plan time rather
// than as silently-wrong damage.
const resolveAttackDamageType = (
  mechanic: Extract<SpellMechanic, { kind: 'attack' }>,
  intent: CastSpellIntent,
  spellId: string,
): DamageType => {
  if (mechanic.casterChoosesDamageType !== undefined) {
    if (mechanic.damageType !== undefined) {
      throw new Error(
        `Spell ${spellId} attack mechanic sets both damageType and casterChoosesDamageType; pick exactly one`,
      );
    }
    const choice = intent.casterChoice;
    if (choice === undefined || choice.kind !== 'damageType') {
      throw new Error(
        `Spell ${spellId} requires a casterChoice { kind: 'damageType', value }; received ${choice?.kind ?? 'none'}`,
      );
    }
    if (!mechanic.casterChoosesDamageType.allowed.includes(choice.value)) {
      throw new Error(
        `Spell ${spellId}: damage type '${choice.value}' not in allowed list [${mechanic.casterChoosesDamageType.allowed.join(', ')}]`,
      );
    }
    return choice.value;
  }
  if (mechanic.damageType === undefined) {
    throw new Error(
      `Spell ${spellId} attack mechanic has neither damageType nor casterChoosesDamageType`,
    );
  }
  return mechanic.damageType;
};

const planAttackMechanic = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: CastSpellIntent,
  spell: Spell,
  mechanic: Extract<SpellMechanic, { kind: 'attack' }>,
  declaredEventId: string,
  at: string,
  castingClassId: string | undefined,
  castingAbility: 'INT' | 'WIS' | 'CHA',
  // Slice 666: when the spell is a concentration spell, the parent
  // allocates a `concentrationEffectId` and passes it here so any
  // condition the attack applies on hit (Ray of Enfeeblement's
  // Enfeebled) is bound to the EffectInstance for cleanup on
  // concentration drop.
  concentrationEffectId: string | undefined,
): Event[] => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  const attackBonus = computeSpellAttackBonus({
    character,
    itemInstances: state.itemInstances,
    content,
    classId: castingClassId ?? '',
    characters: state.characters,
    castingAbility,
  });
  const bonusDice = (mechanic.extraDicePerSlotLevel ?? 0) * Math.max(0, intent.slotLevel - spell.level);
  // Slice 562: beam-scaling cantrips (Eldritch Blast) scale by BEAM
  // COUNT, not by extra dice per beam. Skip cantripScalingDice
  // accumulation so each beam rolls only the base `damageDice`.
  const cantripSteps = spell.level === CANTRIP_LEVEL && mechanic.cantripBeamScaling !== true
    ? cantripExtraDice(computeTotalLevel(character))
    : 0;
  // Slice 666: skip damage-type resolution entirely when the
  // mechanic has no damageDice (Ray of Enfeeblement and any future
  // attack-spell that only applies an on-hit condition). The
  // downstream damage-roll path is also short-circuited below;
  // hoisting this check keeps both ends of the no-damage path
  // consistent.
  const damageType =
    mechanic.damageDice === undefined
      ? undefined
      : resolveAttackDamageType(mechanic, intent, spell.id);
  // Slice 204: spell damage now consults the caster's effect stack
  // for `AddModifier { target: 'damage' }` contributions, gated on the
  // `event.damageType` fact. Canonical user: Draconic Sorcery L6
  // Elemental Affinity (+CHA-mod to one damage roll of the chosen
  // type). Mirrors the analogous query in attack.ts:618 for weapon
  // attacks.
  const casterEffects = buildEffectStack({
    character,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  });
  const damageFacts = new Map<string, unknown>([
    ['event.damageType', damageType],
    ['event.spellSchool', spell.school],
    // Slice 510: enables per-spell damage riders (Warlock Agonizing Blast
    // adds CHA-mod to Eldritch Blast damage rolls only). Predicate uses
    // `eq event.spellId '<spell-id>'`.
    ['event.spellId', spell.id],
    // Slice 739: spell level fact (0 = cantrip). Canonical user: Druid L7 /
    // Cleric L7 Potent Spellcasting (+spellcasting-ability modifier to
    // cantrip damage), gated `eq event.spellLevel 0`.
    ['event.spellLevel', spell.level],
  ]);
  const damageModifierBonus = casterEffects.modifierSum('damage', damageFacts);
  const events: Event[] = [];
  // Slice 562: cantripBeamScaling caps targetIds at the level-scaled
  // beam count (Eldritch Blast: 1/2/3/4 beams at L1/5/11/17). Reuses
  // cantripExtraDice (returns 0/1/2/3 at those tiers); maxBeams = 1 +
  // that. Rejects exceeding intent so consumers see the gate at plan
  // time. Each beam is an independent attack roll — base `damageDice`
  // per beam, NO cantripScalingDice (the scaling IS the beam count).
  // Repeated target ids are allowed (RAW: "the same or different
  // creatures"). The schema's strict() rejects spells that author
  // both cantripBeamScaling AND cantripScalingDice via parse-time
  // strictness on `cantripScalingDice` set to something incompatible.
  if (mechanic.cantripBeamScaling === true) {
    const maxBeams = 1 + cantripExtraDice(computeTotalLevel(character));
    if (intent.targetIds.length < 1) {
      throw new Error(`Spell ${spell.id} requires at least one beam target`);
    }
    if (intent.targetIds.length > maxBeams) {
      throw new Error(
        `Spell ${spell.id} fires ${maxBeams} beam${maxBeams === 1 ? '' : 's'} at character level ${computeTotalLevel(character)}; received ${intent.targetIds.length} target id${intent.targetIds.length === 1 ? '' : 's'}`,
      );
    }
  }
  // Slice 497: `targetScope: 'first'` makes the attack resolve against
  // only the primary target (targetIds[0]); a sibling save mechanic
  // covers the rest of the AOE. Default ('all' / unset) attacks every
  // target, the historical behavior.
  const attackTargetIds = mechanic.targetScope === 'first'
    ? intent.targetIds.slice(0, 1)
    : intent.targetIds;
  for (const targetId of attackTargetIds) {
    const target = state.characters[targetId];
    if (!target) continue;
    const targetAC = computeAC({
      character: target,
      itemInstances: state.itemInstances,
      content,
      characters: state.characters,
    });
    // Slice 602: spell attacks now consult the target's effect stack
    // for advantage/disadvantage contributions exactly like weapon
    // attacks do. RAW (2024 PHB Spellcasting): "If you cast a spell
    // that has an attack roll, follow the rules for an attack roll."
    // Faerie Fire's "Attack rolls against an affected creature have
    // Advantage" is the canonical user — pre-slice it only fired for
    // weapon attacks because cast-spell.ts rolled a bare d20 here.
    // Same scope as the target-side branch of planAttack: the three
    // accumulator queries (grantsAdvantageToAttackers,
    // imposesDisadvantageOnAttackers, cancelsAdvantageOnAttackers) plus
    // ranged-spell-in-melee disadvantage. Predicate facts mirror
    // attack.ts so the same content-side conditions wire through both
    // paths uniformly.
    const targetEffects = buildEffectStack({
      character: target,
      content,
      itemInstances: state.itemInstances,
      pendingChoices: state.pendingChoices,
    });
    const targetSideAttackerFacts = new Map<string, unknown>([
      ['event.attackKind', mechanic.attackKind],
    ]);
    const targetGrantsAdvantage = targetEffects.grantsAdvantageToAttackers(targetSideAttackerFacts);
    const targetBearerFacts = new Map<string, unknown>([
      ['bearerHasIncapacitated', findActorBlockingCondition(target) !== undefined],
    ]);
    const targetCancelsAdvantage = targetEffects.cancelsAdvantageOnAttackers(targetBearerFacts);
    const attackerSideFacts = new Map<string, unknown>([
      ['event.attackKind', mechanic.attackKind],
      ['event.isOpportunityAttack', false],
      ['bearer.hasIncapacitated', findActorBlockingCondition(target) !== undefined],
      ['bearer.speedZero', target.speedFeet === 0],
      ['bearer.canSeeAttacker', undefined],
    ]);
    const targetImposesDisadvantage = targetEffects.imposesDisadvantageOnAttackers(attackerSideFacts);

    // RAW (PHB Ranged Attacks in Close Combat): "Aiming a ranged
    // attack is more difficult when a foe is next to you. When you
    // make a ranged attack roll with a weapon, a spell, or some
    // other means, you have Disadvantage on the roll if you are
    // within 5 feet of an enemy who can see you and who isn't
    // Incapacitated." Mirrors the planAttack `rangedInMelee` check
    // (slice 537+); applies to ranged SPELL attacks too.
    const rangedSpellInMelee = ((): boolean => {
      if (mechanic.attackKind !== 'ranged') return false;
      if (!state.activeEncounterId) return false;
      const enc = state.encounters[state.activeEncounterId];
      if (!enc) return false;
      const casterCb = enc.combatants.find((c) => c.combatantId === intent.characterId);
      const casterPos = casterCb?.position;
      if (!casterPos) return false;
      return enc.combatants.some((other) => {
        if (other.combatantId === intent.characterId) return false;
        const otherPos = other.position;
        if (!otherPos) return false;
        const ch = state.characters[other.combatantId];
        if (!ch) return false;
        if (findActorBlockingCondition(ch) !== undefined) return false;
        const dx = Math.abs(otherPos.x - casterPos.x);
        const dy = Math.abs(otherPos.y - casterPos.y);
        return Math.max(dx, dy) <= 5;
      });
    })();

    // Slice 611: spell attacks now go through the same resolveAttackRoll
    // helper as weapon attacks. Side benefit: Halfling Luck (nat-1
    // reroll), Bless +1d4 / Bane -1d4 bonus dice, and extended crit
    // ranges (Improved Critical) all fire automatically for spell
    // attacks — pre-slice they were weapon-only because cast-spell.ts
    // had its own bare-d20 roll path. RAW (PHB Spellcasting): "If you
    // cast a spell that has an attack roll, follow the rules for an
    // attack roll."
    const casterAttackFacts = new Map<string, unknown>([
      ['event.attackKind', mechanic.attackKind],
      ['event.spellId', spell.id],
      ['event.spellSchool', spell.school],
      ['event.isOpportunityAttack', false],
      // Slice 627: the class through which the bearer is casting this
      // spell (resolved by findCastingClassForSpell -- the first of
      // the caster's classes that lists the spell in its class spell
      // list). Used by Innate Sorcery's SetAdvantage to gate the
      // advantage on Sorcerer-list spells only (closes the slice-623
      // RAW deviation: "advantage on attack rolls of Sorcerer spells
      // you cast", not all spells). Undefined for monsters / NPCs
      // (who don't have a class-based spell list).
      ['event.spellCastingClassId', castingClassId],
    ]);
    // Slice 623: query attacker-side advantage on spell attacks.
    // Pre-slice this was a gap -- the spell-attack path never folded
    // attacker-side SetAdvantage effects in (mirror of attack.ts:867
    // for weapons). Canonical RAW user closed here: Sorcerer L1 Innate
    // Sorcery, which grants Advantage on the attack rolls of Sorcerer
    // spells you cast (the slice-622 fuzz review at seed 7006 caught
    // it never firing). Surfaced via the innate-sorcery-active
    // condition's new SetAdvantage on:'attack' effect. Slice 627
    // tightened that to gate on event.spellCastingClassId.
    const casterSelfAdvantage = casterEffects.advantageFor('attack', casterAttackFacts);

    const effectivelyGrantsAdvantage = !targetCancelsAdvantage && targetGrantsAdvantage;
    const effectivelyImposesDisadvantage = targetImposesDisadvantage || rangedSpellInMelee;
    // Slice 623 (continued): also fold the attacker-side advantage
    // computed above (Innate Sorcery etc.). The cancel-on-tie rule
    // applies symmetrically: any grant + any impose -> straight roll.
    const grantsFromAnywhere = effectivelyGrantsAdvantage || casterSelfAdvantage.advantage;
    const imposesFromAnywhere = effectivelyImposesDisadvantage || casterSelfAdvantage.disadvantage;
    let advantage: 'none' | 'advantage' | 'disadvantage' = 'none';
    if (grantsFromAnywhere && imposesFromAnywhere) {
      advantage = 'none';
    } else if (grantsFromAnywhere) {
      advantage = 'advantage';
    } else if (imposesFromAnywhere) {
      advantage = 'disadvantage';
    }
    // RAW Paralyzed/Unconscious melee auto-crit (slice 568 originally
    // for weapon attacks): the same rule applies to MELEE spell
    // attacks. The five RAW melee spell attacks (Shocking Grasp,
    // Spiritual Weapon, Chill Touch, Flame Blade, Vampiric Touch) get
    // the auto-crit on hits against Paralyzed/Unconscious/HP-0 targets.
    const targetAutoCritsFromMelee = ((): boolean => {
      if (mechanic.attackKind !== 'melee') return false;
      if (target.hp.current <= 0) return true;
      return target.appliedConditions.some(
        (c) => c.conditionId === 'paralyzed'
          || c.conditionId === 'held-paralyzed-active'
          || c.conditionId === 'unconscious',
      );
    })();
    const rollResult = resolveAttackRoll({
      advantage,
      attackBonus: attackBonus.total,
      targetAC: targetAC.total,
      attackerHasHalflingLuck: casterEffects.hasHalflingLuck(),
      bonusDiceContributions: casterEffects.bonusDiceFor('attack', casterAttackFacts),
      critThreshold: casterEffects.critThreshold(),
      forceCritIfHit: targetAutoCritsFromMelee,
      rng,
    });
    // Aliases so the downstream damage-roll / potent-cantrip / damage-
    // event code keeps its existing variable names.
    const hit = rollResult.hit;
    const isCrit = rollResult.critical;

    const attackEvent: AttackRolledEvent = {
      id: newEventId() as ULID,
      at,
      type: 'AttackRolled',
      attackerId: intent.characterId,
      targetId,
      weaponInstanceId: intent.spellId as ULID,
      d20: rollResult.rolls,
      used: advantage,
      attackBonus: rollResult.effectiveAttackBonus,
      total: rollResult.total,
      targetAC: targetAC.total,
      hit: rollResult.hit,
      critical: rollResult.critical,
      ...(rollResult.bonusDice.rolls.length > 0
        ? {
            bonusDice: rollResult.bonusDice.rolls.map((b) => ({
              dice: b.dice,
              rolls: [...b.rolls],
              subtract: b.subtract,
              source: b.source,
              total: b.total,
            })),
          }
        : {}),
      // Melee vs Ranged Spell Attack, from the mechanic (defaults to
      // 'ranged'). Slice 371: the five RAW melee spell attacks (Shocking
      // Grasp, Spiritual Weapon, Chill Touch, Flame Blade, Vampiric Touch)
      // carry `attackKind: 'melee'`; this stamps the `event.attackKind`
      // fact correctly so melee-gated riders fire and the ranged-in-melee
      // disadvantage doesn't wrongly apply.
      attackKind: mechanic.attackKind,
      causedByEventId: declaredEventId as ULID,
    };
    events.push(attackEvent);

    // Mirrors the weapon-attack AttackRolled dispatch in planAttack so
    // attack-triggered riders (Hex, Hunter's Mark) fire on spell-attack
    // hits. The DamageApplied dispatch below covers damage-side
    // triggers (Repelling Blast) but not riders gated on event.hit.
    events.push(
      ...dispatchTriggers({
        state: applyAll(state, events),
        content,
        rng,
        event: attackEvent,
        at,
      }),
    );

    // Evoker L3 Potent Cantrip: a damaging cantrip that misses the attack
    // still deals half damage (no crit, no additional effect). A plain
    // miss skips the target entirely.
    const potentHalfOnMiss =
      !hit && spell.level === CANTRIP_LEVEL && casterEffects.hasPotentCantrip();
    if (!hit && !potentHalfOnMiss) continue;

    // Slice 666: optional on-hit condition (Ray of Enfeeblement and
    // any future attack-spell that primes an Enfeebled-shape rider on
    // a hit). Fires on hit (not on potent-cantrip half-damage miss);
    // the condition is stamped on the attack's target with the caster
    // as `sourceCharacterId` so concentration-drop cleanup removes it.
    if (hit && mechanic.conditionOnHit !== undefined) {
      // Slice 796: stamp the rider's declarative autoExpiry the same way
      // the save / buff condition paths do, so a NON-concentration on-hit
      // rider actually lifts. Guiding Bolt's glow has
      // autoExpiry { afterRounds 1, turnEnd } → it lifts at the end of the
      // caster's next turn. Concentration riders (Ray of Enfeeblement)
      // leave autoExpiry unset and bind to the EffectInstance instead.
      const onHitAutoExpiry = content.conditions.get(mechanic.conditionOnHit)?.autoExpiry;
      const onHitRound = state.activeEncounterId
        ? state.encounters[state.activeEncounterId]?.round
        : undefined;
      const onHitExpiry = onHitAutoExpiry !== undefined && onHitRound !== undefined
        ? { expiresOnRound: onHitRound + onHitAutoExpiry.afterRounds, expiryTrigger: onHitAutoExpiry.trigger }
        : undefined;
      const onHitApplied: ConditionAppliedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'ConditionApplied',
        targetId: targetId as ULID,
        conditionId: mechanic.conditionOnHit,
        appliedConditionId: newAppliedConditionId() as ULID,
        sourceCharacterId: intent.characterId as ULID,
        causedByEventId: attackEvent.id,
        // When the spell is a concentration spell, bind the
        // condition to the EffectInstance so dropping concentration
        // removes the condition via `clearConcentrationEffect`'s
        // sourceEffectInstanceId sweep.
        ...(concentrationEffectId !== undefined
          ? { sourceEffectInstanceId: concentrationEffectId as ULID }
          : {}),
        ...(onHitExpiry !== undefined ? onHitExpiry : {}),
      };
      events.push(onHitApplied);
    }

    // Slice 666: skip the damage path entirely when damageDice is
    // omitted (attack-only spells like Ray of Enfeeblement). The
    // attack roll + on-hit condition (above) + trigger dispatch (the
    // attackEvent's OnEvent rider dispatch already fired) is the
    // complete planner outcome for this target.
    if (mechanic.damageDice === undefined || damageType === undefined) continue;
    const damageDice = mechanic.damageDice;
    const damageTypeResolved = damageType;

    const { rolls: baseRolls, modifier } = rollDamage(damageDice, bonusDice, rng, isCrit);
    const scalingRolls = rollCantripScaling(mechanic.cantripScalingDice, cantripSteps, rng, isCrit);
    // Slice 498: exploding damage (Sorcerous Burst). Each base/scaling die
    // that maxed spawns an extra die (chained), capped at the caster's
    // spellcasting ability modifier.
    const explodeRolls = mechanic.explodeOnMaxDie === true
      ? rollExplodingExtras(
          [...baseRolls, ...scalingRolls],
          parseDiceExpression(mechanic.damageDice).die,
          Math.max(0, abilityModifier(character.abilityScores[castingAbility])),
          rng,
        )
      : [];
    const rolls = [...baseRolls, ...scalingRolls, ...explodeRolls];
    const fullDamage = rolls.reduce((s, v) => s + v, 0) + modifier + damageModifierBonus;
    const damageTotal = potentHalfOnMiss ? halveDamage(Math.max(0, fullDamage)) : fullDamage;
    const damageRolled: DamageRolledEvent = {
      id: newEventId() as ULID,
      at,
      type: 'DamageRolled',
      attackerId: intent.characterId,
      targetId,
      weaponInstanceId: intent.spellId as ULID,
      rolls: [
        {
          expression: mechanic.damageDice,
          rolls,
          modifier: modifier + damageModifierBonus,
          type: damageType,
        } satisfies DamageRoll,
      ],
      critical: isCrit,
      causedByEventId: attackEvent.id,
    };
    events.push(damageRolled);
    const mitigated = mitigateDamage({
      character: target,
      itemInstances: state.itemInstances,
      content,
      rawComponents: [{ amount: Math.max(0, damageTotal), type: damageType }],
      characters: state.characters,
      sourceIsMagical: true,
    });
    const intercept = interceptFatalDamage({
      state: applyAll(state, events),
      content,
      targetId,
      mitigatedComponents: mitigated,
      causedByEventId: damageRolled.id,
      at,
      rng,
    });
    const damageApplied: DamageAppliedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'DamageApplied',
      targetId,
      components: intercept.components,
      causedByEventId: damageRolled.id,
      sourceCharacterId: intent.characterId as ULID,
      source: spell.id,
    };
    // Slice 621: snapshot pre-damage state so the conc helper sees (a)
    // whether a prior event in this planner already broke conc -- skip
    // duplicate save -- and (b) the target's pre-this-damage HP, so a
    // drop-to-0 from THIS damage classifies as 'unconscious' not
    // 'failedSave'. Mirrors the attack.ts:1423 fix.
    const stateBeforeThisDamage = applyAll(state, events);
    events.push(damageApplied);
    events.push(...intercept.extraEvents);
    const targetForConc = stateBeforeThisDamage.characters[targetId] ?? target;
    events.push(
      ...planConcentrationOnDamage(stateBeforeThisDamage, content, rng, targetForConc, intercept.components, damageApplied.id, at),
    );
    // Slice 516: dispatch OnEvent triggers on the spell-attack
    // DamageApplied so per-spell on-hit riders fire (canonical user:
    // Warlock Repelling Blast — push 10 ft on Eldritch Blast hits).
    // Mirrors the resolveAttack damageTriggers dispatch (attack.ts).
    events.push(
      ...dispatchTriggers({
        state: applyAll(state, events),
        content,
        rng,
        event: damageApplied,
        at,
      }),
    );
  }
  return events;
};

interface SaveMechanicOutcome {
  readonly events: Event[];
  readonly conditionsApplied: AppliedConditionRef[];
}

// Evoker Sculpt Spells excludes "1 plus the spell's level" creatures.
const SCULPT_BASE_TARGETS = 1;

const planSaveMechanic = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: CastSpellIntent,
  spell: Spell,
  mechanic: Extract<SpellMechanic, { kind: 'save' }>,
  declaredEventId: string,
  at: string,
  castingClassId: string | undefined,
  castingAbility: 'INT' | 'WIS' | 'CHA',
  // Slice 783: the concentration effect id (when this is a concentration
  // spell), stamped as `sourceEffectInstanceId` on the applied condition so
  // the recurring-save escalation can carry it onto the escalated condition
  // and clearConcentrationEffect sweeps both on a drop.
  concentrationEffectId: string | undefined,
): SaveMechanicOutcome => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  const dcResult = computeSpellSaveDC({
    character,
    itemInstances: state.itemInstances,
    content,
    classId: castingClassId ?? '',
    characters: state.characters,
    castingAbility,
  });
  const bonusDice = (mechanic.extraDicePerSlotLevel ?? 0) * Math.max(0, intent.slotLevel - spell.level);
  const cantripSteps = spell.level === CANTRIP_LEVEL ? cantripExtraDice(computeTotalLevel(character)) : 0;
  const conditionOnFail = resolveSaveConditionOnFail(mechanic, intent, spell.id);
  // Evoker L3 Potent Cantrip: a damaging cantrip whose target succeeds on
  // the save still deals half damage (see the outcome computation below).
  const casterHasPotentCantrip =
    spell.level === CANTRIP_LEVEL &&
    buildEffectStack({ character, content, itemInstances: state.itemInstances, pendingChoices: state.pendingChoices }).hasPotentCantrip();
  // Evoker L6 Sculpt Spells: the caster may exclude named creatures from an
  // Evocation save spell. Validated once here (intent-revealing throws);
  // each excluded target is then skipped in the per-target loop, so it
  // gets no save event, no damage, and no condition — the observable form
  // of "auto-succeed and take no damage".
  const sculptedSet = new Set<string>(intent.sculptedTargetIds ?? []);
  if (sculptedSet.size > 0) {
    const casterCanSculpt = buildEffectStack({
      character,
      content,
      itemInstances: state.itemInstances,
      pendingChoices: state.pendingChoices,
    }).hasSculptSpells();
    if (!casterCanSculpt) {
      throw new Error(`${intent.characterId} cannot sculpt spells`);
    }
    if (spell.school !== 'evocation') {
      throw new Error(`Sculpt Spells applies only to Evocation spells, not ${spell.id} (${spell.school})`);
    }
    const maxSculpted = SCULPT_BASE_TARGETS + intent.slotLevel;
    if (sculptedSet.size > maxSculpted) {
      throw new Error(
        `Sculpt Spells can exclude at most ${maxSculpted} creature(s) for ${spell.id}; received ${sculptedSet.size}`,
      );
    }
    for (const id of sculptedSet) {
      if (!intent.targetIds.includes(id)) {
        throw new Error(`Sculpt Spells target ${id} is not among the spell's targets`);
      }
    }
  }
  const events: Event[] = [];
  const conditionsApplied: AppliedConditionRef[] = [];

  // Per PHB 2024 "Areas of Effect" — damage is rolled once for the spell and
  // applied to every target (halved on a successful save where applicable).
  // Slice 204: AOE damage also consults the caster's effect-stack
  // damage-modifier contributions (Elemental Affinity-style riders),
  // gated on `event.damageType`.
  let rawDamage = 0;
  let saveDamageModifierBonus = 0;
  // Slice 341: additional damage components of a different type (Flame
  // Strike's Radiant alongside its Fire), rolled once for the spell.
  const additionalBase: { amount: number; type: DamageType }[] = [];
  if (mechanic.damageDice !== undefined && mechanic.damageType !== undefined) {
    const casterEffects = buildEffectStack({
      character,
      content,
      itemInstances: state.itemInstances,
      pendingChoices: state.pendingChoices,
    });
    // Slice 359: `event.spellSchool` fact added alongside `event.damageType`
    // so school-gated damage riders fire. Canonical user: Evoker L10
    // Empowered Evocation (+INT-mod to one damage roll of an Evocation
    // spell). Added only to the primary component (not the additional-
    // damage loop below), honoring RAW "one damage roll of that spell."
    const damageFacts = new Map<string, unknown>([
      ['event.damageType', mechanic.damageType],
      ['event.spellSchool', spell.school],
      // Slice 510: per-spell damage rider parallel to the attack path.
      ['event.spellId', spell.id],
      // Slice 739: spell level fact (0 = cantrip) for Potent Spellcasting.
      ['event.spellLevel', spell.level],
    ]);
    saveDamageModifierBonus = casterEffects.modifierSum('damage', damageFacts);
    const { rolls: baseRolls, modifier } = rollDamage(mechanic.damageDice, bonusDice, rng, false);
    const scalingRolls = rollCantripScaling(mechanic.cantripScalingDice, cantripSteps, rng, false);
    rawDamage = [...baseRolls, ...scalingRolls].reduce((s, v) => s + v, 0) + modifier + saveDamageModifierBonus;
    for (const comp of mechanic.additionalDamage ?? []) {
      const compBonusDice = (comp.extraDicePerSlotLevel ?? 0) * Math.max(0, intent.slotLevel - spell.level);
      const compMod = casterEffects.modifierSum('damage', new Map<string, unknown>([['event.damageType', comp.damageType]]));
      const { rolls: compRolls, modifier: compModifier } = rollDamage(comp.damageDice, compBonusDice, rng, false);
      additionalBase.push({
        amount: compRolls.reduce((s, v) => s + v, 0) + compModifier + compMod,
        type: comp.damageType,
      });
    }
  }

  for (const targetId of intent.targetIds) {
    const target = state.characters[targetId];
    if (!target) continue;
    // Slice 732: a Sculpt Spells-excluded creature auto-succeeds and takes
    // no damage — modeled as full exclusion (no save, no damage, no
    // condition) for that target.
    if (sculptedSet.has(targetId)) continue;
    // Slice 500: type-gated save (Animal Friendship targets Beasts only).
    // A target whose creature type doesn't match is skipped — no save,
    // no condition.
    if (
      mechanic.targetCreatureType !== undefined &&
      getCreatureType(target, content) !== mechanic.targetCreatureType
    ) {
      continue;
    }
    // Slice 783: Sleep's auto-succeed clause — "creatures that don't sleep,
    // such as elves, or that have Immunity to the Exhaustion condition
    // automatically succeed." Full skip (no save, no condition) when the
    // target is immune to the named condition OR to this mechanic's own
    // conditionOnFail (elf Trance is modeled as immunity to
    // sleep-drowsy-active). Opt-in via autoSucceedIfImmuneToConditionId.
    if (mechanic.autoSucceedIfImmuneToConditionId !== undefined) {
      const autoSucceeds =
        isImmuneToCondition({
          state, content, targetId,
          conditionId: mechanic.autoSucceedIfImmuneToConditionId,
          sourceCharacterId: intent.characterId,
        })
        || (conditionOnFail !== undefined && isImmuneToCondition({
          state, content, targetId,
          conditionId: conditionOnFail,
          sourceCharacterId: intent.characterId,
        }));
      if (autoSucceeds) continue;
    }
    const saveDerivation = computeSavingThrow({
      character: target,
      itemInstances: state.itemInstances,
      content,
      ability: mechanic.ability,
      characters: state.characters,
      // Slice 131: spells are magical sources. Magic Resistance and
      // other "advantage vs magical effects" sources fold in here.
      sourceIsMagical: true,
      // Slice 291: surfaces the would-be-applied condition id for
      // per-condition save-advantage buffs (Antitoxin). When the
      // save mechanic has no conditionOnFail (pure damage saves like
      // Fireball, no-condition saves like Acid Splash), this stays
      // undefined and per-condition gates evaluate false.
      ...(conditionOnFail !== undefined ? { savePreventsCondition: conditionOnFail } : {}),
    });
    // Slice 503: Ensnaring Strike's "Large or larger creature has
    // Advantage on this save" — folded into hasAdvantage per-target.
    const sizeGrantsAdvantage =
      mechanic.largeCreatureAdvantage === true &&
      isLargeOrLarger(creatureSize(target, content));
    const hasAdvantage = saveDerivation.hasAdvantage || sizeGrantsAdvantage;
    // Slice 131: honor save advantage / disadvantage. Pre-slice 131
    // this path always rolled a single d20, silently ignoring effect-
    // stack save-advantage signals (Magic Resistance, Holy Aura,
    // Foresight, etc.). Now rolls 2d20 take-max / take-min per the
    // SaveResult flags. Single d20 still wires when neither advantage
    // nor disadvantage applies (common case).
    const rolls: number[] = [rollDie(D20_SIDES, rng)];
    if (hasAdvantage || saveDerivation.hasDisadvantage) {
      rolls.push(rollDie(D20_SIDES, rng));
    }
    const used = hasAdvantage
      ? 'advantage'
      : saveDerivation.hasDisadvantage
        ? 'disadvantage'
        : 'none';
    const usedD20 = hasAdvantage
      ? Math.max(...rolls)
      : saveDerivation.hasDisadvantage
        ? Math.min(...rolls)
        : rolls[0]!;
    // Slice 331: per-roll save bonus dice (Bless +1d4 / Bane -1d4) on the
    // target's save against this spell.
    const saveBonus = rollSaveBonusDice(saveDerivation.bonusDice, rng);
    const bonus = saveDerivation.total + saveBonus.total;
    const total = usedD20 + bonus;
    const success = total >= dcResult.total;
    const saveEvent: SaveRolledEvent = {
      id: newEventId() as ULID,
      at,
      type: 'SaveRolled',
      targetId,
      ability: mechanic.ability,
      dc: dcResult.total,
      d20: rolls,
      used,
      bonus,
      total,
      success,
      causedByEventId: declaredEventId as ULID,
      breakdown: [...saveDerivation.breakdown, ...saveBonus.breakdown],
    };
    events.push(saveEvent);

    if (mechanic.damageDice !== undefined && mechanic.damageType !== undefined) {
      // Rogue / Monk Evasion: when the target has Evasion and this is
      // a DEX save against a halves-on-success damage spell, swap the
      // formula to (success → 0, fail → half).
      const targetEffects = buildEffectStack({
        character: target,
        content,
        itemInstances: state.itemInstances,
        pendingChoices: state.pendingChoices,
      });
      // Evoker L3 Potent Cantrip: a damaging cantrip whose target succeeds
      // on the save still deals half damage. Treat the cantrip as
      // halves-on-success even when the mechanic doesn't declare it.
      const halvesOnSuccess = mechanic.halfOnSuccess === true || casterHasPotentCantrip;
      const evasionApplies =
        targetEffects.hasEvasion() &&
        mechanic.ability === 'DEX' &&
        halvesOnSuccess;
      const outcomeAmount = (raw: number): number =>
        // Slice 846: Heat Metal's "damage regardless of the save" — full
        // damage on success or failure; the save only governs conditionOnFail.
        mechanic.damageIgnoresSave === true
          ? raw
          : evasionApplies
            ? success
              ? 0
              : halveDamage(raw)
            : success && halvesOnSuccess
              ? halveDamage(raw)
              : success
                ? 0
                : raw;
      // Slice 341: primary + each additional component, each taking the
      // same save / Evasion halving, merged into one DamageApplied so
      // per-type resistance is honored independently (Flame Strike's
      // Fire + Radiant).
      const rawComponents = [
        { amount: outcomeAmount(rawDamage), type: mechanic.damageType },
        ...additionalBase.map((c) => ({ amount: outcomeAmount(c.amount), type: c.type })),
      ].filter((c) => c.amount > 0);
      if (rawComponents.length > 0) {
        const mitigated = mitigateDamage({
          character: target,
          itemInstances: state.itemInstances,
          content,
          rawComponents,
          characters: state.characters,
          sourceIsMagical: true,
        });
        const intercept = interceptFatalDamage({
          state: applyAll(state, events),
          content,
          targetId,
          mitigatedComponents: mitigated,
          causedByEventId: saveEvent.id,
          at,
          rng,
        });
        const damageApplied: DamageAppliedEvent = {
          id: newEventId() as ULID,
          at,
          type: 'DamageApplied',
          targetId,
          components: intercept.components,
          causedByEventId: saveEvent.id,
          sourceCharacterId: intent.characterId as ULID,
          source: spell.id,
        };
        // Slice 621: pre-damage state for conc helper (see attack.ts:1423).
        const stateBeforeThisDamage = applyAll(state, events);
        events.push(damageApplied);
        events.push(...intercept.extraEvents);
        const targetForConc = stateBeforeThisDamage.characters[targetId] ?? target;
        events.push(
          ...planConcentrationOnDamage(stateBeforeThisDamage, content, rng, targetForConc, intercept.components, damageApplied.id, at),
        );
      }
    }
    if (!success && conditionOnFail !== undefined) {
      const immune = isImmuneToCondition({
        state,
        content,
        targetId,
        conditionId: conditionOnFail,
        sourceCharacterId: intent.characterId,
      });
      if (!immune) {
        const appliedConditionId = newAppliedConditionId();
        // Slice 563: source the condition from the target itself (for
        // target-relative durations: Vicious Mockery's "end of its
        // next turn"). Defaults to caster — the historical behavior.
        const conditionSourceId = mechanic.applyConditionSourceFromTarget === true
          ? (targetId as ULID)
          : (intent.characterId as ULID);
        // Stamp autoExpiry on the apply event when the condition has
        // it (mirror of the attack-rider applyRiderCondition shape so
        // turnStart/turnEnd sweeps see the expiresOnRound).
        const autoExpiry = content.conditions.get(conditionOnFail)?.autoExpiry;
        const currentEncounterRound = state.activeEncounterId
          ? state.encounters[state.activeEncounterId]?.round
          : undefined;
        const expiryFields = autoExpiry !== undefined && currentEncounterRound !== undefined
          ? {
              expiresOnRound: currentEncounterRound + autoExpiry.afterRounds,
              expiryTrigger: autoExpiry.trigger,
            }
          : {};
        const cond: ConditionAppliedEvent = {
          id: newEventId() as ULID,
          at,
          type: 'ConditionApplied',
          targetId,
          conditionId: conditionOnFail,
          appliedConditionId,
          sourceCharacterId: conditionSourceId,
          causedByEventId: saveEvent.id,
          // Slice 500: Animal Friendship's "ends if damaged" arm.
          ...(mechanic.conditionEndsOnDamage === true ? { endsOnDamage: true } : {}),
          // Slice 783: bind the condition to the caster's concentration (when
          // any) so it clears on a drop, and so the recurring-save escalation
          // can propagate the link to the escalated condition (Sleep).
          ...(concentrationEffectId !== undefined ? { sourceEffectInstanceId: concentrationEffectId as ULID } : {}),
          ...expiryFields,
        };
        events.push(cond);
        conditionsApplied.push({
          targetId: targetId as ULID,
          conditionId: conditionOnFail,
          appliedConditionId,
        });
      }
    }
    // Forced movement on a failed save (Gust of Wind etc.). Pure
    // informational event — the consumer applies the position
    // change since the engine doesn't model positions.
    if (!success && mechanic.pushedFeetOnFail !== undefined && mechanic.pushedFeetOnFail > 0) {
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'CreaturePushed',
        targetId: targetId as ULID,
        distanceFeet: mechanic.pushedFeetOnFail,
        sourceCharacterId: intent.characterId as ULID,
        source: spell.id,
        causedByEventId: saveEvent.id,
      });
    }
  }
  return { events, conditionsApplied };
};

const planTempHPMechanic = (
  rng: RNG,
  intent: CastSpellIntent,
  spell: Spell,
  mechanic: Extract<SpellMechanic, { kind: 'temp-hp' }>,
  declaredEventId: string,
  at: string,
): Event[] => {
  // False Life pattern: 1d4 + 4 temp HP at base, +5 per slot above
  // 1st. Per RAW, temp HP doesn't stack — the reducer takes
  // max(current, granted), so a stronger source overrides a weaker
  // one and a weaker source is no-op.
  const slotsAboveBase = Math.max(0, intent.slotLevel - spell.level);
  const flat = (mechanic.flatAmount ?? 0) + (mechanic.extraPerSlotLevel ?? 0) * slotsAboveBase;
  const events: Event[] = [];
  for (const targetId of intent.targetIds) {
    let rolled = 0;
    if (mechanic.amountDice !== undefined) {
      const parsed = parseDiceExpression(mechanic.amountDice);
      let sum = parsed.modifier;
      for (let i = 0; i < parsed.count; i += 1) {
        sum += rollDie(parsed.die, rng);
      }
      rolled = sum;
    }
    const amount = Math.max(0, rolled + flat);
    if (amount <= 0) continue;
    const grant: TempHPGrantedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'TempHPGranted',
      targetId: targetId as ULID,
      amount,
      source: spell.id,
      causedByEventId: declaredEventId as ULID,
    };
    events.push(grant);
  }
  return events;
};

// Cleric Life Domain L6 Blessed Healer: flat HP the caster regains on top
// of the slot level when a slot heal lands on another creature.
const BLESSED_HEALER_FLAT = 2;

const planHealMechanic = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: CastSpellIntent,
  spell: Spell,
  mechanic: Extract<SpellMechanic, { kind: 'heal' }>,
  declaredEventId: string,
  at: string,
): Event[] => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  const castingAbilityMod = abilityModifier(character.abilityScores.WIS);
  const bonusDice = (mechanic.extraDicePerSlotLevel ?? 0) * Math.max(0, intent.slotLevel - spell.level);
  const flatAmount = mechanic.flatAmount ?? 0;
  // Cleric's Disciple of Life and similar: spells of 1st level or
  // higher add `flat + perSpellLevel * slotLevel` to each heal target.
  // Cantrips (slotLevel 0) are excluded by `healingBoostFor`.
  const casterEffects = buildEffectStack({
    character,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  });
  const healingBoost = casterEffects.healingBoostFor(intent.slotLevel);
  // Slice 205: Life Domain L17 Supreme Healing replaces every healing
  // die with its maximum value. RAW: "When you would normally roll
  // one or more dice to restore HP with a spell or Channel Divinity,
  // you don't roll those dice; you use the highest possible value
  // instead." Flat modifiers (CHA mod, Disciple of Life boost) still
  // layer on top unchanged.
  const useMaxHealingDice = casterEffects.hasMaxHealingDice();
  const events: Event[] = [];
  for (const targetId of intent.targetIds) {
    let rolledAmount = 0;
    if (mechanic.amountDice !== undefined) {
      if (useMaxHealingDice) {
        const parsed = parseDiceExpression(mechanic.amountDice);
        const totalDice = parsed.count + bonusDice;
        rolledAmount = totalDice * parsed.die + parsed.modifier + castingAbilityMod;
      } else {
        const { rolls, modifier } = rollDamage(mechanic.amountDice, bonusDice, rng, false);
        rolledAmount = rolls.reduce((s, v) => s + v, 0) + modifier + castingAbilityMod;
      }
    }
    const targetBlocked = isHealingBlocked({ state, content, targetId });
    const amount = targetBlocked ? 0 : Math.max(0, rolledAmount + flatAmount + healingBoost);
    const heal: HealedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'Healed',
      targetId,
      amount,
      source: targetBlocked ? `${spell.id} (blocked)` : spell.id,
      causedByEventId: declaredEventId as ULID,
    };
    events.push(heal);
  }
  // Blessed Healer (Cleric Life Domain L6): casting a slot spell that
  // restores HP to a creature other than the caster also heals the caster
  // 2 + the slot level (once, not per target). Cantrips (slotLevel 0) and
  // free casts (no slot spent) don't trigger it.
  if (
    casterEffects.hasBlessedHealer() &&
    intent.slotLevel >= 1 &&
    intent.useFreeCast !== true &&
    intent.targetIds.some((t) => t !== intent.characterId)
  ) {
    const selfBlocked = isHealingBlocked({ state, content, targetId: intent.characterId });
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'Healed',
      targetId: intent.characterId as ULID,
      amount: selfBlocked ? 0 : BLESSED_HEALER_FLAT + intent.slotLevel,
      source: selfBlocked ? 'blessed-healer (blocked)' : 'blessed-healer',
      causedByEventId: declaredEventId as ULID,
    } satisfies HealedEvent);
  }
  return events;
};

interface BuffOutcome {
  readonly events: Event[];
  readonly conditionsApplied: AppliedConditionRef[];
}

const hpMaxBonusFromCondition = (
  content: ResolvedContent,
  conditionId: string,
): number => {
  const def = content.conditions.get(conditionId);
  if (def === undefined) return 0;
  let total = 0;
  for (const eff of def.effects) {
    if (eff.kind !== 'AddModifier') continue;
    if (eff.target !== 'hpMax') continue;
    if (typeof eff.value === 'number') total += eff.value;
  }
  return total;
};

const planBuffMechanic = (
  state: CampaignState,
  intent: CastSpellIntent,
  content: ResolvedContent,
  mechanic: Extract<SpellMechanic, { kind: 'buff' }>,
  spell: Spell,
  declaredEventId: string,
  at: string,
): BuffOutcome => {
  // Buff spells (Bless, Aid, etc.) apply a beneficial condition to each
  // target. The condition holds the actual mechanical bonuses; this
  // planner just stages the ConditionApplied events and threads the
  // appliedConditionIds back to ConcentrationStarted (when applicable)
  // so the condition lifts together with the spell.
  //
  // Conditions whose effects include `AddModifier { target: 'hpMax' }`
  // (Aid's `aid-buffed` +5) additionally bump the target's stored
  // `hp.maxBonus` via an `HPMaxBonusChanged` event so the damage
  // reducer's massive-damage threshold accounts for the buffed max.
  const events: Event[] = [];
  const conditionsApplied: AppliedConditionRef[] = [];
  const conditionId = resolveBuffConditionId(mechanic, intent, spell.id);
  const hpMaxDelta = hpMaxBonusFromCondition(content, conditionId);
  // Read the condition's declarative auto-expiry metadata (slice 109).
  // When set and we're inside an active encounter, stamp expiresOnRound
  // + expiryTrigger so `planAdvanceTurn` lifts the condition at the
  // matching boundary (Blade Ward: "1 round" turn-end self-buff).
  // Outside an encounter, expiry stays consumer-managed.
  const autoExpiry = content.conditions.get(conditionId)?.autoExpiry;
  const currentRound = state.activeEncounterId
    ? state.encounters[state.activeEncounterId]?.round
    : undefined;
  const expiryFields: {
    expiresOnRound?: number;
    expiryTrigger?: 'turnStart' | 'turnEnd';
  } = autoExpiry !== undefined && currentRound !== undefined
    ? {
        expiresOnRound: currentRound + autoExpiry.afterRounds,
        expiryTrigger: autoExpiry.trigger,
      }
    : {};
  for (const targetId of intent.targetIds) {
    if (isImmuneToCondition({
      state,
      content,
      targetId,
      conditionId,
      sourceCharacterId: intent.characterId,
    })) {
      continue;
    }
    const appliedConditionId = newAppliedConditionId();
    const cond: ConditionAppliedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'ConditionApplied',
      targetId,
      conditionId,
      appliedConditionId,
      sourceCharacterId: intent.characterId as ULID,
      causedByEventId: declaredEventId as ULID,
      ...(hpMaxDelta !== 0 ? { hpMaxBonusDelta: hpMaxDelta } : {}),
      ...(expiryFields.expiresOnRound !== undefined
        ? { expiresOnRound: expiryFields.expiresOnRound }
        : {}),
      ...(expiryFields.expiryTrigger !== undefined
        ? { expiryTrigger: expiryFields.expiryTrigger }
        : {}),
      // Slice 124: buff mechanics can stamp an initial pool count
      // (Mirror Image: 3 duplicates) via appliedConditionLevel.
      ...(mechanic.appliedConditionLevel !== undefined
        ? { level: mechanic.appliedConditionLevel }
        : {}),
    };
    events.push(cond);
    conditionsApplied.push({
      targetId: targetId as ULID,
      conditionId,
      appliedConditionId,
    });
  }
  return { events, conditionsApplied };
};

const planRemoveConditionMechanic = (
  state: CampaignState,
  intent: CastSpellIntent,
  mechanic: Extract<SpellMechanic, { kind: 'remove-condition' }>,
  declaredEventId: string,
  at: string,
): Event[] => {
  // Strips the first matching condition from each target. The eligible
  // list is the spell's allowed set (e.g. Lesser Restoration: blinded,
  // deafened, paralyzed, poisoned); we lift the *first* one each target
  // has from that set. Targets carrying none of the eligible conditions
  // get nothing — the spell still resolved, it just had no effect on
  // that target.
  const events: Event[] = [];
  for (const targetId of intent.targetIds) {
    const target = state.characters[targetId];
    if (!target) continue;
    const match = target.appliedConditions.find((c) =>
      mechanic.eligibleConditionIds.includes(c.conditionId),
    );
    if (match === undefined) continue;
    const removed: ConditionRemovedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'ConditionRemoved',
      targetId: targetId as ULID,
      conditionId: match.conditionId,
      causedByEventId: declaredEventId as ULID,
    };
    events.push(removed);
  }
  return events;
};

const planAutoHitMechanic = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: CastSpellIntent,
  spell: Spell,
  mechanic: Extract<SpellMechanic, { kind: 'auto-hit' }>,
  declaredEventId: string,
  at: string,
): Event[] => {
  // Auto-hit spells (Magic Missile, etc.) fire N darts; the dart count
  // scales with the slot level used. Each dart hits an independently
  // targeted creature (the targetIds list is expected to be padded to
  // dartCount; Magic Missile can repeat the same target). Each dart's
  // damage is rolled separately and mitigated independently so a target
  // with resistance benefits per dart.
  const slotsAboveBase = Math.max(0, intent.slotLevel - spell.level);
  const dartCount = mechanic.dartsAtBaseSlot + slotsAboveBase * (mechanic.extraDartsPerSlotLevel ?? 0);
  const events: Event[] = [];
  // Track simulated remaining HP per target across darts so we only emit
  // ConcentrationBroken on the single dart that actually drops them.
  const simulatedHp = new Map<string, number>();
  const brokenConcentrationFor = new Set<string>();
  for (let i = 0; i < dartCount; i++) {
    const targetId = intent.targetIds[i] ?? intent.targetIds[intent.targetIds.length - 1];
    if (targetId === undefined) continue;
    const target = state.characters[targetId];
    if (!target) continue;
    const { rolls, modifier } = rollDamage(mechanic.damageDicePerDart, 0, rng, false);
    const raw = rolls.reduce((s, v) => s + v, 0) + modifier;
    if (raw <= 0) continue;
    const mitigated = mitigateDamage({
      character: target,
      itemInstances: state.itemInstances,
      content,
      rawComponents: [{ amount: raw, type: mechanic.damageType }],
      characters: state.characters,
      sourceIsMagical: true,
    });
    const intercept = interceptFatalDamage({
      state: applyAll(state, events),
      content,
      targetId,
      mitigatedComponents: mitigated,
      causedByEventId: declaredEventId,
      at,
      rng,
    });
    const damageApplied: DamageAppliedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'DamageApplied',
      targetId,
      components: intercept.components,
      causedByEventId: declaredEventId as ULID,
      sourceCharacterId: intent.characterId as ULID,
      source: `${spell.id} (dart ${i + 1})`,
    };
    events.push(damageApplied);
    events.push(...intercept.extraEvents);
    if (
      target.concentrationEffectId !== undefined &&
      !brokenConcentrationFor.has(targetId)
    ) {
      const hpBefore = simulatedHp.get(targetId) ?? target.hp.current;
      const dartTotal = intercept.components.reduce((s, c) => s + c.amount, 0);
      const hpAfter = Math.max(-target.hp.max, hpBefore - dartTotal);
      simulatedHp.set(targetId, hpAfter);
      if (hpBefore > 0 && hpAfter <= 0) {
        const broken: ConcentrationBrokenEvent = {
          id: newEventId() as ULID,
          at,
          type: 'ConcentrationBroken',
          effectInstanceId: target.concentrationEffectId,
          casterId: targetId as ULID,
          reason: 'unconscious',
          causedByEventId: damageApplied.id,
        };
        events.push(broken);
        brokenConcentrationFor.add(targetId);
      }
    }
  }
  return events;
};

const rollDicePool = (expression: string, rng: RNG): { rolls: number[]; total: number } => {
  const parsed = parseDiceExpression(expression);
  const rolls: number[] = [];
  for (let i = 0; i < parsed.count; i++) {
    rolls.push(rollDie(parsed.die, rng));
  }
  const total = rolls.reduce((s, v) => s + v, 0) + parsed.modifier;
  return { rolls, total };
};

const planHPPoolKnockoutMechanic = (
  state: CampaignState,
  rng: RNG,
  intent: CastSpellIntent,
  spell: Spell,
  mechanic: Extract<SpellMechanic, { kind: 'hp-pool-knockout' }>,
  declaredEventId: string,
  at: string,
): Event[] => {
  // 2024 Sleep: roll a pool of dice (5d8 at base, +2d8 per level above 1st).
  // Walk targets in ascending current-HP order, applying `conditionId`
  // (typically `unconscious`) and subtracting their HP from the pool, until
  // the pool can't cover the next target. Targets already carrying the
  // condition are skipped — they wouldn't waste pool HP, and re-applying
  // would be a no-op anyway.
  const { total: basePool } = rollDicePool(mechanic.poolDice, rng);
  const slotsAbove = Math.max(0, intent.slotLevel - spell.level);
  let pool = basePool;
  if (mechanic.extraPoolDicePerSlotLevel !== undefined && slotsAbove > 0) {
    for (let i = 0; i < slotsAbove; i++) {
      pool += rollDicePool(mechanic.extraPoolDicePerSlotLevel, rng).total;
    }
  }
  const candidates = intent.targetIds
    .map((id) => state.characters[id])
    .filter((c): c is NonNullable<typeof c> => c !== undefined)
    .filter((c) => !c.appliedConditions.some((cond) => cond.conditionId === mechanic.conditionId))
    .sort((a, b) => a.hp.current - b.hp.current);
  const events: Event[] = [];
  for (const target of candidates) {
    if (target.hp.current <= 0) continue;
    if (pool < target.hp.current) break;
    pool -= target.hp.current;
    const cond: ConditionAppliedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'ConditionApplied',
      targetId: target.id as ULID,
      conditionId: mechanic.conditionId,
      appliedConditionId: newAppliedConditionId(),
      causedByEventId: declaredEventId as ULID,
      // RAW Sleep: "the effect ends on a creature if it takes damage."
      endsOnDamage: true,
    };
    events.push(cond);
  }
  return events;
};

// Slice 338: HP-threshold tier effect (Power Word Kill, the canonical
// user). For each target, read current Hit Points and pick the arm:
// `atOrBelow` when current HP <= threshold, `above` otherwise. Power
// Word Kill: threshold 100, destroy at or below, 12d12 psychic above.
// The `destroy` arm reuses the slice-323 CreatureDestroyed instant-
// death path (bypasses death saves); the `damage` arm runs through the
// same mitigation + fatal-damage intercept as any other spell damage.
const planHpThresholdMechanic = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: CastSpellIntent,
  spell: Spell,
  mechanic: Extract<SpellMechanic, { kind: 'hp-threshold' }>,
  declaredEventId: string,
  at: string,
): Event[] => {
  const events: Event[] = [];
  for (const targetId of intent.targetIds) {
    const target = state.characters[targetId];
    if (!target) continue;
    const arm =
      target.hp.current <= mechanic.threshold ? mechanic.atOrBelow : mechanic.above;
    if (arm === undefined) continue;
    if (arm.kind === 'destroy') {
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'CreatureDestroyed',
        targetId: targetId as ULID,
        sourceCharacterId: intent.characterId as ULID,
        source: spell.id,
        causedByEventId: declaredEventId as ULID,
      } satisfies CreatureDestroyedEvent);
      continue;
    }
    if (arm.kind === 'condition') {
      const immune = isImmuneToCondition({
        state,
        content,
        targetId,
        conditionId: arm.conditionId,
        sourceCharacterId: intent.characterId,
      });
      if (!immune) {
        events.push({
          id: newEventId() as ULID,
          at,
          type: 'ConditionApplied',
          targetId: targetId as ULID,
          conditionId: arm.conditionId,
          appliedConditionId: newAppliedConditionId(),
          sourceCharacterId: intent.characterId as ULID,
          causedByEventId: declaredEventId as ULID,
        } satisfies ConditionAppliedEvent);
      }
      continue;
    }
    const rolled = rollExpression(arm.damageDice, rng).total;
    if (rolled <= 0) continue;
    const mitigated = mitigateDamage({
      character: target,
      itemInstances: state.itemInstances,
      content,
      rawComponents: [{ amount: rolled, type: arm.damageType }],
      characters: state.characters,
      sourceIsMagical: true,
    });
    const intercept = interceptFatalDamage({
      state: applyAll(state, events),
      content,
      targetId,
      mitigatedComponents: mitigated,
      causedByEventId: declaredEventId,
      at,
      rng,
    });
    const damageApplied: DamageAppliedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'DamageApplied',
      targetId,
      components: intercept.components,
      causedByEventId: declaredEventId as ULID,
      sourceCharacterId: intent.characterId as ULID,
      source: spell.id,
    };
    // Slice 621: pre-damage state for conc helper (see attack.ts:1423).
    const stateBeforeThisDamage = applyAll(state, events);
    events.push(damageApplied);
    events.push(...intercept.extraEvents);
    const targetForConc = stateBeforeThisDamage.characters[targetId] ?? target;
    events.push(...planConcentrationOnDamage(stateBeforeThisDamage, content, rng, targetForConc, intercept.components, damageApplied.id, at));
  }
  return events;
};

// Casts a summon spell (Find Familiar, Conjure Animals, Summon Beast, etc):
// emits a single CompanionSummoned event. The reducer creates the
// companion Character. HP scales by slot level via the spell mechanic's
// `hpBase + (slotLevel - baseSlotLevel) * hpPerSlotAbove`. When the
// spell is concentration the event carries the concentration effect's
// ID so the auto-dismiss in clearConcentrationEffect removes the
// companion at the same time as the effect's conditions.
const planSummonMechanic = (
  intent: CastSpellIntent,
  spell: Spell,
  mechanic: Extract<SpellMechanic, { kind: 'summon' }>,
  declaredEventId: string,
  at: string,
  concentrationEffectId: string | undefined,
): Event[] => {
  const slotsAboveBase = Math.max(0, intent.slotLevel - mechanic.baseSlotLevel);
  const hp = mechanic.hpBase + slotsAboveBase * mechanic.hpPerSlotAbove;
  const companionId = newCharacterId();
  const event: CompanionSummonedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'CompanionSummoned',
    companionId,
    controllerId: intent.characterId as ULID,
    spellId: spell.id,
    slotLevel: intent.slotLevel,
    name: mechanic.name,
    ac: mechanic.ac,
    hp,
    speedFeet: mechanic.speedFeet,
    causedByEventId: declaredEventId as ULID,
    ...(concentrationEffectId !== undefined
      ? { effectInstanceId: concentrationEffectId as ULID }
      : {}),
  };
  return [event];
};

// Primes a trap by emitting a single TrapArmed event. No rolls at
// cast time — damage is rolled at trigger time via planTriggerTrap.
// The DC is pre-baked (caster's spell save DC, or the mechanic's
// `fixedDC` when set), as is the damage type (caster-chosen via
// `casterChoice.kind === 'damageType'` when allowed). Cordon of
// Arrows is the fixed-DC / fixed-type case; Glyph of Warding's
// Explosive Runes is the caster-DC / caster-chosen-type case.
const planTrapMechanic = (
  state: CampaignState,
  content: ResolvedContent,
  intent: CastSpellIntent,
  spell: Spell,
  mechanic: Extract<SpellMechanic, { kind: 'trap' }>,
  declaredEventId: string,
  at: string,
  castingClassId: string | undefined,
  castingAbility: 'INT' | 'WIS' | 'CHA',
): Event[] => {
  const damageType = resolveTrapDamageType(mechanic, intent, spell.id);

  let dc = mechanic.fixedDC;
  if (dc === undefined) {
    const character = state.characters[intent.characterId];
    if (!character) throw new Error(`Unknown character ${intent.characterId}`);
    const dcResult = computeSpellSaveDC({
      character,
      itemInstances: state.itemInstances,
      content,
      classId: castingClassId ?? '',
      characters: state.characters,
      castingAbility,
    });
    dc = dcResult.total;
  }

  const trapId = newTrapId();
  const event: TrapArmedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'TrapArmed',
    trapId: trapId as ULID,
    label: mechanic.label,
    sourceCharacterId: intent.characterId as ULID,
    sourceSpellId: spell.id,
    payload: {
      saveAbility: mechanic.saveAbility,
      saveDC: dc,
      damageDice: mechanic.damageDice,
      damageType,
      halfOnSuccess: mechanic.halfOnSuccess,
    },
    chargesRemaining: mechanic.charges,
    causedByEventId: declaredEventId as ULID,
  };
  return [event];
};

const resolveTrapDamageType = (
  mechanic: Extract<SpellMechanic, { kind: 'trap' }>,
  intent: CastSpellIntent,
  spellId: string,
): DamageType => {
  if (mechanic.casterChoosesDamageType !== undefined) {
    if (mechanic.damageType !== undefined) {
      throw new Error(
        `Spell ${spellId} trap mechanic sets both damageType and casterChoosesDamageType; pick exactly one`,
      );
    }
    const choice = intent.casterChoice;
    if (choice === undefined || choice.kind !== 'damageType') {
      throw new Error(
        `Spell ${spellId} requires a casterChoice { kind: 'damageType', value }; received ${choice?.kind ?? 'none'}`,
      );
    }
    if (!mechanic.casterChoosesDamageType.allowed.includes(choice.value)) {
      throw new Error(
        `Spell ${spellId}: damage type '${choice.value}' not in allowed list [${mechanic.casterChoosesDamageType.allowed.join(', ')}]`,
      );
    }
    return choice.value;
  }
  if (mechanic.damageType === undefined) {
    throw new Error(
      `Spell ${spellId} trap mechanic has neither damageType nor casterChoosesDamageType`,
    );
  }
  return mechanic.damageType;
};

// Slice 494: weapon-attack-via-spell mechanic dispatch. Canonical user:
// True Strike RAW (2024 cantrip): "you make one attack with the weapon
// used in the spell's casting. The attack uses your spellcasting
// ability for the attack and damage rolls instead of using Strength or
// Dexterity." Resolves to a normal resolveAttack call with the
// caster's spellcasting ability passed as the abilityOverride.
// Requires `intent.weaponInstanceId` (the weapon used in the spell's
// casting); throws if absent. Targets the first entry in
// `intent.targetIds` (single-target attack per RAW).
//
// Deferred RAW arms (still consumer-managed / partial):
//   - Damage-type choice (radiant-or-normal). For now the attack
//     deals the weapon's printed damage type; the caster cannot
//     pick Radiant via the engine yet.
//   - Cantrip-scaling extra Radiant at character levels 5 / 11 / 17
//     (+1d6 / +2d6 / +3d6). Needs a follow-up that runs the cantrip
//     scaling against a flat radiant rider; documented as deferred.
const planWeaponAttackMechanic = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: CastSpellIntent,
  spell: Spell,
  castingAbility: 'INT' | 'WIS' | 'CHA',
  declaredEventId: string,
  at: string,
): Event[] => {
  if (intent.weaponInstanceId === undefined) {
    throw new Error(
      `Spell ${spell.id} is a weaponAttack mechanic and requires intent.weaponInstanceId`,
    );
  }
  if (intent.targetIds.length === 0) {
    throw new Error(`Spell ${spell.id} weaponAttack requires a targetId`);
  }
  const targetId = intent.targetIds[0]!;
  return [...resolveAttack({
    state,
    content,
    rng,
    attackerId: intent.characterId,
    targetId,
    weaponInstanceId: intent.weaponInstanceId,
    abilityOverride: castingAbility,
    at,
  })].map((e, i) => i === 0 ? { ...e, causedByEventId: declaredEventId as ULID } as Event : e);
};

// Slice 501: weapon-buff mechanic dispatch. Stamps a Shillelagh-style
// transformation onto the named weapon instance via one ItemBuffApplied
// (no concentration link: Shillelagh is a 1-minute non-concentration
// effect, consumer-managed expiry). The damage-type choice (if any) is
// resolved from intent.casterChoice; a pick outside the allowed list
// leaves the weapon's normal type. Validates the instance exists and is
// a weapon so misuse fails at plan time.
const planWeaponBuffMechanic = (
  state: CampaignState,
  content: ResolvedContent,
  intent: CastSpellIntent,
  spell: Spell,
  mechanic: Extract<SpellMechanic, { kind: 'weapon-buff' }>,
  castingAbility: 'INT' | 'WIS' | 'CHA',
  declaredEventId: string,
  at: string,
): Event[] => {
  if (intent.weaponInstanceId === undefined) {
    throw new Error(
      `Spell ${spell.id} is a weapon-buff mechanic and requires intent.weaponInstanceId`,
    );
  }
  const instance = state.itemInstances[intent.weaponInstanceId];
  if (instance === undefined) {
    throw new Error(
      `Spell ${spell.id} weapon-buff references unknown weapon instance ${intent.weaponInstanceId}`,
    );
  }
  const def = content.items.get(instance.definitionId);
  if (def === undefined || def.itemKind !== 'weapon') {
    throw new Error(
      `Spell ${spell.id} weapon-buff target ${intent.weaponInstanceId} is not a weapon`,
    );
  }
  const chosenType =
    mechanic.damageTypeChoice !== undefined &&
    intent.casterChoice?.kind === 'damageType' &&
    mechanic.damageTypeChoice.allowed.includes(intent.casterChoice.value)
      ? intent.casterChoice.value
      : undefined;
  const event: ItemBuffAppliedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ItemBuffApplied',
    instanceId: intent.weaponInstanceId as ULID,
    attackBonus: 0,
    damageBonus: 0,
    ...(mechanic.useSpellcastingAbility === true ? { abilityOverride: castingAbility } : {}),
    ...(mechanic.damageDieOverride !== undefined ? { damageDieOverride: mechanic.damageDieOverride } : {}),
    ...(chosenType !== undefined ? { damageTypeOverride: chosenType } : {}),
    source: spell.name,
    causedByEventId: declaredEventId as ULID,
  };
  return [event];
};

// Slice 499: item-creation mechanic dispatch. Mints `quantity` fresh
// instances of `mechanic.itemDefinitionId` straight into the caster's
// inventory via one ItemAcquired-with-characterId event each. Canonical
// user: Goodberry (10 single-use `goodberry` consumables). Validates
// the item definition exists so a typo fails at plan time.
// Slice 520: stabilize-the-dying mechanic. Emits a `Stabilized` event
// on the first valid target (0 HP, not yet stable, not dead). Mirrors
// the create-item shape: tiny, deterministic, no RNG. The event-side
// reducer (`applyStabilized`) flips `deathSaves.stable = true` and
// halts the death-save sequence. Ineligible targets produce zero
// events; the surrounding cast-spell envelope still consumes the
// spell economy, matching the RAW "spell does nothing" outcome.
const planStabilizeMechanic = (
  state: CampaignState,
  intent: CastSpellIntent,
  spell: Spell,
  declaredEventId: string,
  at: string,
): Event[] => {
  const targetId = intent.targetIds?.[0];
  if (!targetId) {
    throw new Error(`Spell ${spell.id} stabilize requires a targetId`);
  }
  const target = state.characters[targetId];
  if (!target) {
    throw new Error(`Spell ${spell.id} stabilize target ${targetId} not found`);
  }
  if (target.hp.current !== 0) return [];
  if (target.deathSaves.stable === true) return [];
  return [
    {
      id: newEventId() as ULID,
      at,
      type: 'Stabilized',
      targetId: targetId as ULID,
      causedByEventId: declaredEventId as ULID,
    } as Event,
  ];
};

const planCreateItemMechanic = (
  content: ResolvedContent,
  intent: CastSpellIntent,
  spell: Spell,
  mechanic: Extract<SpellMechanic, { kind: 'create-item' }>,
  declaredEventId: string,
): Event[] => {
  if (content.items.get(mechanic.itemDefinitionId) === undefined) {
    throw new Error(
      `Spell ${spell.id} create-item references unknown item '${mechanic.itemDefinitionId}'`,
    );
  }
  const events: Event[] = [];
  for (let i = 0; i < mechanic.quantity; i += 1) {
    events.push({
      id: newEventId() as ULID,
      at: intent.at ?? nowIso(),
      type: 'ItemAcquired',
      instance: {
        id: newItemInstanceId(),
        definitionId: mechanic.itemDefinitionId,
        quantity: 1,
        attuned: false,
        identifiedByCharacterIds: [],
      },
      characterId: intent.characterId as ULID,
      causedByEventId: declaredEventId as ULID,
    } as Event);
  }
  return events;
};

export const planCastSpell = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  rawIntent: CastSpellIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[rawIntent.characterId];
  if (!character) throw new Error(`Unknown character ${rawIntent.characterId}`);
  assertActorCanAct(character, 'cast a spell');
  const spell = content.spells.get(rawIntent.spellId);
  if (!spell) throw new Error(`Unknown spell ${rawIntent.spellId}`);
  // Slice 804: RAW Armor Training — "you can't cast spells" while wearing
  // Light/Medium/Heavy armor you lack training with.
  if (wearsUntrainedBodyArmor(character, content, state.itemInstances, buildEffectStack({
    character, content, itemInstances: state.itemInstances, pendingChoices: state.pendingChoices,
  }))) {
    throw new Error(`${character.name} can't cast spells while wearing armor they lack training with`);
  }

  // Slice 787: opt-in area enforcement. When the caller supplies an `aim`
  // and the spell has an area, the engine derives WHO the template covers
  // (the canonical rasterizer + line of effect) and uses that as the target
  // set — the engine owns membership instead of trusting consumer targetIds.
  // Everything downstream reads `intent`, so this single rebinding is the
  // whole switch; the per-target range gate keys off `areaEnforced` below.
  const areaEnforced = rawIntent.aim !== undefined && spell.targeting !== undefined;
  const intent: CastSpellIntent = areaEnforced
    ? {
        ...rawIntent,
        targetIds: creaturesInSpellArea(state, content, {
          encounterId: state.activeEncounterId ?? '',
          casterId: rawIntent.characterId,
          spellId: rawIntent.spellId,
          aim: rawIntent.aim!,
        }),
      }
    : rawIntent;

  // Slice 807: RAW Charmed — "you can't attack the charmer or target the
  // charmer with damaging abilities or magical effects." A harmful spell
  // (one carrying an attack or save mechanic) can't TARGET a creature the
  // caster is Charmed by. Gated on explicit targets — an AoE the charmer
  // happens to stand in (area-enforced membership) isn't "targeting" them.
  // Weapon attacks are gated the same way in planAttack.
  if (!areaEnforced && spell.mechanicalEffects.some((m) => m.kind === 'attack' || m.kind === 'save')) {
    for (const targetId of intent.targetIds) {
      const charmedByTarget = character.appliedConditions.some(
        (c) => c.conditionId === 'charmed' && c.sourceCharacterId === targetId,
      );
      if (charmedByTarget) {
        throw new Error(
          `${character.name} is Charmed by ${state.characters[targetId]?.name ?? targetId} and cannot target them with ${spell.name}`,
        );
      }
    }
  }

  if (intent.ignorePreparation !== true && !characterKnowsSpell(state, content, character, intent.spellId)) {
    throw new Error(`Character does not know or prepare spell ${intent.spellId}`);
  }
  if (intent.slotLevel < spell.level) {
    throw new Error(
      `Slot level ${intent.slotLevel} insufficient for spell level ${spell.level}`,
    );
  }

  const castingClassId = findCastingClass(character, content, intent.castingClassId);
  // Slice 487: resolve the spellcasting ability used for DC / attack
  // computations. Class first, GrantSpell fallback. A character with no
  // spellcasting class and no GrantSpell entry for this spell cannot
  // cast it via the planner.
  const castingAbility = resolveCastingAbility(character, content, state, castingClassId, intent.spellId);
  if (castingAbility === undefined) {
    throw new Error(
      `${character.name} cannot cast ${spell.name}: no spellcasting class and no GrantSpell entry for this spell`,
    );
  }
  const slotSource = chooseSlotSource(spell, intent, state, content);

  const castAsRitual = intent.asRitual === true;
  if (castAsRitual && spell.ritual !== true) {
    throw new Error(`Spell ${spell.id} cannot be cast as a ritual`);
  }

  // Slice 486: useFreeCast implies noSlotCost and gates on the bearer's
  // GrantSpell oncePerLongRest grants + the usedFreeCastSpellIds tracker.
  // Slice 566: ALSO supports pool-based free casts (Ranger Favored Enemy
  // Hunter's Mark: GrantSpell with `freeCastResourceId: 'hunters-mark'`
  // bypasses the slot by consuming the named resource). Exactly one
  // path applies per cast; the matched grant's source determines the
  // event emitted below (FreeCastUsed for the oncePerLongRest path,
  // ResourceSpent for the pool path).
  // Computed before the slot-availability gate so the validation errors
  // surface even when the caster has no slots of the requested level.
  const useFreeCast = intent.useFreeCast === true;
  let freeCastPoolResourceId: string | undefined;
  // Slice 794: set to the spellId when this free cast draws from an NPC
  // "N/Day Each" per-long-rest budget (a perLongRest GrantSpell); the
  // emit block below records the use via PerDayCastUsed.
  let perDayCastSpellId: string | undefined;
  // Slice 818: when the matched free-cast grant carries `castAsBonusAction`
  // (an NPC bonus-action spell group like the Priest's Divine Aid), the
  // cast consumes the Bonus Action instead of the spell's printed Action.
  let castAsBonusActionOverride = false;
  if (useFreeCast) {
    const effects = buildEffectStack({
      character,
      content,
      itemInstances: state.itemInstances,
      pendingChoices: state.pendingChoices,
    });
    const grants = effects.grantedSpells().filter((g) => g.spellId === intent.spellId);
    const onceGrant = grants.find((g) => g.preparation === 'oncePerLongRest');
    const poolGrant = grants.find((g) => g.freeCastResourceId !== undefined);
    // Slice 794: the SRD 5.2.1 NPC "N/Day Each" usage bucket.
    const perDayGrant = grants.find((g) => g.preparation === 'perLongRest');
    if (onceGrant !== undefined) {
      if (character.usedFreeCastSpellIds.includes(intent.spellId)) {
        throw new Error(
          `${character.name} has already used the free cast for ${spell.name} since the last long rest`,
        );
      }
    } else if (poolGrant !== undefined) {
      const resourceId = poolGrant.freeCastResourceId!;
      const resource = character.resources.find((r) => r.resourceId === resourceId);
      if (resource === undefined || resource.current <= 0) {
        throw new Error(
          `${character.name} cannot use a free cast for ${spell.name}: resource ${resourceId} is depleted or absent`,
        );
      }
      freeCastPoolResourceId = resourceId;
    } else if (perDayGrant !== undefined) {
      const budget = perDayGrant.usesPerLongRest ?? 1;
      // Slice 818: a `perDayPoolId` shares one "N/Day" budget across every
      // granted spell tagged with the same pool (the Priest's Divine Aid:
      // Bless / Dispel Magic / Healing Word / Lesser Restoration, 3/Day
      // total). Sum each member's per-spell counter; otherwise meter the
      // single spell as before. Each cast still increments its own spell's
      // counter (so PerDayCastUsed.spellId stays accurate); the long rest
      // clears them all.
      const poolId = perDayGrant.perDayPoolId;
      const used =
        poolId !== undefined
          ? effects
              .grantedSpells()
              .filter((g) => g.perDayPoolId === poolId)
              .reduce((sum, g) => sum + (character.perDayCastsUsed[g.spellId] ?? 0), 0)
          : character.perDayCastsUsed[intent.spellId] ?? 0;
      if (used >= budget) {
        throw new Error(
          `${character.name} has no remaining daily uses of ${spell.name} (${budget}/day)`,
        );
      }
      perDayCastSpellId = intent.spellId;
    } else {
      throw new Error(
        `${character.name} cannot use a free cast for ${spell.name}: no oncePerLongRest, per-day, or pool-based grant for this spell`,
      );
    }
    castAsBonusActionOverride =
      (onceGrant ?? poolGrant ?? perDayGrant)?.castAsBonusAction === true;
  }
  // Slice 513: a spell granted to this character with `preparation: 'at-will'`
  // (Warlock invocations like Armor of Shadows, Fiendish Vigor, Mask of
  // Many Faces, etc.) is cast without expending a slot RAW. The cast path
  // walks the bearer's effect-stack GrantSpell entries and checks whether
  // any grants the cast spell id at-will; if so, slot consumption is
  // bypassed regardless of the consumer's intent flags.
  const isAtWillGranted = (() => {
    if (spell.level === CANTRIP_LEVEL) return false; // cantrips already bypass slots
    const effects = buildEffectStack({
      character,
      content,
      itemInstances: state.itemInstances,
      pendingChoices: state.pendingChoices,
    });
    return effects.grantedSpells().some(
      (g) => g.spellId === intent.spellId && g.preparation === 'at-will',
    );
  })();
  const noSlotCost = intent.noSlotCost === true || useFreeCast || isAtWillGranted;
  if (spell.level > CANTRIP_LEVEL && !castAsRitual && !noSlotCost) {
    const available = computeAvailableSpellSlots(character, content.classes);
    if (slotSource === 'pact') {
      if (available.pact === undefined || available.pact.count <= 0) {
        throw new Error('No pact slots available');
      }
      if (intent.slotLevel !== available.pact.level) {
        throw new Error(
          `Pact slots are level ${available.pact.level}; requested level ${intent.slotLevel}`,
        );
      }
    } else {
      const slotsLeft = available.standardByLevel[intent.slotLevel - 1] ?? 0;
      if (slotsLeft <= 0) {
        throw new Error(`No spell slots of level ${intent.slotLevel} available`);
      }
    }
  }

  // RAW PHB ch.7 "Casting Time": a spell's castingTime determines
  // which action-economy slot it consumes. Most leveled spells take
  // an Action; some take a Bonus Action or Reaction. Long-cast spells
  // (Ritual, 1 Minute, 10 Minutes, etc.) don't fit the per-turn slot
  // model — the engine doesn't gate them on combat action economy.
  //
  // The action-economy events are only emitted (and only enforced)
  // when the caster is the active combatant in an active encounter.
  // Out-of-encounter casts skip both the check and the event, matching
  // how planShield / planCounterspell already do this.
  const castingTimeKind = ((): 'action' | 'bonusAction' | 'reaction' | 'long' => {
    // Slice 818: an NPC bonus-action spell group (the Priest's Divine Aid)
    // overrides the printed casting time — Bless / Dispel Magic are cast as
    // a Bonus Action through the grant.
    if (castAsBonusActionOverride) return 'bonusAction';
    const ct = spell.castingTime.trim().toLowerCase();
    if (ct === 'action') return 'action';
    if (ct === 'bonus action') return 'bonusAction';
    if (ct === 'reaction') return 'reaction';
    return 'long';
  })();
  // Slice 603 / 816: RAW Produce Flame / Flame Blade shape. The spell's
  // castingTime says "Bonus Action" — that BA produces the persistent
  // effect (flame in hand / fiery blade). To actually MAKE THE ATTACK,
  // RAW requires a SEPARATE Magic action: Produce Flame ("you can take a
  // Magic action to hurl fire at a creature"), Flame Blade ("As a Magic
  // action, you can make a melee spell attack"). Pre-slice-603 the engine
  // collapsed BA cast + Magic-action hurl into one BA, letting Druids get
  // a free spell attack alongside their full Action.
  //
  // The fix treats casting such a spell at a target as consuming BOTH a
  // BA (the cast) AND an Action (the hurl). This is a stopgap that gets
  // the action economy right without splitting the cast into two separate
  // planners (proper RAW would be: cast emits a persistent effect, a
  // follow-up `MagicAction` intent rolls the hurl).
  //
  // Slice 816: this is keyed on the attack mechanic's explicit
  // `requiresMagicAction` flag — NOT the old `duration !== instantaneous`
  // heuristic, which wrongly caught Spiritual Weapon. RAW Spiritual Weapon
  // ("you can IMMEDIATELY make one melee spell attack") makes its attack
  // as part of the Bonus-Action cast, so it costs no extra Action.
  //
  // Casters who want to cast PF purely for the light (no attack) can
  // still do so by supplying no targetIds — the targets check below
  // gates the implicit Action consumption.
  const attackRequiresMagicAction = spell.mechanicalEffects.some(
    (m) => m.kind === 'attack' && m.requiresMagicAction === true,
  );
  const consumesImplicitMagicAction =
    castingTimeKind === 'bonusAction'
    && attackRequiresMagicAction
    && intent.targetIds.length > 0;
  const encounter = state.activeEncounterId ? state.encounters[state.activeEncounterId] : undefined;
  const casterCombatant =
    encounter?.combatants.find((c) => c.combatantId === intent.characterId) ?? undefined;
  if (casterCombatant !== undefined && !castAsRitual) {
    if (castingTimeKind === 'action' && casterCombatant.turnUsage.actionUsed) {
      throw new Error(
        `${character.name} cannot cast ${spell.name}: action already used this turn`,
      );
    }
    if (castingTimeKind === 'bonusAction' && casterCombatant.turnUsage.bonusActionUsed) {
      throw new Error(
        `${character.name} cannot cast ${spell.name}: bonus action already used this turn`,
      );
    }
    if (castingTimeKind === 'reaction' && casterCombatant.turnUsage.reactionUsedThisRound) {
      throw new Error(
        `${character.name} cannot cast ${spell.name}: reaction already used this round`,
      );
    }
    // Slice 806: RAW (spells.md) "On a turn, you can expend only one spell
    // slot to cast a spell." Block a second slot-expending cast this turn
    // (e.g. a Bonus Action Spiritual Weapon then an Action Fireball);
    // cantrips, rituals, and free / at-will casts (no slot) are exempt.
    if (
      spell.level > CANTRIP_LEVEL && !noSlotCost &&
      casterCombatant.turnUsage.spellSlotExpendedThisTurn
    ) {
      throw new Error(
        `${character.name} cannot cast ${spell.name}: a spell slot was already expended this turn (RAW: one slot per turn)`,
      );
    }
    if (consumesImplicitMagicAction && casterCombatant.turnUsage.actionUsed) {
      throw new Error(
        `${character.name} cannot hurl ${spell.name}: action already used this turn (RAW: a BA cast + Magic action hurl requires both unspent)`,
      );
    }
  }

  const at = intent.at ?? nowIso();
  // Slice 685: spell range + line-of-effect gate. No-op when the
  // spatial context can't be resolved for a given target (positionless
  // / map-less encounters); throws when a target is past the spell's
  // RAW range OR when a wall / closed door blocks the LoE ray. Self-
  // ranged spells (kind: 'self') and non-finite RAW shapes (kind:
  // 'unenforced' — 'Special', 'Sight', '1 mile') skip enforcement.
  const spellRangeKind = parseSpellRange(spell.range);
  const enforcedRangeFeet = enforceableSpellRangeFeet(spellRangeKind);
  // The per-target range gate is for single-target casts. For an aim-
  // enforced area cast the rasterizer already constrained membership, and
  // RAW the range is to the point of origin (a far-edge creature may be past
  // it) — so skip it here. (Validating the aim's own placement-range is the
  // separate `positionless-range-los-trusts-consumer` seam.)
  if (enforcedRangeFeet !== undefined && !areaEnforced) {
    for (const targetId of intent.targetIds) {
      if (targetId === intent.characterId) continue;
      const targetName = state.characters[targetId]?.name ?? targetId;
      assertWithinSpellRange(
        state,
        intent.characterId,
        targetId,
        enforcedRangeFeet,
        character.name,
        `${spell.name} at ${targetName}`,
      );
    }
  }
  // Slice 682: Slow's V/S spellcasting gate. RAW (PHB 2024): "Whenever
  // the target attempts to cast a spell with a Somatic or Verbal
  // Component, it must roll a d20. On an 11 or lower, the spell
  // doesn't take effect, and the spell's action is wasted (but its
  // components and Spell Slot, if used, aren't expended)."
  //
  // The d20 is rolled BEFORE slot consumption and mechanical effects;
  // on failure we emit SpellCastDeclared + SpellCastFizzled + the
  // action-economy consume, then return early. Slot is preserved.
  const slowedCasterFizzleGateD20: number | undefined = (() => {
    if (!character.appliedConditions.some((c) => c.conditionId === 'slowed-by-spell-active')) {
      return undefined;
    }
    if (spell.components.verbal !== true && spell.components.somatic !== true) {
      return undefined;
    }
    return rollDie(D20_SIDES, rng);
  })();
  const slowedCasterFizzled =
    slowedCasterFizzleGateD20 !== undefined && slowedCasterFizzleGateD20 <= 10;

  const declared: SpellCastDeclaredEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SpellCastDeclared',
    characterId: intent.characterId,
    spellId: intent.spellId,
    slotLevel: intent.slotLevel,
    slotSource,
    targetIds: [...intent.targetIds],
    castAsRitual,
  };
  const events: Event[] = [declared];

  if (slowedCasterFizzled) {
    const fizzled: SpellCastFizzledEvent = {
      id: newEventId() as ULID,
      at,
      type: 'SpellCastFizzled',
      characterId: intent.characterId as ULID,
      spellId: intent.spellId,
      reason: 'slow-spell-v-or-s-d20-failed',
      d20: slowedCasterFizzleGateD20!,
    };
    events.push(fizzled);
    // Action IS consumed per RAW ("the spell's action is wasted").
    if (encounter !== undefined && casterCombatant !== undefined && !castAsRitual) {
      const economyKind =
        castingTimeKind === 'action'
          ? 'action'
          : castingTimeKind === 'bonusAction'
            ? 'bonusAction'
            : castingTimeKind === 'reaction'
              ? 'reaction'
              : undefined;
      if (economyKind !== undefined) {
        events.push({
          id: newEventId() as ULID,
          at,
          type: 'ActionEconomyConsumed',
          encounterId: encounter.id,
          combatantId: intent.characterId,
          kind: economyKind,
        });
      }
    }
    return events;
  }

  // Emit the action-economy consumption right after the declaration
  // so the apply() reducer marks turnUsage before any subsequent
  // events run. Skip for rituals and for long-cast spells outside
  // initiative.
  if (encounter !== undefined && casterCombatant !== undefined && !castAsRitual) {
    const economyKind =
      castingTimeKind === 'action'
        ? 'action'
        : castingTimeKind === 'bonusAction'
          ? 'bonusAction'
          : castingTimeKind === 'reaction'
            ? 'reaction'
            : undefined;
    if (economyKind !== undefined) {
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: encounter.id,
        combatantId: intent.characterId,
        kind: economyKind,
      });
    }
    if (consumesImplicitMagicAction) {
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: encounter.id,
        combatantId: intent.characterId,
        kind: 'action',
      });
    }
  }

  if (spell.level > CANTRIP_LEVEL && !castAsRitual && !noSlotCost) {
    if (slotSource === 'pact') {
      const consumed: PactSlotConsumedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'PactSlotConsumed',
        characterId: intent.characterId,
        causedByEventId: declared.id,
      };
      events.push(consumed);
    } else {
      const consumed: SpellSlotConsumedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'SpellSlotConsumed',
        characterId: intent.characterId,
        slotLevel: intent.slotLevel,
        causedByEventId: declared.id,
      };
      events.push(consumed);
    }
  }
  // Slice 486: record the free-cast consumption when useFreeCast was set
  // (validated above). The reducer appends spellId to the bearer's
  // usedFreeCastSpellIds; long rest clears it.
  // Slice 566: for the pool-based free-cast path, emit ResourceSpent
  // instead (the resource itself recharges on long/short rest per its
  // GrantResource declaration; no per-cast tracker needed). Exactly
  // one of the two paths fires per cast.
  if (useFreeCast) {
    if (freeCastPoolResourceId !== undefined) {
      const resourceSpent: ResourceSpentEvent = {
        id: newEventId() as ULID,
        at,
        type: 'ResourceSpent',
        characterId: intent.characterId as ULID,
        resourceId: freeCastPoolResourceId,
        amount: 1,
        causedByEventId: declared.id,
      };
      events.push(resourceSpent);
    } else if (perDayCastSpellId !== undefined) {
      // Slice 794: record one consumed "N/Day Each" use; the reducer
      // increments perDayCastsUsed[spellId], the long rest clears it.
      const perDay: PerDayCastUsedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'PerDayCastUsed',
        characterId: intent.characterId as ULID,
        spellId: perDayCastSpellId,
        causedByEventId: declared.id,
      };
      events.push(perDay);
    } else {
      const freeCast: FreeCastUsedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'FreeCastUsed',
        characterId: intent.characterId,
        spellId: intent.spellId,
        causedByEventId: declared.id,
      };
      events.push(freeCast);
    }
  }

  const conditionsApplied: AppliedConditionRef[] = [];
  // Pre-generate the concentration effect ID when the spell concentrates.
  // The summon mechanic needs it during dispatch to bind the companion
  // to the effect; the ConcentrationStarted event below reuses the same
  // ID so the link is honored by `clearConcentrationEffect`.
  const concentrationEffectId =
    spell.concentration === true ? newEffectInstanceId() : undefined;

  for (const mechanic of spell.mechanicalEffects) {
    if (mechanic.kind === 'attack') {
      events.push(
        ...planAttackMechanic(state, content, rng, intent, spell, mechanic, declared.id, at, castingClassId, castingAbility, concentrationEffectId),
      );
    } else if (mechanic.kind === 'save') {
      const outcome = planSaveMechanic(
        state, content, rng, intent, spell, mechanic, declared.id, at, castingClassId, castingAbility, concentrationEffectId,
      );
      events.push(...outcome.events);
      conditionsApplied.push(...outcome.conditionsApplied);
    } else if (mechanic.kind === 'auto-hit') {
      events.push(...planAutoHitMechanic(state, content, rng, intent, spell, mechanic, declared.id, at));
    } else if (mechanic.kind === 'buff') {
      const outcome = planBuffMechanic(state, intent, content, mechanic, spell, declared.id, at);
      events.push(...outcome.events);
      conditionsApplied.push(...outcome.conditionsApplied);
    } else if (mechanic.kind === 'remove-condition') {
      events.push(...planRemoveConditionMechanic(state, intent, mechanic, declared.id, at));
    } else if (mechanic.kind === 'hp-pool-knockout') {
      events.push(
        ...planHPPoolKnockoutMechanic(state, rng, intent, spell, mechanic, declared.id, at),
      );
    } else if (mechanic.kind === 'aura-damage') {
      // Cast-time no-op: the aura's damage is applied later via
      // planTickAura, called by the consumer each time the per-turn
      // tick condition fires (creature enters / starts a turn in range).
      // The aura's parameters are read from the spell content at tick
      // time; concentration tracking is enough to know which aura is
      // active.
    } else if (mechanic.kind === 'movement-damage') {
      // Cast-time no-op: damage is applied later via
      // planTickMovementDamage, called by the consumer with the feet
      // moved through the zone. Same shape as aura-damage but invoked
      // on movement instead of per-turn ticks.
    } else if (mechanic.kind === 'recurring') {
      // Cast-time no-op: the per-turn effect fires later via
      // planTickRecurring, called by the consumer at the start of
      // each target's turn (or whichever cadence the spell's RAW
      // specifies). Concentration tracking gates whether the
      // recurring effect is still active.
    } else if (mechanic.kind === 'summon') {
      events.push(
        ...planSummonMechanic(intent, spell, mechanic, declared.id, at, concentrationEffectId),
      );
    } else if (mechanic.kind === 'temp-hp') {
      events.push(...planTempHPMechanic(rng, intent, spell, mechanic, declared.id, at));
    } else if (mechanic.kind === 'trap') {
      events.push(
        ...planTrapMechanic(state, content, intent, spell, mechanic, declared.id, at, castingClassId, castingAbility),
      );
    } else if (mechanic.kind === 'hp-threshold') {
      events.push(
        ...planHpThresholdMechanic(state, content, rng, intent, spell, mechanic, declared.id, at),
      );
    } else if (mechanic.kind === 'weaponAttack') {
      events.push(
        ...planWeaponAttackMechanic(state, content, rng, intent, spell, castingAbility, declared.id, at),
      );
    } else if (mechanic.kind === 'weapon-buff') {
      events.push(
        ...planWeaponBuffMechanic(state, content, intent, spell, mechanic, castingAbility, declared.id, at),
      );
    } else if (mechanic.kind === 'zone') {
      // Slice 495: handled inline at the ConcentrationStarted construction
      // below. No events emitted by the dispatch case itself — the zone
      // metadata is stamped on the ConcentrationStarted event so the
      // reducer can persist it on the EffectInstance in one shot.
    } else if (mechanic.kind === 'create-item') {
      events.push(...planCreateItemMechanic(content, intent, spell, mechanic, declared.id));
    } else if (mechanic.kind === 'stabilize') {
      events.push(...planStabilizeMechanic(state, intent, spell, declared.id, at));
    } else {
      events.push(...planHealMechanic(state, content, rng, intent, spell, mechanic, declared.id, at));
    }
  }

  // Slice 495 + 665: compute the optional `zone` payload for spells
  // whose mechanicalEffects include a `zone` entry. Validates at plan
  // time so misuse (zone declared without targeting / without
  // targetPosition) surfaces before any event commits. The same
  // payload feeds both the concentration path (ConcentrationStarted,
  // slice 495) and the non-concentration path (SpellEffectStarted,
  // slice 665).
  const hasZoneMechanic = spell.mechanicalEffects.some((m) => m.kind === 'zone');
  let zoneField: { shape: 'sphere' | 'cube' | 'cylinder' | 'line' | 'cone'; size: number; center: { x: number; y: number } } | undefined;
  if (hasZoneMechanic) {
    if (spell.targeting === undefined) {
      throw new Error(`Spell ${spell.id} has a zone mechanic but no targeting (shape/size) declared`);
    }
    if (intent.targetPosition === undefined) {
      throw new Error(`Spell ${spell.id} has a zone mechanic and requires intent.targetPosition`);
    }
    // A zone is positioned at a point; an Emanation moves with its creature
    // and so is never a stationary zone (and ZoneShapeSchema excludes it).
    const zoneShape = spell.targeting.shape;
    if (zoneShape === 'emanation') {
      throw new Error(`Spell ${spell.id} has a zone mechanic but an emanation shape, which can't be a positioned zone`);
    }
    zoneField = {
      shape: zoneShape,
      size: spell.targeting.size,
      center: { x: intent.targetPosition.x, y: intent.targetPosition.y },
    };
  }

  if (spell.concentration === true) {
    if (character.concentrationEffectId !== undefined) {
      const priorBroken: ConcentrationBrokenEvent = {
        id: newEventId() as ULID,
        at,
        type: 'ConcentrationBroken',
        effectInstanceId: character.concentrationEffectId,
        casterId: intent.characterId as ULID,
        reason: 'newConcentrationSpell',
        causedByEventId: declared.id,
      };
      events.push(priorBroken);
    }
    const durationMinutes = parseSpellDurationMinutes(spell.duration);
    const started: ConcentrationStartedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'ConcentrationStarted',
      effectInstanceId: concentrationEffectId as ULID,
      casterId: intent.characterId as ULID,
      spellId: intent.spellId,
      targetIds: [...intent.targetIds] as ULID[],
      conditionsApplied,
      ...(durationMinutes !== undefined ? { durationMinutes } : {}),
      slotLevel: intent.slotLevel,
      causedByEventId: declared.id,
      ...(zoneField !== undefined ? { zone: zoneField } : {}),
    };
    events.push(started);
  } else if (hasZoneMechanic) {
    // Slice 665: non-concentration zone-bearing spell (Zone of
    // Truth, Tiny Hut). Allocate an EffectInstance via
    // SpellEffectStarted so the zone persists in state with its
    // listed wall-clock duration (cleaned up by
    // planExpireSpellDurations + the same ConcentrationBroken
    // cleanup event). The caster's concentration slot is NOT
    // claimed.
    const durationMinutes = parseSpellDurationMinutes(spell.duration);
    const spellEffectStarted: SpellEffectStartedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'SpellEffectStarted',
      effectInstanceId: newEffectInstanceId() as ULID,
      casterId: intent.characterId as ULID,
      spellId: intent.spellId,
      targetIds: [...intent.targetIds] as ULID[],
      conditionsApplied,
      ...(durationMinutes !== undefined ? { durationMinutes } : {}),
      slotLevel: intent.slotLevel,
      causedByEventId: declared.id,
      ...(zoneField !== undefined ? { zone: zoneField } : {}),
    };
    events.push(spellEffectStarted);
  }

  return events;
};
