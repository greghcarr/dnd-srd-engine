import type { Character, HP } from '../schemas/runtime/character.js';
import type { ItemInstance } from '../schemas/runtime/item-instance.js';
import type { PendingChoice } from '../schemas/runtime/pending-choice.js';
import type { ResolvedContent } from '../content/pack.js';
import type { AbilityScore } from '../schemas/primitives.js';
import { abilityModifier, effectiveAbilityScore, proficiencyBonus } from './ability.js';
import { computeTotalLevel } from '../schemas/runtime/character.js';
import { computeAC, type ACResult } from './ac.js';
import { computeSavingThrow, type SaveResult } from './save.js';
import { computeSpellSlots, type SpellSlotsResult } from './spell-slots.js';
import { buildEffectStack } from './effect-stack.js';
import { computeKnownLanguages } from './languages.js';

const ABILITIES: ReadonlyArray<AbilityScore> = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

export interface DerivedCharacter {
  readonly id: string;
  readonly name: string;
  readonly totalLevel: number;
  readonly proficiencyBonus: number;
  // Effective ability scores (base + floors + IncreaseAbilityScore from
  // the active effect stack: ASI, Ioun Stones, Belt of Dwarvenkind,
  // OverrideAbilityScore, etc.). NOT the raw `character.abilityScores`.
  readonly abilityScores: Readonly<Record<AbilityScore, number>>;
  // Modifiers derived from the EFFECTIVE scores above (so a +2 ASI / item
  // shows here, matching the saves / checks / attacks that already use
  // the effective score).
  readonly abilityModifiers: Readonly<Record<AbilityScore, number>>;
  readonly hp: HP;
  // Sum of `AddModifier { target: 'hpMax' }` effects from the character's
  // active effect stack (Aid, Aspect of the Beast, etc.). The stored
  // `hp.max` does not include this; consumers display
  // `effectiveHpMax = hp.max + hpMaxBonus`. Reducer-side rules (massive
  // damage threshold, heal clamping) still use the stored `hp.max`.
  readonly hpMaxBonus: number;
  readonly effectiveHpMax: number;
  readonly ac: ACResult;
  readonly savingThrows: Readonly<Record<AbilityScore, SaveResult>>;
  readonly spellSlots: SpellSlotsResult;
  readonly hasPendingChoices: boolean;
  readonly pendingChoiceIds: ReadonlyArray<string>;
  readonly knownLanguages: ReadonlyArray<string>;
}

export interface ComputeDerivedCharacterInput {
  readonly character: Character;
  readonly itemInstances: Readonly<Record<string, ItemInstance>>;
  readonly content: ResolvedContent;
  readonly pendingChoices?: Readonly<Record<string, PendingChoice>>;
  // Optional: enables source-relative formulas across every derive
  // surface the view aggregates (saves, ability checks, AC, attack,
  // spell-DC, action-economy, damage-mitigation). Callers that
  // compose the view from `CampaignState` should pass
  // `state.characters` so Aura of Protection (and any future
  // source-relative content) resolves correctly.
  readonly characters?: Readonly<Record<string, Character>>;
}

export const computeDerivedCharacter = (
  input: ComputeDerivedCharacterInput,
): DerivedCharacter => {
  const totalLevel = computeTotalLevel(input.character);
  // Effective scores (base + floor + IncreaseAbilityScore) so the
  // headline scores/modifiers reflect ASI / items / overrides, matching
  // the per-roll derivations (saves / checks / attacks) that already use
  // effectiveAbilityScore. Pre-this-fix these were base-only, so an ASI
  // or Ioun Stone did not show on the derived character or sheet.
  const effects = buildEffectStack(input);
  const abilityScores = Object.fromEntries(
    ABILITIES.map((a) => [
      a,
      effectiveAbilityScore(
        input.character.abilityScores[a],
        effects.effectiveAbilityScoreFloor(a)?.value,
        effects.effectiveAbilityScoreIncrease(a),
      ),
    ]),
  ) as Record<AbilityScore, number>;
  const abilityMods = Object.fromEntries(
    ABILITIES.map((a) => [a, abilityModifier(abilityScores[a])]),
  ) as Record<AbilityScore, number>;

  const ac = computeAC(input);
  const savingThrows = Object.fromEntries(
    ABILITIES.map((a) => [a, computeSavingThrow({ ...input, ability: a })]),
  ) as Record<AbilityScore, SaveResult>;
  const hpMaxBonus = effects.modifierSum('hpMax');

  return {
    id: input.character.id,
    name: input.character.name,
    totalLevel,
    proficiencyBonus: proficiencyBonus(totalLevel),
    abilityScores,
    abilityModifiers: abilityMods,
    hp: input.character.hp,
    hpMaxBonus,
    effectiveHpMax: input.character.hp.max + hpMaxBonus,
    ac,
    savingThrows,
    spellSlots: computeSpellSlots(input.character, input.content.classes),
    hasPendingChoices: input.character.pendingChoiceIds.some(
      (id) => input.pendingChoices?.[id]?.resolution === undefined,
    ) || (input.pendingChoices === undefined && input.character.pendingChoiceIds.length > 0),
    pendingChoiceIds: [...input.character.pendingChoiceIds],
    knownLanguages: computeKnownLanguages(input),
  };
};
