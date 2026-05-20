import { z } from 'zod';
import {
  AbilityScoreSchema,
  DamageTypeSchema,
  DiceExpressionSchema,
  RechargeSchema,
  WeaponMasterySchema,
  WeaponPropertySchema,
} from '../primitives.js';
import { EffectSchema } from '../effects.js';
import { PredicateSchema } from '../predicate.js';

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

// Shared across MagicItemSchema and the magic-equipment fields on
// WeaponSchema / ArmorSchema (slice 315). A magic weapon or armor ships
// as itemKind 'weapon' / 'armor' (so the attack / AC consumers
// recognize it as wielded / worn) plus optional magic fields below.
const MagicRaritySchema = z.enum([
  'common',
  'uncommon',
  'rare',
  'very-rare',
  'legendary',
  'artifact',
]);

// Slice 315/316/317: magic-equipment overlay fields, shared between the
// single-base inline forms (WeaponSchema / ArmorSchema, where the magic
// item IS the weapon/armor) and the multi-base enchantment form
// (MagicItemSchema, applied to a base instance via
// ItemInstance.enchantmentDefinitionId). `weaponEnhancementFields`:
// `attackBonus` / `damageBonus` flat enhancements + `onHit` per-hit
// extra-damage riders. `armorEnhancementFields`: `acBonus`.
// Slice 319: on-hit-save arm. A rider may carry a saving throw at a
// fixed DC; on a failed save the target gains `conditionOnFail`. RAW
// canonical user: a Ghoul's Claw ("Constitution Saving Throw: DC 10.
// Failure: the target has the Paralyzed condition"). The save fires
// only when the enclosing rider's `condition` gate passes (the Ghoul's
// "if the target isn't an Undead or elf"), so the gate and the save
// compose. Condition durations are consumer-managed (mirror of the
// slice-286 Save UseAction), and `sourceIsMagical` defaults to false
// (monster natural-weapon saves are nonmagical) so the target's Magic
// Resistance doesn't apply unless the rider opts in.
//
// Slice 323: three more arms for the destroy-or-condition shape (Mace
// of Disruption: "If the target has 25 HP or fewer after taking this
// damage, DC 15 WIS save or be destroyed; on a success it's Frightened
// until the end of your next turn").
//   - `hpThreshold`: the save fires only when the target's HP AFTER the
//     hit's damage is at or below this value; otherwise no save at all.
//   - `destroyOnFail`: on a failed save the target is destroyed (a
//     CreatureDestroyed event), bypassing death saves. Takes precedence
//     over `conditionOnFail`.
//   - `conditionOnSuccess`: a condition applied on a SUCCESSFUL save.
// `conditionOnFail` is optional (Mace of Disruption destroys on fail and
// applies nothing-but-fear on success); the refine requires the save to
// have at least one outcome.
const onHitSaveSchema = z
  .object({
    ability: AbilityScoreSchema,
    dc: z.number().int().min(1),
    conditionOnFail: z.string().optional(),
    conditionOnSuccess: z.string().optional(),
    destroyOnFail: z.boolean().optional(),
    hpThreshold: z.number().int().min(1).optional(),
    sourceIsMagical: z.boolean().optional(),
  })
  .refine(
    (s) =>
      s.conditionOnFail !== undefined ||
      s.conditionOnSuccess !== undefined ||
      s.destroyOnFail === true,
    {
      message:
        'onHit save must have an outcome (conditionOnFail, conditionOnSuccess, or destroyOnFail)',
    },
  );
const onHitRiderSchema = z
  .object({
    // Slice 319: dice/damageType are now optional and paired. A rider
    // carries extra damage (dice + damageType), a save (below), or
    // both. A pure-save rider (Ghoul's Claw: no extra dice, just the
    // save) omits dice/damageType entirely.
    dice: DiceExpressionSchema.optional(),
    damageType: DamageTypeSchema.optional(),
    // Slice 318: optional target-gated condition. When present, the rider
    // only fires on a hit whose target satisfies the predicate, evaluated
    // against target facts at hit time (`target.creatureType` and
    // `target.speciesId` for "vs Undead / Giants / Constructs", or the
    // Ghoul's "isn't an Undead or elf"). Unconditional riders (Thunderous
    // Greatclub's +1d8 thunder) omit it and fire on every hit.
    condition: PredicateSchema.optional(),
    save: onHitSaveSchema.optional(),
    // Slice 321: unconditional on-hit condition application (no save).
    // The 2024 RAW shape for most poison/venom natural attacks: "Hit:
    // ... and the target has the Poisoned condition" (Couatl's Bite,
    // Assassin's Shortsword, Bearded Devil's Beard). On a hit where the
    // rider's `condition` gate passes, the planner emits ConditionApplied
    // (sourced by the attacker). Distinct from `save.conditionOnFail`,
    // which gates the condition behind a failed save. Duration is
    // consumer-managed (mirror of slice 286 / 319).
    applyConditionId: z.string().optional(),
  })
  .refine((r) => (r.dice === undefined) === (r.damageType === undefined), {
    message: 'onHit rider dice and damageType must be set together',
  })
  .refine((r) => r.dice !== undefined || r.save !== undefined || r.applyConditionId !== undefined, {
    message: 'onHit rider must carry extra damage (dice), a save, or an applied condition',
  });
const weaponEnhancementFields = {
  attackBonus: z.number().int().optional(),
  damageBonus: z.number().int().optional(),
  onHit: z.array(onHitRiderSchema).optional(),
} as const;
const armorEnhancementFields = {
  acBonus: z.number().int().optional(),
} as const;

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
  // Slice 316: optional magic-weapon fields. A magic weapon with a
  // single base (Sun Blade = Longsword) ships as itemKind 'weapon' with
  // the base stats + these fields, so the attack planner wields it and
  // applies the enhancement. `attackBonus` / `damageBonus` are the flat
  // enhancement bonuses (Sun Blade +2). `onHit` is a list of intrinsic
  // per-hit extra-damage riders rolled fresh on every hit (Thunderous
  // Greatclub +1d8 thunder), distinct from the slice-76 temporaryBuff
  // rider (which is consumable-applied). `effects` project to the
  // wielder's effect stack while the weapon is held + attuned (slice
  // 132 rule, broadened). A magic weapon counts as magical for the
  // resistance-bypass check (isMagicWeaponAttack). Multi-base magic
  // weapons ("any of N") stay itemKind 'magic' (deferred).
  rarity: MagicRaritySchema.optional(),
  requiresAttunement: z.boolean().optional(),
  attunementCondition: z.string().optional(),
  ...weaponEnhancementFields,
  effects: z.array(EffectSchema).optional(),
});
export type Weapon = z.infer<typeof WeaponSchema>;

export const ArmorSchema = ItemBaseSchema.extend({
  itemKind: z.literal('armor'),
  category: z.enum(['light', 'medium', 'heavy', 'shield']),
  baseAC: z.number().int().min(0),
  dexCap: z.number().int().optional(),
  strRequirement: z.number().int().optional(),
  stealthDisadvantage: z.boolean().default(false),
  // Slice 315: optional magic-armor fields. A magic armor / shield with
  // a single base (Dragon Scale Mail = Scale Mail, the magic shields =
  // Shield) ships as itemKind 'armor' so the AC derive applies its
  // baseAC + DEX, plus these fields. `acBonus` is the enhancement bonus
  // to AC (Dragon Scale Mail +1). `effects` project to the wearer's
  // effect stack under the same equipped + attunement rule as magic
  // items (slice 132). Multi-base magic armor ("any medium or heavy")
  // stays itemKind 'magic' (deferred) — it has no single base AC.
  rarity: MagicRaritySchema.optional(),
  requiresAttunement: z.boolean().optional(),
  attunementCondition: z.string().optional(),
  ...armorEnhancementFields,
  effects: z.array(EffectSchema).optional(),
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
  // Slice 286. Item-fixed-DC save against a target list. Distinct
  // from CastSpell (no spell is cast — the item has its own bespoke
  // save mechanic at a fixed DC; the consumer's spell DC isn't
  // involved). Canonical user: Pipes of Haunting (RAW: "Each
  // creature of your choice within 30 feet of you must succeed on a
  // DC 15 Wisdom saving throw or have the Frightened condition for
  // 1 minute"). The targets are supplied by the consumer via the
  // new `saveTargetIds` field on UseItemIntent (engine doesn't
  // model positions, so the 30-foot scope is consumer territory).
  // For each target the planner rolls a save, emits SaveRolled,
  // and on failure emits ConditionApplied for `conditionOnFail`.
  // The 1-minute duration is consumer-managed (mirror of slice
  // 236's ApplyCondition doc comment); the recurring end-of-turn
  // save is a future deferral that would need an `recurringSave`
  // applied to the bearer condition.
  z.object({
    kind: z.literal('Save'),
    saveAbility: AbilityScoreSchema,
    saveDC: z.number().int().min(1),
    conditionOnFail: z.string(),
    sourceIsMagical: z.boolean().optional(),
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
  rarity: MagicRaritySchema,
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
  // Slice 317: enchantment-overlay fields. When this magic item is a
  // multi-base equipment enchantment (Frost Brand, "+1 weapon", "+1
  // armor"), a base weapon/armor instance references it via
  // ItemInstance.enchantmentDefinitionId, and the attack planner / AC
  // derive overlay these onto the base. `weaponDamageType` overrides the
  // base weapon's damage type (Flame Tongue → fire). `effects` (above)
  // also project from an equipped enchanted base.
  ...weaponEnhancementFields,
  ...armorEnhancementFields,
  weaponDamageType: DamageTypeSchema.optional(),
  // Slice 293. Cumulative time-budget on toggle-able items that
  // RAW-cap their activation duration per long rest (Boots of Speed:
  // 10 min/LR; Winged Boots: 4 hr/LR; etc.). Distinct from `charges`
  // (per-use integer count) and round-based auto-expiry (slice 102 /
  // 109 — source-keyed, encounter-scoped): a continuous time pool
  // that drains while the toggled condition is active and resets on
  // long rest. The engine doesn't model in-fiction elapsed minutes
  // between activations; the consumer reports `minutesElapsed` on the
  // toggle-off intent. The instance's `minutesUsed` (slice 293) is
  // the cumulative draw; when it reaches `maxMinutesPerLongRest`,
  // `planUseItem` rejects further toggle-on attempts until a long
  // rest resets the counter via `applyLongRestEnded`.
  timeBudget: z
    .object({
      maxMinutesPerLongRest: z.number().int().min(1),
    })
    .optional(),
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
  // Slice 283. Remove every applied condition whose `conditionId` is
  // in the list (no-op for ids the bearer doesn't carry). Distinct
  // from ApplyCondition's inverse: the planner emits a separate
  // ConditionRemoved for each matched applied-condition instance, so
  // stacked / multiply-sourced conditions are all stripped. Canonical
  // user: Potion of Vitality (RAW: "ends the Poisoned condition"),
  // composed with RemoveExhaustion to cover the full clear.
  z.object({
    kind: z.literal('RemoveConditions'),
    conditionIds: z.array(z.string()).min(1),
  }),
  // Slice 283. Zero out the bearer's exhaustion level (emits one
  // ExhaustionChanged event from current → 0 when current > 0;
  // no-op when already 0). Canonical user: Potion of Vitality
  // ("removes any Exhaustion you are suffering"). Distinct from a
  // future RAW shape that reduces exhaustion by N (Greater
  // Restoration spell reduces by 1, not zeroes out).
  z.object({
    kind: z.literal('RemoveExhaustion'),
  }),
  // Slice 284. Apply a temporary buff to a target weapon via the
  // existing slice-76 `ItemInstance.temporaryBuff` shape. Canonical
  // users: Oil of Sharpness (+3 attack / +3 damage / counts as
  // magical for 1 hour) and Poison Basic (+1d4 poison damage rider
  // for 1 minute). Mirrors the four temporaryBuff fields so the
  // attack planner picks them up automatically. The buff stamps a
  // fresh synthetic effect-instance id (consumable-applied buffs
  // aren't linked to concentration; the id serves as a unique tag
  // for future "remove this specific buff" semantics). The
  // consumer specifies the target weapon via the
  // `targetWeaponInstanceId` field on ConsumeItemIntent (defaults
  // to the actor's equipped main hand). RAW deviations: the
  // engine doesn't gate on weapon type (RAW: piercing / slashing
  // only) and doesn't auto-expire on the RAW time / first-hit
  // trigger (consumer-managed duration).
  z.object({
    kind: z.literal('ApplyItemBuff'),
    attackBonus: z.number().int().optional(),
    damageBonus: z.number().int().optional(),
    extraDamageDice: z.string().optional(),
    extraDamageType: DamageTypeSchema.optional(),
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
