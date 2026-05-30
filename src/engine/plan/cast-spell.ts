import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type {
  FreeCastUsedEvent,
  PactSlotConsumedEvent,
  SpellCastDeclaredEvent,
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
import { buildEffectStack } from '../../derive/effect-stack.js';
import { isImmuneToCondition } from '../../derive/condition-immunity.js';
import { isHealingBlocked } from '../../derive/healing-block.js';
import { planConcentrationBreakOnDrop } from './concentration.js';
import { assertActorCanAct } from './_actor-state.js';
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
  const cantripSteps = spell.level === CANTRIP_LEVEL ? cantripExtraDice(computeTotalLevel(character)) : 0;
  const damageType = resolveAttackDamageType(mechanic, intent, spell.id);
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
  ]);
  const damageModifierBonus = casterEffects.modifierSum('damage', damageFacts);
  const events: Event[] = [];
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
    const d20 = rollDie(D20_SIDES, rng);
    const total = d20 + attackBonus.total;
    const isCrit = d20 === NAT_20;
    const isMiss = d20 === NAT_1;
    const hit = !isMiss && (isCrit || total >= targetAC.total);

    const attackEvent: AttackRolledEvent = {
      id: newEventId() as ULID,
      at,
      type: 'AttackRolled',
      attackerId: intent.characterId,
      targetId,
      weaponInstanceId: intent.spellId as ULID,
      d20: [d20],
      used: 'none',
      attackBonus: attackBonus.total,
      total,
      targetAC: targetAC.total,
      hit,
      critical: isCrit,
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

    // Evoker L3 Potent Cantrip: a damaging cantrip that misses the attack
    // still deals half damage (no crit, no additional effect). A plain
    // miss skips the target entirely.
    const potentHalfOnMiss =
      !hit && spell.level === CANTRIP_LEVEL && casterEffects.hasPotentCantrip();
    if (!hit && !potentHalfOnMiss) continue;

    const { rolls: baseRolls, modifier } = rollDamage(mechanic.damageDice, bonusDice, rng, isCrit);
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
    events.push(damageApplied);
    events.push(...intercept.extraEvents);
    events.push(
      ...planConcentrationBreakOnDrop(target, intercept.components, damageApplied.id, at),
    );
  }
  return events;
};

interface SaveMechanicOutcome {
  readonly events: Event[];
  readonly conditionsApplied: AppliedConditionRef[];
}

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
    // Slice 500: type-gated save (Animal Friendship targets Beasts only).
    // A target whose creature type doesn't match is skipped — no save,
    // no condition.
    if (
      mechanic.targetCreatureType !== undefined &&
      getCreatureType(target, content) !== mechanic.targetCreatureType
    ) {
      continue;
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
        evasionApplies
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
        events.push(damageApplied);
        events.push(...intercept.extraEvents);
        events.push(
          ...planConcentrationBreakOnDrop(target, intercept.components, damageApplied.id, at),
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
        const cond: ConditionAppliedEvent = {
          id: newEventId() as ULID,
          at,
          type: 'ConditionApplied',
          targetId,
          conditionId: conditionOnFail,
          appliedConditionId,
          sourceCharacterId: intent.characterId as ULID,
          causedByEventId: saveEvent.id,
          // Slice 500: Animal Friendship's "ends if damaged" arm.
          ...(mechanic.conditionEndsOnDamage === true ? { endsOnDamage: true } : {}),
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
    events.push(damageApplied);
    events.push(...intercept.extraEvents);
    events.push(...planConcentrationBreakOnDrop(target, intercept.components, damageApplied.id, at));
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
  intent: CastSpellIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  assertActorCanAct(character, 'cast a spell');
  const spell = content.spells.get(intent.spellId);
  if (!spell) throw new Error(`Unknown spell ${intent.spellId}`);
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
  // Computed before the slot-availability gate so the validation errors
  // surface even when the caster has no slots of the requested level.
  const useFreeCast = intent.useFreeCast === true;
  if (useFreeCast) {
    const effects = buildEffectStack({
      character,
      content,
      itemInstances: state.itemInstances,
      pendingChoices: state.pendingChoices,
    });
    const freeCastGrant = effects
      .grantedSpells()
      .find((g) => g.spellId === intent.spellId && g.preparation === 'oncePerLongRest');
    if (freeCastGrant === undefined) {
      throw new Error(
        `${character.name} cannot use a free cast for ${spell.name}: no oncePerLongRest grant for this spell`,
      );
    }
    if (character.usedFreeCastSpellIds.includes(intent.spellId)) {
      throw new Error(
        `${character.name} has already used the free cast for ${spell.name} since the last long rest`,
      );
    }
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
    const ct = spell.castingTime.trim().toLowerCase();
    if (ct === 'action') return 'action';
    if (ct === 'bonus action') return 'bonusAction';
    if (ct === 'reaction') return 'reaction';
    return 'long';
  })();
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
  }

  const at = intent.at ?? nowIso();
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
  if (useFreeCast) {
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
        ...planAttackMechanic(state, content, rng, intent, spell, mechanic, declared.id, at, castingClassId, castingAbility),
      );
    } else if (mechanic.kind === 'save') {
      const outcome = planSaveMechanic(
        state, content, rng, intent, spell, mechanic, declared.id, at, castingClassId, castingAbility,
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
    } else {
      events.push(...planHealMechanic(state, content, rng, intent, spell, mechanic, declared.id, at));
    }
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
    // Slice 495: when the spell's mechanicalEffects include a `zone`
    // entry, read the spell's targeting shape/size + intent.targetPosition
    // and stamp them on the event so the reducer persists the zone on
    // the EffectInstance. Validates at plan time so misuse surfaces
    // before any event commits.
    const hasZoneMechanic = spell.mechanicalEffects.some((m) => m.kind === 'zone');
    let zoneField: { shape: 'sphere' | 'cube' | 'cylinder' | 'line' | 'cone'; size: number; center: { x: number; y: number } } | undefined;
    if (hasZoneMechanic) {
      if (spell.targeting === undefined) {
        throw new Error(`Spell ${spell.id} has a zone mechanic but no targeting (shape/size) declared`);
      }
      if (intent.targetPosition === undefined) {
        throw new Error(`Spell ${spell.id} has a zone mechanic and requires intent.targetPosition`);
      }
      zoneField = {
        shape: spell.targeting.shape,
        size: spell.targeting.size,
        center: { x: intent.targetPosition.x, y: intent.targetPosition.y },
      };
    }
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
  }

  return events;
};
