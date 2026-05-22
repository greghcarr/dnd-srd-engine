// Slice 412: character-sheet view model (read layer, part 2).
//
// `computeDerivedCharacter` already assembles the top of a sheet (level,
// PB, ability mods, HP, AC, saves, spell slots, languages). This wraps
// it into the consumer-facing `CharacterSheet` and composes the
// computed-stats a sheet conspicuously needs but that aggregate omits:
// all 18 skills (modifier + proficiency + advantage), the three passive
// scores, initiative, the attacks list (one entry per inventory weapon,
// with to-hit + static damage line), and the spellcasting block (per-class
// save DC + attack bonus, and the castable spells grouped by level). Pure
// assembly over existing derivations: it invents no rules, so RAW
// correctness lives in the derivations it calls.
//
// Deferred to follow-up slices (each its own derivation cluster): the
// unarmed strike entry, effective speeds, and the inventory/equipment
// summary.
import type {
  AbilityScore,
  Skill,
  ProficiencyLevel,
  WeaponProperty,
  WeaponMastery,
} from '../schemas/primitives.js';
import { SKILLS, SKILL_ABILITY } from '../schemas/primitives.js';
import type { Weapon } from '../schemas/content/item.js';
import {
  computeDerivedCharacter,
  type DerivedCharacter,
  type ComputeDerivedCharacterInput,
} from '../derive/character-view.js';
import { computeAbilityCheck, computePassiveScore } from '../derive/ability-check.js';
import { computeAttackBonus, computeWeaponDamage, type WeaponDamage } from '../derive/attack.js';
import { computeSpellSaveDC, computeSpellAttackBonus } from '../derive/spell-dc.js';
import { buildEffectStack } from '../derive/effect-stack.js';
import type { EffectAccumulator } from '../effects/index.js';

export interface SkillView {
  readonly skill: Skill;
  readonly ability: AbilityScore;
  readonly proficiency: ProficiencyLevel;
  /** Total skill-check modifier (ability mod + proficiency + effect modifiers). */
  readonly modifier: number;
  readonly hasAdvantage: boolean;
  readonly hasDisadvantage: boolean;
}

export interface PassiveScores {
  readonly perception: number;
  readonly investigation: number;
  readonly insight: number;
}

export interface InitiativeView {
  /** DEX modifier plus any `initiative`-target effect modifiers. */
  readonly modifier: number;
  readonly hasAdvantage: boolean;
  readonly hasDisadvantage: boolean;
}

export interface AttackView {
  readonly weaponInstanceId: string;
  readonly name: string;
  readonly attackKind: 'melee' | 'ranged';
  /** To-hit bonus (computeAttackBonus total). */
  readonly attackBonus: number;
  readonly damage: WeaponDamage;
  /** Present for versatile weapons: the two-handed damage line. */
  readonly versatileDamage?: WeaponDamage;
  readonly properties: ReadonlyArray<WeaponProperty>;
  /** Present for ranged + thrown weapons (feet). */
  readonly range?: { readonly normal: number; readonly long?: number };
  readonly mastery?: WeaponMastery;
}

export interface SpellcastingClassView {
  readonly classId: string;
  readonly className: string;
  readonly ability: AbilityScore;
  readonly saveDC: number;
  readonly attackBonus: number;
}

export interface SpellListEntry {
  readonly spellId: string;
  readonly name: string;
  /** 0 = cantrip. */
  readonly level: number;
  /** In `character.preparedSpells`. */
  readonly prepared: boolean;
  /** Granted by a feature / item with no prepare cost (domain spells, at-will). */
  readonly alwaysPrepared: boolean;
}

export interface SpellLevelGroup {
  readonly level: number;
  readonly spells: ReadonlyArray<SpellListEntry>;
}

export interface SpellcastingView {
  /** One entry per spellcasting class (DC + attack are per-class in 5e). */
  readonly classes: ReadonlyArray<SpellcastingClassView>;
  /** The character's castable spells grouped by level (ascending), each group name-sorted. */
  readonly spellsByLevel: ReadonlyArray<SpellLevelGroup>;
}

export interface CharacterSheet extends DerivedCharacter {
  /** All 18 skills, in canonical `SKILLS` order. */
  readonly skills: ReadonlyArray<SkillView>;
  readonly passiveScores: PassiveScores;
  readonly initiative: InitiativeView;
  /** One entry per weapon in the character's inventory, in inventory order. */
  readonly attacks: ReadonlyArray<AttackView>;
  /** Present only for characters with a spellcasting class or any castable spell. */
  readonly spellcasting?: SpellcastingView;
}

const skillView = (
  input: ComputeDerivedCharacterInput,
  effects: EffectAccumulator,
  skill: Skill,
): SkillView => {
  const ability = SKILL_ABILITY[skill];
  const check = computeAbilityCheck({ ...input, ability, skill });
  return {
    skill,
    ability,
    proficiency: effects.proficiencyLevel('skill', skill),
    modifier: check.total,
    hasAdvantage: check.hasAdvantage,
    hasDisadvantage: check.hasDisadvantage,
  };
};

const attackView = (input: ComputeDerivedCharacterInput, weaponInstanceId: string, weapon: Weapon): AttackView => {
  const attackInput = { ...input, weaponInstanceId };
  const { damage, versatile } = computeWeaponDamage(attackInput);
  return {
    weaponInstanceId,
    name: weapon.name,
    attackKind: weapon.attackKind,
    attackBonus: computeAttackBonus(attackInput).total,
    damage,
    ...(versatile !== undefined ? { versatileDamage: versatile } : {}),
    properties: weapon.properties,
    ...(weapon.rangeNormal !== undefined
      ? { range: { normal: weapon.rangeNormal, ...(weapon.rangeLong !== undefined ? { long: weapon.rangeLong } : {}) } }
      : {}),
    ...(weapon.mastery !== undefined ? { mastery: weapon.mastery } : {}),
  };
};

// One attack entry per weapon in the character's inventory, in inventory
// order. Non-weapon items and dangling instance ids are skipped.
const attackViews = (input: ComputeDerivedCharacterInput): AttackView[] => {
  const attacks: AttackView[] = [];
  for (const instanceId of input.character.inventory) {
    const instance = input.itemInstances[instanceId];
    if (instance === undefined) continue;
    const def = input.content.items.get(instance.definitionId);
    if (def?.itemKind === 'weapon') attacks.push(attackView(input, instanceId, def));
  }
  return attacks;
};

// One view per spellcasting class. A class casts iff its definition
// declares a spellcasting ability (INT / WIS / CHA); save DC and attack
// bonus are per-class because multiclass casters can mix abilities.
const spellcastingClasses = (input: ComputeDerivedCharacterInput): SpellcastingClassView[] => {
  const views: SpellcastingClassView[] = [];
  for (const enrollment of input.character.classes) {
    const cls = input.content.classes.get(enrollment.classId);
    const ability = cls?.spellcasting?.ability;
    if (cls === undefined || (ability !== 'INT' && ability !== 'WIS' && ability !== 'CHA')) continue;
    const dcInput = { ...input, classId: enrollment.classId };
    views.push({
      classId: enrollment.classId,
      className: cls.name,
      ability,
      saveDC: computeSpellSaveDC(dcInput).total,
      attackBonus: computeSpellAttackBonus(dcInput).total,
    });
  }
  return views;
};

// The character's castable spells, grouped by level (ascending), each
// group name-sorted. The union mirrors effectiveSpellList (known +
// prepared + granted) but is inlined here because the sheet needs the
// granted entries' `preparation` field to flag always-prepared / at-will
// spells, which effectiveSpellList collapses to bare ids. Spell ids with
// no matching definition are skipped.
const spellLevelGroups = (input: ComputeDerivedCharacterInput): SpellLevelGroup[] => {
  const granted = buildEffectStack(input).grantedSpells();
  const alwaysPrepared = new Set(
    granted.filter((g) => g.preparation === 'always-prepared' || g.preparation === 'at-will').map((g) => g.spellId),
  );
  const prepared = new Set(input.character.preparedSpells);
  const ids = new Set<string>([
    ...input.character.knownSpells,
    ...input.character.preparedSpells,
    ...granted.map((g) => g.spellId),
  ]);

  const byLevel = new Map<number, SpellListEntry[]>();
  for (const id of ids) {
    const spell = input.content.spells.get(id);
    if (spell === undefined) continue;
    const entry: SpellListEntry = {
      spellId: id,
      name: spell.name,
      level: spell.level,
      prepared: prepared.has(id),
      alwaysPrepared: alwaysPrepared.has(id),
    };
    const group = byLevel.get(spell.level);
    if (group === undefined) byLevel.set(spell.level, [entry]);
    else group.push(entry);
  }

  return [...byLevel.keys()]
    .sort((a, b) => a - b)
    .map((level) => ({ level, spells: byLevel.get(level)!.sort((a, b) => a.name.localeCompare(b.name)) }));
};

const spellcastingView = (input: ComputeDerivedCharacterInput): SpellcastingView | undefined => {
  const classes = spellcastingClasses(input);
  const spellsByLevel = spellLevelGroups(input);
  if (classes.length === 0 && spellsByLevel.length === 0) return undefined;
  return { classes, spellsByLevel };
};

export const buildCharacterSheet = (input: ComputeDerivedCharacterInput): CharacterSheet => {
  const derived = computeDerivedCharacter(input);
  const effects = buildEffectStack(input);

  const initiativeAdvantage = effects.advantageFor('initiative');
  const initiative: InitiativeView = {
    modifier: derived.abilityModifiers.DEX + effects.modifierSum('initiative'),
    hasAdvantage: initiativeAdvantage.advantage && !initiativeAdvantage.disadvantage,
    hasDisadvantage: initiativeAdvantage.disadvantage && !initiativeAdvantage.advantage,
  };

  const passiveScores: PassiveScores = {
    perception: computePassiveScore({ ...input, ability: 'WIS', skill: 'perception' }),
    investigation: computePassiveScore({ ...input, ability: 'INT', skill: 'investigation' }),
    insight: computePassiveScore({ ...input, ability: 'WIS', skill: 'insight' }),
  };

  const spellcasting = spellcastingView(input);

  return {
    ...derived,
    skills: SKILLS.map((skill) => skillView(input, effects, skill)),
    passiveScores,
    initiative,
    attacks: attackViews(input),
    ...(spellcasting !== undefined ? { spellcasting } : {}),
  };
};
