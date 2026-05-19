import { z } from 'zod';
import {
  DamageTypeSchema,
  DiceExpressionSchema,
  RechargeSchema,
  WeaponMasterySchema,
  WeaponPropertySchema,
} from '../primitives.js';
import { EffectSchema } from '../effects.js';

const ItemBaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  weight: z.number().nonnegative().optional(),
  cost: z
    .object({
      amount: z.number().int().min(0),
      currency: z.enum(['cp', 'sp', 'ep', 'gp', 'pp']),
    })
    .optional(),
});

export const WeaponSchema = ItemBaseSchema.extend({
  itemKind: z.literal('weapon'),
  category: z.enum(['simple', 'martial']),
  attackKind: z.enum(['melee', 'ranged']),
  damageType: DamageTypeSchema,
  damageDice: DiceExpressionSchema,
  versatileDice: DiceExpressionSchema.optional(),
  properties: z.array(WeaponPropertySchema).default([]),
  mastery: WeaponMasterySchema.optional(),
  rangeNormal: z.number().int().optional(),
  rangeLong: z.number().int().optional(),
});
export type Weapon = z.infer<typeof WeaponSchema>;

export const ArmorSchema = ItemBaseSchema.extend({
  itemKind: z.literal('armor'),
  category: z.enum(['light', 'medium', 'heavy', 'shield']),
  baseAC: z.number().int().min(0),
  dexCap: z.number().int().optional(),
  strRequirement: z.number().int().optional(),
  stealthDisadvantage: z.boolean().default(false),
});
export type Armor = z.infer<typeof ArmorSchema>;

export const ToolSchema = ItemBaseSchema.extend({
  itemKind: z.literal('tool'),
  category: z.enum(['artisan', 'gaming', 'musical', 'other']),
});
export type Tool = z.infer<typeof ToolSchema>;

// Slice 240: magic-item activate-as-action action set. Mirror of
// slice 235's ConsumeActionSchema but for items that persist after
// use (charge-driven instead of single-use). The planner consumes 1
// charge from the item's `charges` shape (if defined) before walking
// the action list, and emits ItemUsed at the end instead of
// ItemConsumed (no retirement).
//
// Slice 241. CastSpell variant added (parallel to slice 237's
// ConsumeActionSchema CastSpell): unblocks spell-grant items like
// Boots of Levitation, Hat of Disguise, Helm of Telepathy, Decanter
// of Endless Water. The planner branch delegates to planCastSpell
// with noSlotCost + ignorePreparation (the item supplies the slot,
// the item-knowledge bypasses the prepared-spells gate). Spells
// whose engine path is a dedicated planner (Misty Step, Wish,
// Polymorph) are not wired via this action — same deferral as
// ConsumeAction's CastSpell.
//
// Slice 242. Toggle variant added: click-on / click-off shape for
// items like Boots of Speed where each activation flips the bearer
// state. The planner inspects the target's current applied
// conditions: if `conditionId` is already present, emit
// ConditionRemoved (toggle off); otherwise emit ConditionApplied
// (toggle on). Distinct semantic from ApplyCondition (which always
// applies, even if already present — the existing reducer dedupes by
// id but the per-use intent stays "always activate"). The condition
// itself models the active-state effects; the click-again-off
// behavior is handled by the planner.
//
// Slice 243. Multi-action items + per-action chargesCost. Each
// variant now carries optional `actionId` (consumer-facing selector
// for items that offer multiple distinct uses, e.g. Staff of
// Healing's Cure Wounds / Lesser Restoration / Mass Cure Wounds) and
// optional `chargesCost` (defaults to 1; differentiates per-action
// charge cost on the same item — Staff of Healing's Lesser
// Restoration is 2 charges, Mass Cure Wounds is 5). When `onUse`
// has more than one entry, the consumer MUST pass `actionId` on
// UseItemIntent to disambiguate; single-action items keep the
// slice-240 back-compat (no actionId required).
//
// Slice 253. Variable per-use chargesCost on `CastSpell` only. When
// `chargesCostMax` is set, `chargesCost` becomes the *minimum* and
// the consumer picks a value in [chargesCost, chargesCostMax] at use
// time via `UseItemIntent.chargesCost`. The effective slot level is
// computed as `slotLevel + (intent.chargesCost - chargesCost)`, so
// spending an extra charge raises the cast slot by 1. Canonical RAW
// users: Wand of Magic Missiles (1-3 charges → L1-L3 Magic Missile);
// Wand of Fireballs / Lightning Bolts (1-7 charges → L3-L9); Staff
// of Healing's Cure Wounds arm (1-4 charges → L1-L4). When
// `chargesCostMax` is omitted, the action is fixed-cost (slice 243
// shape). Variable cost is supported only on `CastSpell` because the
// scaling axis (slot level) is meaningful only there; ApplyCondition
// and Toggle don't carry a comparable per-use intensity dial.
//
// Duration on ApplyCondition: same shape as slice 236 — the engine's
// auto-expiry primitive is round-based and source-keyed; minute /
// hour durations are consumer-managed (the planner emits
// ConditionApplied without expiresOnRound and the consumer removes it
// when the in-fiction timer runs out).
export const UseActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ApplyCondition'),
    conditionId: z.string(),
    actionId: z.string().optional(),
    chargesCost: z.number().int().min(0).optional(),
  }),
  z.object({
    kind: z.literal('CastSpell'),
    spellId: z.string(),
    slotLevel: z.number().int().min(0),
    castingClassId: z.string().optional(),
    actionId: z.string().optional(),
    chargesCost: z.number().int().min(0).optional(),
    chargesCostMax: z.number().int().min(1).optional(),
  }),
  z.object({
    kind: z.literal('Toggle'),
    conditionId: z.string(),
    actionId: z.string().optional(),
    chargesCost: z.number().int().min(0).optional(),
  }),
]);
export type UseAction = z.infer<typeof UseActionSchema>;

// Slice 256. Per-item degradation roll. RAW canonical shape: "If you
// expend the last charge, roll 1d20. On a 1, the wand crumbles into
// ashes" (Wand of Magic Missiles / Fireballs / Lightning Bolts) and
// "the staff vanishes in a flash of light" (Staff of Healing). The
// `trigger: 'lastChargeExpended'` shape fires after the planner
// consumes the item's last charge; the planner rolls a `die`-sided
// die and, if the result is in `destroyOn`, emits ItemDestroyed.
// Distinct from Wind Fan's "20% per-use tear" shape, which fires on
// every use independent of charges and would need a separate
// `trigger: 'eachUse'` variant (deferred until a canonical user
// drives it; Wind Fan is the only RAW user today).
export const DestructionRollSchema = z.object({
  trigger: z.literal('lastChargeExpended'),
  die: z.number().int().min(2),
  destroyOn: z.array(z.number().int().positive()).min(1),
});
export type DestructionRoll = z.infer<typeof DestructionRollSchema>;

export const MagicItemSchema = ItemBaseSchema.extend({
  itemKind: z.literal('magic'),
  rarity: z.enum(['common', 'uncommon', 'rare', 'very-rare', 'legendary', 'artifact']),
  requiresAttunement: z.boolean().default(false),
  attunementCondition: z.string().optional(),
  charges: z
    .object({
      max: z.number().int().min(1),
      recharge: RechargeSchema,
      rechargeFormula: DiceExpressionSchema.optional(),
    })
    .optional(),
  effects: z.array(EffectSchema).default([]),
  onUse: z.array(UseActionSchema).default([]),
  destructionRoll: DestructionRollSchema.optional(),
});
export type MagicItem = z.infer<typeof MagicItemSchema>;

// Slice 235: consumable-on-consume action set. Distinct from
// TriggerAction (which fires from OnEvent riders): consumption is a
// deliberate consumer-initiated act, not an event-triggered ride.
// Slice 236 added ApplyCondition (for buff potions). Future
// entries will add CastSpell (for spell-scroll consumption).
//
// Duration on ApplyCondition: the engine's auto-expiry primitive
// (slice 102 / 109) is round-based and source-keyed. Minute-based
// or hour-based potion durations are consumer-managed today —
// the planner emits ConditionApplied without expiresOnRound and
// the consumer removes it when the in-fiction timer runs out.
export const ConsumeActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('Heal'),
    dice: DiceExpressionSchema.optional(),
    flatAmount: z.number().int().min(0).optional(),
  }),
  z.object({
    kind: z.literal('ApplyCondition'),
    conditionId: z.string(),
  }),
  // Slice 237. Spell-scroll consumption: cast the named spell at
  // `slotLevel` without a slot cost and without preparation gating
  // (the scroll itself is the spell-knowledge proxy). Delegates to
  // planCastSpell via slice-219's noSlotCost + slice-220's
  // ignorePreparation. The consumer's castTargetIds on the intent
  // supplies the spell's targets; if omitted, defaults to the
  // consumer (useful for self-buff scrolls).
  //
  // `castingClassId` is the spellcasting class to use for DC /
  // attack-bonus computation. Scrolls typically specify 'wizard'
  // since RAW pre-bakes "+5 spell attack / DC 13" for the standard
  // wizardly scroll-author profile. Without this, planCastSpell
  // throws on consumers with no spellcasting class.
  //
  // Spells whose engine path is a dedicated planner (Misty Step,
  // Wish) are not wired via this action — they'd need a separate
  // scroll-to-planner dispatch shape.
  z.object({
    kind: z.literal('CastSpell'),
    spellId: z.string(),
    slotLevel: z.number().int().min(0),
    castingClassId: z.string().optional(),
  }),
  // Slice 282. Flat temporary HP grant on consume. Canonical user:
  // Potion of Heroism (RAW: "gains 10 Temporary Hit Points and the
  // Blessed condition for 1 hour"). Distinct from Heal (which
  // restores current HP); the engine's existing applyTempHPGranted
  // reducer enforces max-not-additive semantics so multiple grants
  // don't stack. Compose with the slice-236 ApplyCondition variant
  // when the same potion also applies a condition (Heroism uses
  // both arms).
  z.object({
    kind: z.literal('GrantTempHP'),
    amount: z.number().int().min(0),
  }),
]);
export type ConsumeAction = z.infer<typeof ConsumeActionSchema>;

export const ConsumableSchema = ItemBaseSchema.extend({
  itemKind: z.literal('consumable'),
  onConsume: z.array(ConsumeActionSchema).default([]),
  description: z.string().optional(),
});
export type Consumable = z.infer<typeof ConsumableSchema>;

export const GearSchema = ItemBaseSchema.extend({
  itemKind: z.literal('gear'),
  description: z.string().optional(),
});
export type Gear = z.infer<typeof GearSchema>;

export const ItemDefinitionSchema = z.discriminatedUnion('itemKind', [
  WeaponSchema,
  ArmorSchema,
  ToolSchema,
  MagicItemSchema,
  ConsumableSchema,
  GearSchema,
]);
export type ItemDefinition = z.infer<typeof ItemDefinitionSchema>;
