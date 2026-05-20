import type { Character } from '../schemas/runtime/character.js';
import type { ItemInstance } from '../schemas/runtime/item-instance.js';
import type { ResolvedContent } from '../content/pack.js';
import type { AbilityScore } from '../schemas/primitives.js';
import { abilityModifier, effectiveAbilityScore, proficiencyBonus } from './ability.js';
import { buildEffectStack } from './effect-stack.js';
import type { BonusDieContribution } from '../effects/builder.js';
import { computeTotalLevel } from '../schemas/runtime/character.js';
import { EXHAUSTION_SAVE_PENALTY_PER_LEVEL } from '../internal/constants.js';
import { findActorBlockingCondition, getEffectiveSpeed } from '../engine/plan/_actor-state.js';

export interface SaveBreakdownEntry {
  readonly source: string;
  readonly value: number;
}

export interface SaveResult {
  readonly total: number;
  readonly breakdown: ReadonlyArray<SaveBreakdownEntry>;
  readonly hasAdvantage: boolean;
  readonly hasDisadvantage: boolean;
  // Slice 331: unrolled per-roll bonus dice (AddBonusDie on saves). The
  // pure derivation surfaces them; the planner rolls them.
  readonly bonusDice: ReadonlyArray<BonusDieContribution>;
}

export interface ComputeSaveInput {
  readonly character: Character;
  readonly itemInstances: Readonly<Record<string, ItemInstance>>;
  readonly content: ResolvedContent;
  readonly ability: AbilityScore;
  readonly pendingChoices?: Readonly<Record<string, import('../schemas/runtime/pending-choice.js').PendingChoice>>;
  // Optional: when provided, source-relative formulas on the
  // target's applied conditions (Aura of Protection's +CHA-mod-of-
  // source, etc.) resolve via the linked source character. Omitting
  // it makes those formulas evaluate to 0.
  readonly characters?: Readonly<Record<string, Character>>;
  // Slice 131: tells the save resolver whether the saving throw is
  // against a spell or magical effect. When true and the character
  // carries `GrantMagicResistance`, the resolver contributes advantage
  // to the roll. Default (undefined / false) is non-magical (e.g.
  // monster Multiattack save, Stunning Strike, etc.). Callers from
  // magical sources (cast-spell, traps spell-armed, recurring saves
  // on spell-applied conditions, etc.) pass `true`.
  readonly sourceIsMagical?: boolean;
  // Slice 291: the condition id this save's outcome would prevent or
  // end, when known. Cast-spell save mechanics with `conditionOnFail`
  // pass the conditionId here (the save's failure applies that
  // condition); recurring-save planners pass the bearer condition id
  // when the save's success would end the condition (per
  // `recurringSave.onSuccess: 'removeCondition'`). Surfaces as the
  // `event.savePreventsCondition` predicate fact so per-condition
  // save-advantage buffs can gate ("advantage on saves to avoid or
  // end the Poisoned condition," per Antitoxin RAW). Generic saves
  // (Stunning Strike CON, multiattack save, etc.) leave this
  // undefined and the gate evaluates false.
  readonly savePreventsCondition?: string;
}

const isSaveProficient = (character: Character, ability: AbilityScore, content: ResolvedContent): boolean => {
  for (const enrollment of character.classes) {
    const cls = content.classes.get(enrollment.classId);
    if (cls?.savingThrowProficiencies.includes(ability)) return true;
  }
  return false;
};

export const computeSavingThrow = (input: ComputeSaveInput): SaveResult => {
  const breakdown: SaveBreakdownEntry[] = [];
  const effects = buildEffectStack(input);

  // Slice 130: when the character is a creature with a statblock that
  // lists this ability's save bonus, RAW says the listed number is the
  // baked total (already includes ability mod and proficiency per the
  // 2024 MM presentation). Use it as a single breakdown entry and
  // skip the ability-mod + class-proficiency reconstruction. Effects,
  // exhaustion, and advantage still layer on top.
  const statblock = input.character.statblockId !== undefined
    ? input.content.monsters.get(input.character.statblockId)
    : undefined;
  const monsterSaveBonus = statblock?.savingThrows?.[input.ability];

  if (monsterSaveBonus !== undefined) {
    breakdown.push({ source: `monster:${statblock!.id}:save`, value: monsterSaveBonus });
  } else {
    const baseScore = input.character.abilityScores[input.ability];
    const floor = effects.effectiveAbilityScoreFloor(input.ability)?.value;
    const increase = effects.effectiveAbilityScoreIncrease(input.ability);
    const abilityMod = abilityModifier(effectiveAbilityScore(baseScore, floor, increase));
    breakdown.push({ source: `${input.ability}-mod`, value: abilityMod });

    const totalLevel = computeTotalLevel(input.character);
    // Slice 203: a character is save-proficient if the class baseline
    // covers it OR an effect-stack contribution (e.g. Monk L14
    // Disciplined Survivor, Rogue L15 Slippery Mind, Ranger L9
    // Expertise, racial / feat grants) flags it. Prior to slice 203
    // the effect-stack path was silently dropped here, so Slippery
    // Mind's WIS+CHA grant didn't actually take effect.
    const effectProfLevel = effects.proficiencyLevel('save', input.ability);
    const proficientViaEffect = effectProfLevel === 'proficient' || effectProfLevel === 'expertise';
    if (isSaveProficient(input.character, input.ability, input.content) || proficientViaEffect) {
      breakdown.push({ source: 'proficiency', value: proficiencyBonus(totalLevel) });
    }
  }

  const target = { kind: 'save', ability: input.ability } as const;
  const modifierBonus = effects.modifierSum(target);
  if (modifierBonus !== 0) {
    breakdown.push({ source: 'modifier', value: modifierBonus });
  }

  if (input.character.exhaustion > 0) {
    const penalty = EXHAUSTION_SAVE_PENALTY_PER_LEVEL * input.character.exhaustion;
    breakdown.push({ source: 'exhaustion', value: penalty });
  }

  // Slice 258: thread `event.isSpellSave` to advantageFor so predicated
  // SetAdvantage entries (Mantle of Spell Resistance's "advantage on
  // saves vs spells") can gate on it. The fact reflects `sourceIsMagical`
  // (slice 131): a spell-or-magical-source save. Strict-RAW Mantle is
  // "vs spells" only, but the engine doesn't distinguish spell from
  // non-spell magical effects today, so this conservatively extends
  // advantage to all magical saves (more saves benefit, never fewer;
  // matches how Magic Resistance already operates).
  //
  // Slice 272: bearer-state facts for the Dodge self-disable
  // ("you lose these benefits if you have the Incapacitated
  // condition or if your Speed is 0"). The dodged condition's
  // DEX-save advantage entry gates on these facts being false; same
  // facts populated in the attack planner for the
  // ImposeDisadvantageOnAttackers arm.
  const bearerHasIncapacitated = findActorBlockingCondition(input.character) !== undefined;
  const bearerSpeedZero = getEffectiveSpeed({
    character: input.character,
    content: input.content,
    itemInstances: input.itemInstances,
    pendingChoices: input.pendingChoices,
  }) === 0;
  const facts = new Map<string, unknown>([
    ['event.isSpellSave', input.sourceIsMagical === true],
    ['bearer.hasIncapacitated', bearerHasIncapacitated],
    ['bearer.speedZero', bearerSpeedZero],
    // Slice 291: per-condition save-advantage gate (Antitoxin).
    ['event.savePreventsCondition', input.savePreventsCondition],
  ]);
  const adv = effects.advantageFor(target, facts);
  // Slice 131: Magic Resistance contributes advantage to the save
  // when the source is magical. RAW advantage / disadvantage
  // cancellation still applies (a creature with both Magic Resistance
  // and a separate disadvantage source nets neither).
  const magicResistanceAdvantage =
    input.sourceIsMagical === true && effects.hasMagicResistance();
  const effectiveAdvantage = adv.advantage || magicResistanceAdvantage;
  const total = breakdown.reduce((acc, e) => acc + e.value, 0);
  return {
    total,
    breakdown,
    hasAdvantage: effectiveAdvantage && !adv.disadvantage,
    hasDisadvantage: adv.disadvantage && !effectiveAdvantage,
    // Slice 331: the pending per-roll bonus dice for this save (Bless
    // +1d4 / Bane -1d4 via AddBonusDie). Returned unrolled (this is a
    // pure derivation); the planner that rolls the save rolls these too
    // and folds them into the SaveRolled total + breakdown.
    bonusDice: effects.bonusDiceFor(target, facts),
  };
};
