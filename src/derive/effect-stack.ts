import type { Character } from '../schemas/runtime/character.js';
import type { ItemInstance } from '../schemas/runtime/item-instance.js';
import type { PendingChoice } from '../schemas/runtime/pending-choice.js';
import type { Effect } from '../schemas/effects.js';
import type { Background } from '../schemas/content/background.js';
import type { ResolvedContent } from '../content/pack.js';
import { EffectAccumulator, applyEffectToBuilder } from '../effects/builder.js';
import { resolveEnchantment } from './enchantment.js';
import type { FormulaContext } from '../effects/formula.js';
import { computeTotalLevel } from '../schemas/runtime/character.js';
import { proficiencyBonus } from './ability.js';

const collectResolvedChoiceEffects = (
  character: Character,
  pendingChoices: Readonly<Record<string, PendingChoice>>,
): Effect[] => {
  const effects: Effect[] = [];
  for (const choiceId of character.pendingChoiceIds) {
    const choice = pendingChoices[choiceId];
    if (!choice?.resolution) continue;
    for (const optionId of choice.resolution.selectedOptionIds) {
      const option = choice.options.find((o) => o.id === optionId);
      if (option) effects.push(...option.effects);
    }
  }
  return effects;
};

// When the same feature id appears at multiple class levels (e.g. Sneak
// Attack at 1, 3, 5...), keep only the highest-level instance. Class
// features that scale with level (Sneak Attack dice, Channel Divinity
// uses, ki points, etc.) can then be expressed as one feature per scale
// step in the content pack, with the engine selecting the right one.
const dedupeFeaturesByLatestLevel = <T extends { id: string }>(
  perLevelFeatures: ReadonlyArray<ReadonlyArray<T>>,
): T[] => {
  const latest = new Map<string, T>();
  for (const features of perLevelFeatures) {
    for (const feature of features) latest.set(feature.id, feature);
  }
  return [...latest.values()];
};

const collectClassEffects = (character: Character, content: ResolvedContent): Effect[] => {
  const effects: Effect[] = [];
  for (const enrollment of character.classes) {
    const cls = content.classes.get(enrollment.classId);
    if (!cls) continue;
    const perLevel: ReadonlyArray<ReadonlyArray<{ id: string; effects: Effect[] }>>[] = [];
    const classLevels: { id: string; effects: Effect[] }[][] = [];
    for (let level = 1; level <= enrollment.level; level++) {
      const entry = cls.levelTable[String(level)];
      classLevels.push(entry ? [...entry.features] : []);
    }
    void perLevel;
    for (const feature of dedupeFeaturesByLatestLevel(classLevels)) {
      effects.push(...feature.effects);
    }
    if (enrollment.subclassId !== undefined) {
      const subclass = content.subclasses.get(enrollment.subclassId);
      if (subclass) {
        const subclassLevels: { id: string; effects: Effect[] }[][] = [];
        for (let level = 1; level <= enrollment.level; level++) {
          subclassLevels.push([...(subclass.levelGrants[String(level)] ?? [])]);
        }
        for (const feature of dedupeFeaturesByLatestLevel(subclassLevels)) {
          effects.push(...feature.effects);
        }
      }
    }
  }
  return effects;
};

const collectFeatEffects = (character: Character, content: ResolvedContent): Effect[] => {
  const effects: Effect[] = [];
  for (const featId of character.featsTaken) {
    const feat = content.feats.get(featId);
    if (feat) effects.push(...feat.effects);
  }
  return effects;
};

// Slice 132: magic-item passive effects project to the wearer's
// effect stack. Two paths:
//   - Attuned items (in `character.equipped.attuned`) always project,
//     same as before.
//   - Items in `character.inventory` that are magic and do NOT
//     require attunement also project (RAW: a Bag of Holding works
//     by being carried; a Cloak of Protection only works when
//     attuned). Items requiring attunement that are in inventory
//     but not attuned project nothing.
// Dedupe by instance id so an attuned item that's also in inventory
// doesn't get its effects folded twice.
const collectItemEffects = (
  character: Character,
  itemInstances: Readonly<Record<string, ItemInstance>>,
  content: ResolvedContent,
): Effect[] => {
  const effects: Effect[] = [];
  const seen = new Set<string>();
  const fold = (instanceId: string, requireNonAttunement: boolean): void => {
    if (seen.has(instanceId)) return;
    const inst = itemInstances[instanceId];
    if (!inst) return;
    const def = content.items.get(inst.definitionId);
    if (def === undefined) return;
    let pushed = false;
    // Slice 132: magic items. Slice 315/316: magic armor / weapon
    // (itemKind 'armor' / 'weapon' with optional `effects`) project
    // under the same rule, so a magic shield's GrantMagicResistance, a
    // magic armor's resistance, or a magic weapon's STR floor reaches
    // the effect stack. Mundane armor/weapons have no `effects` (no-op).
    if (def.itemKind === 'magic' || def.itemKind === 'armor' || def.itemKind === 'weapon') {
      const baseEffects = def.itemKind === 'magic' ? def.effects : (def.effects ?? []);
      if (baseEffects.length > 0 && !(requireNonAttunement && def.requiresAttunement)) {
        effects.push(...baseEffects);
        pushed = true;
      }
    }
    // Slice 317: enchantment-overlay effects (Frost Brand's fire
    // resistance on an enchanted base weapon), gated on the
    // enchantment's own attunement requirement.
    const ench = resolveEnchantment(inst, content);
    if (ench !== undefined && ench.effects.length > 0 && !(requireNonAttunement && ench.requiresAttunement)) {
      effects.push(...ench.effects);
      pushed = true;
    }
    if (pushed) seen.add(instanceId);
  };
  for (const instanceId of character.equipped.attuned) {
    fold(instanceId, false);
  }
  // Slice 315/316: worn magic armor/shield and held magic weapons
  // project even if not separately listed in inventory. Requires-
  // attunement items still only project via the attuned loop above
  // (requireNonAttunement gate here).
  for (const instanceId of [
    character.equipped.armor,
    character.equipped.shield,
    character.equipped.mainHand,
    character.equipped.offHand,
  ]) {
    if (instanceId !== undefined) fold(instanceId, true);
  }
  for (const instanceId of character.inventory) {
    fold(instanceId, true);
  }
  return effects;
};

// Slice 129: monsters carry their RAW data on the statblock
// (damageResistances / damageImmunities / damageVulnerabilities /
// conditionImmunities arrays plus an EffectSchema[] `traits` array)
// rather than expressing every line as an effect. Walk those four
// arrays into the equivalent `Grant*` effects so the accumulator
// sees them the same way it sees a PC's species or condition
// effects. The `traits[]` array (already EffectSchema[]) folds
// verbatim. Without this fold, content data on every creature is
// inert at runtime: Skeleton's bludgeoning vulnerability and Young
// Red Dragon's fire immunity have been ignored since alpha.5.
const collectMonsterEffects = (character: Character, content: ResolvedContent): Effect[] => {
  if (character.statblockId === undefined) return [];
  const statblock = content.monsters.get(character.statblockId);
  if (statblock === undefined) return [];
  const effects: Effect[] = [];
  for (const damageType of statblock.damageResistances) {
    effects.push({ kind: 'GrantResistance', damageType });
  }
  for (const damageType of statblock.damageImmunities) {
    effects.push({ kind: 'GrantImmunity', damageType });
  }
  for (const damageType of statblock.damageVulnerabilities) {
    effects.push({ kind: 'GrantVulnerability', damageType });
  }
  for (const conditionId of statblock.conditionImmunities) {
    effects.push({ kind: 'GrantConditionImmunity', conditionId });
  }
  effects.push(...statblock.traits);
  return effects;
};

const collectConditionEffects = (character: Character, content: ResolvedContent): Effect[] => {
  const effects: Effect[] = [];
  for (const applied of character.appliedConditions) {
    const condition = content.conditions.get(applied.conditionId);
    if (condition) effects.push(...condition.effects);
  }
  return effects;
};

export interface BuildEffectStackInput {
  readonly character: Character;
  readonly content: ResolvedContent;
  readonly itemInstances: Readonly<Record<string, ItemInstance>>;
  readonly pendingChoices?: Readonly<Record<string, PendingChoice>>;
  // Optional: when provided, condition effects with an
  // `AppliedCondition.sourceCharacterId` link resolve source-relative
  // formulas (e.g., `sourceAbilityMod` for Aura of Protection's
  // +CHA-mod-to-saves) by looking up the source's stats here.
  // Callers that don't care about source-relative formulas can omit
  // this; those formulas evaluate to 0 in their absence.
  readonly characters?: Readonly<Record<string, Character>>;
}

export const buildFormulaContext = (character: Character): FormulaContext => {
  const totalLevel = computeTotalLevel(character);
  const classLevels = new Map<string, number>();
  for (const enrollment of character.classes) {
    classLevels.set(enrollment.classId, enrollment.level);
  }
  return {
    abilityScores: character.abilityScores,
    proficiencyBonus: proficiencyBonus(totalLevel),
    classLevels,
    totalLevel,
  };
};

// Backgrounds carry their granted skill + tool proficiencies as
// structured arrays (RAW: a 2024 background grants two fixed skills and
// one tool proficiency), not as GrantProficiency effects in `traits`.
// Synthesize the effects so those proficiencies reach the effect stack
// (and thus ability checks, saving throws, and the character sheet) the
// same way feature- and feat-granted proficiencies do. Without this the
// soldier's Athletics / Intimidation proficiency was silently dropped
// from every ability check.
const backgroundProficiencyEffects = (background: Background): Effect[] => [
  ...background.skillProficiencies.map(
    (id): Effect => ({ kind: 'GrantProficiency', target: 'skill', id, level: 'proficient' }),
  ),
  ...background.toolProficiencies.map(
    (id): Effect => ({ kind: 'GrantProficiency', target: 'tool', id, level: 'proficient' }),
  ),
];

export const collectEffectsFromCharacter = (input: BuildEffectStackInput): Effect[] => {
  const { character, content, itemInstances, pendingChoices } = input;
  const effects: Effect[] = [];
  const species = content.species.get(character.speciesId);
  if (species) effects.push(...species.traits);
  const background = content.backgrounds.get(character.backgroundId);
  if (background) effects.push(...background.traits, ...backgroundProficiencyEffects(background));
  effects.push(...collectClassEffects(character, content));
  effects.push(...collectFeatEffects(character, content));
  effects.push(...collectItemEffects(character, itemInstances, content));
  effects.push(...collectMonsterEffects(character, content));
  effects.push(...collectConditionEffects(character, content));
  if (pendingChoices) {
    effects.push(...collectResolvedChoiceEffects(character, pendingChoices));
  }
  return effects;
};

export const buildEffectStack = (input: BuildEffectStackInput): EffectAccumulator => {
  const { character, content, itemInstances, pendingChoices, characters } = input;
  const acc = new EffectAccumulator();
  const targetFormulaContext = buildFormulaContext(character);

  const species = content.species.get(character.speciesId);
  if (species) {
    for (const effect of species.traits) {
      applyEffectToBuilder(effect, acc, {
        source: `species:${species.id}`,
        formulaContext: targetFormulaContext,
      });
    }
  }

  const background = content.backgrounds.get(character.backgroundId);
  if (background) {
    for (const effect of [...background.traits, ...backgroundProficiencyEffects(background)]) {
      applyEffectToBuilder(effect, acc, {
        source: `background:${background.id}`,
        formulaContext: targetFormulaContext,
      });
    }
  }

  for (const effect of collectClassEffects(character, content)) {
    applyEffectToBuilder(effect, acc, { source: 'class', formulaContext: targetFormulaContext });
  }
  for (const effect of collectFeatEffects(character, content)) {
    applyEffectToBuilder(effect, acc, { source: 'feat', formulaContext: targetFormulaContext });
  }
  for (const effect of collectItemEffects(character, itemInstances, content)) {
    applyEffectToBuilder(effect, acc, { source: 'item', formulaContext: targetFormulaContext });
  }
  for (const effect of collectMonsterEffects(character, content)) {
    applyEffectToBuilder(effect, acc, { source: 'monster', formulaContext: targetFormulaContext });
  }

  // Conditions get per-applied-condition handling so that formula
  // evaluation can read the source character's stats (Aura of
  // Protection's +CHA-mod-of-source, etc.) when AppliedCondition
  // carries a `sourceCharacterId` link.
  for (const applied of character.appliedConditions) {
    const condition = content.conditions.get(applied.conditionId);
    if (condition === undefined) continue;
    const sourceCharacter =
      applied.sourceCharacterId !== undefined && characters !== undefined
        ? characters[applied.sourceCharacterId]
        : undefined;
    const conditionFormulaContext: FormulaContext = sourceCharacter !== undefined
      ? { ...targetFormulaContext, source: { abilityScores: sourceCharacter.abilityScores } }
      : targetFormulaContext;
    for (const effect of condition.effects) {
      applyEffectToBuilder(effect, acc, {
        source: 'condition',
        formulaContext: conditionFormulaContext,
        ...(applied.sourceCharacterId !== undefined
          ? { sourceCharacterId: applied.sourceCharacterId }
          : {}),
      });
    }
  }

  if (pendingChoices) {
    for (const effect of collectResolvedChoiceEffects(character, pendingChoices)) {
      applyEffectToBuilder(effect, acc, { source: 'choice', formulaContext: targetFormulaContext });
    }
  }

  return acc;
};
