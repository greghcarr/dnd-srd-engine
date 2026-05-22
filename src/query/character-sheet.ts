// Slice 412: character-sheet view model (read layer, part 2).
//
// `computeDerivedCharacter` already assembles the top of a sheet (level,
// PB, ability mods, HP, AC, saves, spell slots, languages). This wraps
// it into the consumer-facing `CharacterSheet` and composes the
// computed-stats a sheet conspicuously needs but that aggregate omits:
// all 18 skills (modifier + proficiency + advantage), the three passive
// scores, initiative, effective movement speeds, the attacks list (one
// entry per inventory weapon, with to-hit + static damage line), and the
// spellcasting block (per-class save DC + attack bonus, and the castable
// spells grouped by level), and the inventory / equipment summary (carried
// + equipped + attuned items, with encumbrance). The attacks list ends with
// the always-available unarmed strike. Pure assembly over existing
// derivations: it invents no rules, so RAW correctness lives in the
// derivations it calls.
import type {
  AbilityScore,
  Skill,
  ProficiencyLevel,
  WeaponProperty,
  WeaponMastery,
} from '../schemas/primitives.js';
import { SKILLS, SKILL_ABILITY } from '../schemas/primitives.js';
import type { Weapon, ItemDefinition } from '../schemas/content/item.js';
import {
  computeDerivedCharacter,
  type DerivedCharacter,
  type ComputeDerivedCharacterInput,
} from '../derive/character-view.js';
import { computeAbilityCheck, computePassiveScore } from '../derive/ability-check.js';
import { computeAttackBonus, computeWeaponDamage, computeUnarmedStrike, type WeaponDamage } from '../derive/attack.js';
import { computeSpellSaveDC, computeSpellAttackBonus } from '../derive/spell-dc.js';
import { getEffectiveSpeeds, type EffectiveSpeeds } from '../derive/speed.js';
import { computeEncumbrance, type EncumbranceResult } from '../derive/encumbrance.js';
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
  /** The inventory weapon's instance id; absent for the unarmed strike. */
  readonly weaponInstanceId?: string;
  /** True for the always-available unarmed strike entry. */
  readonly unarmed?: boolean;
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

export type EquipSlot = 'mainHand' | 'offHand' | 'armor' | 'shield';

export interface InventoryEntry {
  readonly instanceId: string;
  readonly definitionId: string;
  /** The instance's custom name, else the definition name. */
  readonly name: string;
  readonly itemKind: ItemDefinition['itemKind'];
  readonly quantity: number;
  /** Per-unit weight in pounds (0 when the definition has none). */
  readonly weight: number;
  /** Set when the instance occupies an equipment slot. */
  readonly equippedSlot?: EquipSlot;
  readonly attuned: boolean;
  /** Set for items that track charges. */
  readonly charges?: { readonly remaining: number; readonly max: number };
}

export interface InventoryView {
  /** Carried + equipped + attuned items, inventory order first. */
  readonly items: ReadonlyArray<InventoryEntry>;
  readonly encumbrance: EncumbranceResult;
}

export interface CharacterSheet extends DerivedCharacter {
  /** All 18 skills, in canonical `SKILLS` order. */
  readonly skills: ReadonlyArray<SkillView>;
  readonly passiveScores: PassiveScores;
  readonly initiative: InitiativeView;
  /** Effective movement speeds (walk always; non-walk modes only when > 0). */
  readonly speeds: EffectiveSpeeds;
  /** One entry per inventory weapon (inventory order), then the unarmed strike. */
  readonly attacks: ReadonlyArray<AttackView>;
  /** Carried + equipped + attuned items, plus encumbrance. */
  readonly inventory: InventoryView;
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

// One attack entry per weapon in the character's inventory (inventory
// order; non-weapon items and dangling instance ids skipped), then the
// always-available unarmed strike (when the pack defines one).
const attackViews = (input: ComputeDerivedCharacterInput): AttackView[] => {
  const attacks: AttackView[] = [];
  for (const instanceId of input.character.inventory) {
    const instance = input.itemInstances[instanceId];
    if (instance === undefined) continue;
    const def = input.content.items.get(instance.definitionId);
    if (def?.itemKind === 'weapon') attacks.push(attackView(input, instanceId, def));
  }
  const unarmed = computeUnarmedStrike(input);
  if (unarmed !== undefined) {
    attacks.push({
      unarmed: true,
      name: unarmed.name,
      attackKind: unarmed.attackKind,
      attackBonus: unarmed.attackBonus,
      damage: unarmed.damage,
      properties: unarmed.properties,
    });
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

const EQUIP_SLOTS: ReadonlyArray<EquipSlot> = ['mainHand', 'offHand', 'armor', 'shield'];

// Carried + equipped + attuned items (inventory order first, then any
// equipped / attuned instance not separately listed in inventory, since a
// worn magic item can project effects without being in the inventory
// array), plus the encumbrance summary. Dangling instance ids and ids
// with no matching definition are skipped.
const inventoryView = (input: ComputeDerivedCharacterInput): InventoryView => {
  const { character, itemInstances, content } = input;
  const ids: string[] = [...character.inventory];
  const addId = (id: string | undefined): void => {
    if (id !== undefined && !ids.includes(id)) ids.push(id);
  };
  for (const slot of EQUIP_SLOTS) addId(character.equipped[slot]);
  for (const id of character.equipped.attuned) addId(id);

  const attunedSet = new Set(character.equipped.attuned);
  const items: InventoryEntry[] = [];
  for (const instanceId of ids) {
    const instance = itemInstances[instanceId];
    if (instance === undefined) continue;
    const def = content.items.get(instance.definitionId);
    if (def === undefined) continue;
    const equippedSlot = EQUIP_SLOTS.find((slot) => character.equipped[slot] === instanceId);
    items.push({
      instanceId,
      definitionId: instance.definitionId,
      name: instance.customName ?? def.name,
      itemKind: def.itemKind,
      quantity: instance.quantity,
      weight: def.weight ?? 0,
      attuned: attunedSet.has(instanceId),
      ...(equippedSlot !== undefined ? { equippedSlot } : {}),
      ...(instance.chargesRemaining !== undefined
        ? { charges: { remaining: instance.chargesRemaining, max: instance.maxCharges ?? instance.chargesRemaining } }
        : {}),
    });
  }
  return { items, encumbrance: computeEncumbrance({ character, itemInstances, content }) };
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
    speeds: getEffectiveSpeeds(input),
    attacks: attackViews(input),
    inventory: inventoryView(input),
    ...(spellcasting !== undefined ? { spellcasting } : {}),
  };
};
