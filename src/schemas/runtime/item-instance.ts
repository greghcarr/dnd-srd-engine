import { z } from 'zod';
import { AbilityScoreSchema, DamageTypeSchema, DiceExpressionSchema, ULIDSchema } from '../primitives.js';

// Spell-applied temporary buff stamped onto a specific item instance.
// Magic Weapon (+1 / +2 / +3 attack and damage) and similar effects
// flow through here: a concentration spell's planner emits
// `ItemBuffApplied` with these fields, the item-instance state stores
// them, and the attack derive (attack bonus) + damage roll (damage
// bonus) read them back when this instance is used as the weapon.
// `sourceEffectInstanceId` links the buff to the concentration effect
// so `clearConcentrationEffect` lifts it when concentration ends.
//
// `extraDamageDice` + `extraDamageType` carry a per-hit elemental
// rider for Elemental Weapon (1d4 / 2d4 / 3d4 of a caster-chosen
// type, scaling with slot level). When both are set, the attack
// planner rolls the dice on hit and emits a second damage component
// alongside the weapon's native damage. Crits double the extra dice
// per RAW.
export const ItemTemporaryBuffSchema = z.object({
  attackBonus: z.number().int().default(0),
  damageBonus: z.number().int().default(0),
  extraDamageDice: z.string().optional(),
  extraDamageType: DamageTypeSchema.optional(),
  // Slice 501: Shillelagh-style weapon transformation. `abilityOverride`
  // makes attack + damage rolls with this weapon use the named ability
  // instead of the weapon-property default (Shillelagh: the caster's
  // spellcasting ability instead of STR). `damageDieOverride` replaces
  // the weapon's printed damage dice (Shillelagh: `1d8`).
  // `damageTypeOverride` swaps the damage type (Shillelagh's "can be
  // Force damage" choice). The attack resolver / attack-bonus derive
  // read these when this weapon is used.
  abilityOverride: AbilityScoreSchema.optional(),
  damageDieOverride: DiceExpressionSchema.optional(),
  damageTypeOverride: DamageTypeSchema.optional(),
  // Slice 501: now optional. Concentration-bound buffs (Magic Weapon,
  // Elemental Weapon) set it so `clearConcentrationEffect` can lift the
  // buff on concentration drop. Non-concentration buffs (Shillelagh,
  // 1-minute duration, consumer-managed expiry) omit it.
  sourceEffectInstanceId: ULIDSchema.optional(),
  source: z.string().optional(),
});
export type ItemTemporaryBuff = z.infer<typeof ItemTemporaryBuffSchema>;

export const ItemInstanceSchema = z.object({
  id: ULIDSchema,
  definitionId: z.string(),
  customName: z.string().optional(),
  quantity: z.number().int().min(1).default(1),
  chargesRemaining: z.number().int().min(0).optional(),
  attuned: z.boolean().default(false),
  attunedTo: ULIDSchema.optional(),
  equippedBy: ULIDSchema.optional(),
  containerId: ULIDSchema.optional(),
  acquiredAtEventId: ULIDSchema.optional(),
  identifiedByCharacterIds: z.array(ULIDSchema).default([]),
  maxCharges: z.number().int().min(0).optional(),
  sentient: z
    .object({
      ego: z.number().int().min(0),
      alignment: z.string(),
      personality: z.string().optional(),
    })
    .optional(),
  temporaryBuff: ItemTemporaryBuffSchema.optional(),
  // Slice 317: multi-base magic equipment ("enchantment overlay"). A
  // base weapon / armor instance (`definitionId` = the base, e.g.
  // 'longsword' / 'plate') references a magic enchantment definition
  // (itemKind 'magic' carrying the magic-equipment fields, e.g.
  // 'frost-brand' / 'weapon-plus-1') applied to it. The attack planner,
  // AC derive, effect projection, and magicality detector read the
  // enchantment as an overlay on the base (parallel to `temporaryBuff`,
  // but permanent and not concentration-bound). Used for the multi-base
  // items whose base is chosen at creation (Frost Brand = any of 6
  // weapons, "+1 armor" = any armor), which can't ship as a single
  // itemKind 'weapon'/'armor' definition the way slice 315/316's
  // single-base items do.
  enchantmentDefinitionId: z.string().optional(),
  // Slice 293. Cumulative activation time consumed against the
  // definition's `timeBudget.maxMinutesPerLongRest`. Boots of Speed
  // (10 min/LR) is the canonical user. `planUseItem`'s Toggle branch
  // rejects toggle-on when `minutesUsed >= max`; the consumer reports
  // elapsed minutes on toggle-off via `UseItemIntent.minutesElapsed`,
  // which emits `ItemTimeBudgetConsumed` and increments this field.
  // `applyLongRestEnded` resets it to 0 for participants' inventory.
  minutesUsed: z.number().int().min(0).optional(),
});
export type ItemInstance = z.infer<typeof ItemInstanceSchema>;
