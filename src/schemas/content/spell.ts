import { z } from 'zod';
import {
  AbilityScoreSchema,
  CreatureTypeSchema,
  DamageTypeSchema,
  DiceExpressionSchema,
  SpellLevelSchema,
  SpellSchoolSchema,
} from '../primitives.js';

const CANTRIP_SCALING_THRESHOLDS = [5, 11, 17] as const;

// Attack-roll spell mechanic. The damage type is normally fixed
// (`damageType`), but a few spells let the caster pick at cast time
// (Chromatic Orb: acid / cold / fire / lightning / poison / thunder).
// For those, omit `damageType` and set `casterChoosesDamageType` with
// the allowed list; the planner reads `intent.casterChoice` and uses
// the picked value. Exactly one of the two must be set; the invariant
// is enforced in the planner (Zod's discriminated union doesn't accept
// `.refine()` on its members, so we validate at plan time instead).
const SpellAttackMechanicSchema = z
  .object({
    kind: z.literal('attack'),
    damageDice: DiceExpressionSchema,
    damageType: DamageTypeSchema.optional(),
    casterChoosesDamageType: z
      .object({
        allowed: z.array(DamageTypeSchema).min(1),
      })
      .optional(),
    extraDicePerSlotLevel: z.number().int().min(0).optional(),
    cantripScalingDice: DiceExpressionSchema.optional(),
    // Slice 498: exploding ("aceing" / open-die) damage. When true, each
    // damage die (base + cantrip-scaling) that rolls its maximum face
    // spawns an extra die of the same size, chained (an extra die that
    // also maxes spawns another), capped at a total number of extra dice
    // equal to the caster's spellcasting ability modifier. Canonical
    // user: Sorcerous Burst ("If you roll an 8 on a d8 for this spell,
    // you can roll another d8... the maximum number of these d8s you can
    // add equals your spellcasting ability modifier"). The die size is
    // read from `damageDice`.
    explodeOnMaxDie: z.boolean().optional(),
    // Slice 497: which targets this attack mechanic resolves against when
    // the cast carries multiple targetIds. `'all'` (default) attacks each
    // target (the historical behavior). `'first'` attacks only
    // `targetIds[0]` — used by spells that make ONE attack against a
    // primary target and then resolve a separate AOE save mechanic
    // against the primary + splash creatures (Ice Knife: ranged spell
    // attack vs the primary for 1d10 piercing, then a DEX-save cold
    // burst vs the primary + everyone within 5 ft). The save mechanic
    // keeps `'all'` so it covers the whole burst.
    targetScope: z.enum(['first', 'all']).optional(),
    // Whether the spell attack is a Melee or Ranged Spell Attack. Stamped
    // on the AttackRolled event so the `event.attackKind` predicate fact
    // is correct (melee-gated riders, the ranged-in-melee disadvantage,
    // etc.). Defaults to 'ranged' (most damaging cantrips). Slice 371: the
    // five RAW melee spell attacks (Shocking Grasp, Spiritual Weapon,
    // Chill Touch, Flame Blade, Vampiric Touch) had this authored but it
    // was silently stripped (the field didn't exist), so they were
    // mistagged ranged.
    attackKind: z.enum(['melee', 'ranged']).default('ranged'),
  })
  // Slice 371: `.strict()` so a future authored-but-unsupported field
  // fails to parse loudly instead of being silently dropped by Zod (the
  // same phantom-field trap that left the save spells dealing no damage
  // in slice 370).
  .strict();

// Save-based spell mechanic. `conditionOnFail` is the standard
// "single condition on failed save" shape (Hold Person, Tasha's
// Hideous Laughter, etc.). For spells that let the caster pick the
// variant at cast time (Calm Emotions: suppress vs make indifferent),
// omit `conditionOnFail` and set `casterChoosesVariant` listing each
// variant's `key` and the condition that applies on a failed save.
// Exactly one of the two must be set when condition-on-fail is wanted;
// the planner validates at cast time.
const SpellSaveMechanicSchema = z.object({
  kind: z.literal('save'),
  ability: AbilityScoreSchema,
  damageDice: DiceExpressionSchema.optional(),
  damageType: DamageTypeSchema.optional(),
  halfOnSuccess: z.boolean().optional(),
  // Slice 341: additional damage components of a *different* type,
  // applied in the same save (Flame Strike: 5d6 Fire + 5d6 Radiant).
  // Each is rolled once for the spell (AOE), receives the same
  // success / Evasion halving as the primary `damageDice`, and lands
  // as its own component in the single DamageApplied so per-type
  // resistance / immunity is honored independently. Each entry carries
  // its own `extraDicePerSlotLevel` (Flame Strike scales both types).
  additionalDamage: z
    .array(
      z.object({
        damageDice: DiceExpressionSchema,
        damageType: DamageTypeSchema,
        extraDicePerSlotLevel: z.number().int().min(0).optional(),
      }),
    )
    .optional(),
  conditionOnFail: z.string().optional(),
  casterChoosesVariant: z
    .object({
      variants: z
        .array(
          z.object({
            key: z.string(),
            conditionId: z.string(),
          }),
        )
        .min(2),
    })
    .optional(),
  // Forced movement on a failed save (Gust of Wind: 15 ft). The
  // planner emits a `CreaturePushed` informational event per failed
  // target so consumers can apply the position change. The engine
  // doesn't model positions, so no state mutation happens.
  pushedFeetOnFail: z.number().int().min(0).optional(),
  extraDicePerSlotLevel: z.number().int().min(0).optional(),
  cantripScalingDice: DiceExpressionSchema.optional(),
  // Slice 500: restrict the save to targets of a specific creature type.
  // When set, targets whose `getCreatureType` doesn't match are skipped
  // entirely (no save rolled, no condition applied). Canonical user:
  // Animal Friendship ("Target a Beast... must succeed on a Wisdom
  // saving throw or have the Charmed condition"). Reusable for any
  // type-gated save (beast / fiend / undead-only enchantments).
  targetCreatureType: CreatureTypeSchema.optional(),
  // Slice 500: stamp the slice-391 per-instance `endsOnDamage` flag on
  // the `conditionOnFail` condition, so the damage chokepoint lifts it
  // on the next positive damage. Canonical user: Animal Friendship
  // ("If you or one of your allies deals damage to the target, the
  // spell ends"). Documented RAW deviation: the engine's endsOnDamage
  // fires on ANY positive damage, not just caster-side damage.
  conditionEndsOnDamage: z.boolean().optional(),
  // Slice 503: targets of size Large or larger gain Advantage on the save
  // (RAW Ensnaring Strike: "A Large or larger creature has Advantage on
  // this save"). Read per-target in the save planner; ORs into any
  // existing advantage from the target's effect stack.
  largeCreatureAdvantage: z.boolean().optional(),
})
  // Slice 370: `.strict()` so an authored field the engine doesn't
  // support (e.g. the `onFailure` / `onSuccess` shape that Sacred Flame /
  // Burning Hands / Thunderwave used) fails to parse loudly instead of
  // being silently dropped by Zod, which had left those spells dealing
  // zero damage at runtime while the SRD-drift audit (which reads the raw
  // authored fields) still passed.
  .strict();

const SpellHealMechanicSchema = z.object({
  kind: z.literal('heal'),
  amountDice: DiceExpressionSchema.optional(),
  // Flat amount applied in addition to (or in place of) the rolled
  // amount. Useful for spells with fixed-value heals like Aid (+5 per
  // target). At least one of amountDice or flatAmount must be present.
  flatAmount: z.number().int().min(0).optional(),
  extraDicePerSlotLevel: z.number().int().min(0).optional(),
});

// Temporary HP grant. Used by False Life (1d4 + 4 temp HP, +5 per
// slot above 1st). Per RAW, temp HP doesn't stack — applying a new
// grant takes the larger of the current temp pool and the new
// amount. The reducer handles that (applyTempHPGranted). The planner
// rolls the dice + flat + slot scaling once per target and emits
// one TempHPGranted event each.
const SpellTempHPMechanicSchema = z.object({
  kind: z.literal('temp-hp'),
  amountDice: DiceExpressionSchema.optional(),
  flatAmount: z.number().int().min(0).optional(),
  extraPerSlotLevel: z.number().int().min(0).optional(),
});

// No save, no attack roll — fires N independent darts at the targets, with
// each target taking one dart's damage rolled separately. Used by Magic
// Missile and similar auto-hit spells. The targetIds list is expected to
// have one entry per dart (Magic Missile targets the same creature
// multiple times by repeating it).
const SpellAutoHitMechanicSchema = z.object({
  kind: z.literal('auto-hit'),
  damageDicePerDart: DiceExpressionSchema,
  damageType: DamageTypeSchema,
  dartsAtBaseSlot: z.number().int().min(1),
  extraDartsPerSlotLevel: z.number().int().min(0).default(0),
});

// Applies a beneficial condition to each willing target with no save
// (Bless, Aid, etc.). The condition's effects supply the actual bonuses;
// concentration spells track the applied conditions so they're cleared
// when concentration ends.
//
// The condition is normally fixed (`conditionId`). Spells that let the
// caster pick a variant at cast time (Enlarge/Reduce: enlarge or
// reduce; Bestow Curse: one of four curse pools) omit `conditionId`
// and set `casterChoosesVariant` listing each variant's `key` and the
// `conditionId` it applies. Exactly one of the two must be set; the
// planner validates at cast time.
//
// `appliedConditionLevel` (slice 124) stamps an initial `level` on the
// emitted ConditionApplied. Lets a buff carry a pool count
// (Mirror Image: 3 duplicates) at cast time. Omitted = no level.
const SpellBuffMechanicSchema = z.object({
  kind: z.literal('buff'),
  conditionId: z.string().optional(),
  casterChoosesVariant: z
    .object({
      variants: z
        .array(
          z.object({
            key: z.string(),
            conditionId: z.string(),
          }),
        )
        .min(2),
    })
    .optional(),
  appliedConditionLevel: z.number().int().min(1).optional(),
});

// Strips one of a fixed list of conditions from each target (Lesser
// Restoration removes one of: blinded / deafened / paralyzed /
// poisoned). The planner emits a ConditionRemoved event for the first
// matching condition the target currently has from the eligible list;
// if the target has none of them, nothing happens. The spell still
// resolves as a cast (declared + slot consumed); the lack of effect is
// a feature, not an error.
const SpellRemoveConditionMechanicSchema = z.object({
  kind: z.literal('remove-condition'),
  eligibleConditionIds: z.array(z.string()).min(1),
});

// Rolls a pool of dice; the total is "how many hit points of creatures"
// the spell can knock out. Targets within range are walked in ascending
// order of current HP — each target's full HP is subtracted from the
// pool and `conditionId` (typically `unconscious`) is applied, until
// the pool can no longer cover the next target. Used by Sleep. The
// planner skips targets that already have `conditionId` (per the 2024
// Sleep rewrite, an already-unconscious creature isn't affected).
const SpellHPPoolKnockoutMechanicSchema = z.object({
  kind: z.literal('hp-pool-knockout'),
  poolDice: DiceExpressionSchema,
  extraPoolDicePerSlotLevel: DiceExpressionSchema.optional(),
  conditionId: z.string(),
});

// Concentration aura that ticks per-trigger against creatures in
// range. Cast-time emits ConcentrationStarted only — no save or
// damage fires. The consumer calls `engine.plan.tickAura({ casterId,
// targetIds })` at the appropriate moments (entering the area /
// starting a turn in it, per RAW) and the engine rolls a save (if
// configured) and applies damage and/or a condition per target.
//
// Used by Spirit Guardians (damage-only with save), Stinking Cloud
// (condition-only with save), the Wall-of-X family (damage + half
// on save), Entangle / Grease (condition-only with save), Cloud
// of Daggers (auto-damage no save), and similar persistent area
// effects.
//
// Optionality matrix:
// - `saveAbility` omitted → no save roll; damage / condition apply
//   unconditionally (Cloud of Daggers: 4d4 slashing every turn).
// - `damageDice` / `damageType` omitted → condition-only zone
//   (Stinking Cloud, Entangle).
// - `conditionOnFail` set → applies the condition when the save
//   fails (or unconditionally when no save). Gated by the target's
//   existing condition immunities via `isImmuneToCondition`.
// The optional `trigger` field tags a mechanic with a specific
// activation moment so multi-component zones (Hunger of Hadar:
// 2d6 cold on enter + 2d6 acid on turn end) can express both
// components as sibling mechanics. The tickAura intent carries a
// matching trigger; the planner fires only matching mechanics.
// Mechanics without a trigger are "legacy" / unconstrained — they
// fire on every tickAura call (preserving backward compat with
// Spirit Guardians and the other single-component zones).
export const AURA_TRIGGERS = ['on-enter', 'on-turn-start', 'on-turn-end'] as const;
const AuraTriggerSchema = z.enum(AURA_TRIGGERS);
export type AuraTrigger = z.infer<typeof AuraTriggerSchema>;

// Recurring per-turn effect that the consumer ticks via
// `engine.plan.tickRecurring({ casterId, targetId })` at the start
// of each target's turn (or end of caster's, per the spell's RAW).
// Used by Heroism (temp HP per turn while concentrating) and
// similar effects. Cast-time emits ConcentrationStarted only; the
// recurring grant fires on each tick.
//
// `effect` selects the per-tick event kind:
// - 'temp-hp' emits TempHPGranted (Heroism)
// - 'heal' emits Healed (Aura of Vitality)
// - 'damage' emits DamageApplied with the named damageType
//   (Phantasmal Force, Hex damage rider when re-shaped this way)
//
// `addCasterAbilityMod`, when set, adds the caster's named ability
// modifier to the rolled / flat amount (Heroism: +CHA mod).
const SpellRecurringMechanicSchema = z.object({
  kind: z.literal('recurring'),
  effect: z.enum(['temp-hp', 'heal', 'damage']),
  amountDice: DiceExpressionSchema.optional(),
  flatAmount: z.number().int().min(0).optional(),
  addCasterAbilityMod: AbilityScoreSchema.optional(),
  damageType: DamageTypeSchema.optional(),
  // Slice 503: per-tick upcast scaling. Each slot level above the spell's
  // base level adds this many dice of `amountDice` to every tick. Canonical
  // user: Ensnaring Strike ("The damage increases by 1d6 for each spell
  // slot level above 1"). The recurring planner reads the cast slot level
  // from the bound EffectInstance.
  extraDicePerSlotLevel: z.number().int().min(0).optional(),
});

// Per-foot-moved damage zone. The classic Spike Growth shape:
// "creature that moves into or within the area takes 2d4 piercing
// for every 5 ft it travels." No save, no concentration tick — the
// consumer detects movement through the zone and calls
// `engine.plan.tickMovementDamage({ casterId, targetId, feetMoved })`,
// which rolls `damageDicePerFiveFeet` * floor(feetMoved / 5) dice
// and emits a single DamageApplied. Distinct from aura-damage's
// per-tick semantics so the two stay legible.
const SpellMovementDamageMechanicSchema = z.object({
  kind: z.literal('movement-damage'),
  rangeFeet: z.number().int().min(0),
  damageDicePerFiveFeet: DiceExpressionSchema,
  damageType: DamageTypeSchema,
});

const SpellAuraDamageMechanicSchema = z.object({
  kind: z.literal('aura-damage'),
  rangeFeet: z.number().int().min(0),
  saveAbility: AbilityScoreSchema.optional(),
  damageDice: DiceExpressionSchema.optional(),
  damageType: DamageTypeSchema.optional(),
  halfOnSuccess: z.boolean().default(true),
  extraDicePerSlotLevel: z.number().int().min(0).optional(),
  conditionOnFail: z.string().optional(),
  trigger: AuraTriggerSchema.optional(),
});

// Creates a controllable companion ("summon") under the caster's
// control. Each summon spell carries its statblock inline so a pack
// can wire a spell without referencing an external creature
// catalogue. HP scales with slot level as
// `hpBase + hpPerSlotAbove * (slotLevel - baseSlotLevel)`. When the
// spell is concentration, the companion is dismissed automatically
// when concentration ends (clearConcentrationEffect walks the
// characters map and removes any whose `summonSource.effectInstanceId`
// matches the ending effect).
const SpellSummonMechanicSchema = z.object({
  kind: z.literal('summon'),
  name: z.string(),
  ac: z.number().int().min(0),
  hpBase: z.number().int().min(1),
  hpPerSlotAbove: z.number().int().min(0).default(0),
  baseSlotLevel: z.number().int().min(1).max(9),
  speedFeet: z.number().int().min(0).default(30),
});

// Primes a trap that fires later via `engine.plan.triggerTrap`. Used
// by Glyph of Warding's Explosive Runes variant (1 charge, caster DC,
// caster-chosen damage type) and Cordon of Arrows (4 charges, fixed
// DC 13, piercing). At cast time the planner pre-bakes the DC and
// damage type into a `TrapArmed` event; the trap lives in
// `state.traps` until its charges are exhausted (`TrapExpired`).
// `fixedDC`, when set, overrides the caster's spell save DC at arm
// time (Cordon of Arrows is RAW DC 13 regardless of caster). Exactly
// one of `damageType` / `casterChoosesDamageType` must be set; the
// planner validates at cast time.
const SpellTrapMechanicSchema = z.object({
  kind: z.literal('trap'),
  saveAbility: AbilityScoreSchema,
  fixedDC: z.number().int().min(1).optional(),
  damageDice: DiceExpressionSchema,
  damageType: DamageTypeSchema.optional(),
  casterChoosesDamageType: z
    .object({
      allowed: z.array(DamageTypeSchema).min(1),
    })
    .optional(),
  halfOnSuccess: z.boolean().default(true),
  charges: z.number().int().min(1),
  label: z.string(),
});

export const SPELL_AREA_SHAPES = ['cone', 'cube', 'line', 'sphere', 'cylinder'] as const;
export const SpellAreaShapeSchema = z.enum(SPELL_AREA_SHAPES);
export type SpellAreaShape = z.infer<typeof SpellAreaShapeSchema>;

export const SpellTargetingSchema = z.object({
  shape: SpellAreaShapeSchema,
  size: z.number().int().min(1),
});
export type SpellTargeting = z.infer<typeof SpellTargetingSchema>;

export const cantripExtraDice = (characterLevel: number): number => {
  let extra = 0;
  for (const threshold of CANTRIP_SCALING_THRESHOLDS) {
    if (characterLevel >= threshold) extra += 1;
  }
  return extra;
};

// Slice 338: HP-threshold tier effect. The spell checks each target's
// current Hit Points against `threshold` and applies one of two arms:
// `atOrBelow` when current HP <= threshold, `above` otherwise. The
// classic Power Word shape. Power Word Kill (the canonical user):
// threshold 100, `destroy` at or below, 12d12 psychic `damage` above.
//
// Each arm is `destroy` (emits CreatureDestroyed, the instant-death
// path that bypasses death saves, slice 323), `damage` (dice + type,
// run through the same mitigation + fatal-damage intercept as any
// other spell damage), or `condition` (applies a condition by id,
// honoring condition immunity; slice 339, Power Word Stun). `above`
// is optional: a spell may have no otherwise-effect. The two-arm shape
// extends to the tiered Divine Word (a future multi-threshold variant)
// without reshaping the cast dispatch.
const HpThresholdArmSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('destroy') }),
  z.object({
    kind: z.literal('damage'),
    damageDice: DiceExpressionSchema,
    damageType: DamageTypeSchema,
  }),
  z.object({ kind: z.literal('condition'), conditionId: z.string() }),
]);
export type HpThresholdArm = z.infer<typeof HpThresholdArmSchema>;

const SpellHpThresholdMechanicSchema = z.object({
  kind: z.literal('hp-threshold'),
  threshold: z.number().int().min(1),
  atOrBelow: HpThresholdArmSchema,
  above: HpThresholdArmSchema.optional(),
});

// Slice 495: positioned AOE-zone spell (Fog Cloud, Darkness, Silent
// Image, Stinking Cloud, Silence, etc.). The mechanic is a pure marker
// — when present, the cast-spell planner reads the spell's `targeting`
// (shape + size) and the intent's `targetPosition` and stamps a `zone`
// field on the emitted ConcentrationStarted event. The reducer
// persists the zone on the EffectInstance, so consumers can read the
// positioned AOE from live state. Concentration drop removes the
// EffectInstance, removing the zone naturally. The engine doesn't
// auto-apply the zone's RAW effect (heavy obscurement, magical
// darkness, illusion render, etc.) — that stays consumer-managed since
// position-aware enforcement requires the consumer's scene model.
const SpellZoneMechanicSchema = z
  .object({
    kind: z.literal('zone'),
  })
  .strict();

// Slice 499: item-creation. Mints `quantity` fresh instances of
// `itemDefinitionId` directly into the caster's inventory (the planner
// emits one ItemAcquired-with-characterId per instance). Canonical
// user: Goodberry ("Ten berries appear in your hand... eat one berry
// restores 1 Hit Point"), modeled as 10 single-use `goodberry`
// consumables (the engine's consume path removes a whole instance, so
// each berry is its own instance rather than one qty-10 stack).
// Consumers manage the spell's wall-clock expiry (Goodberry's berries
// vanish after 24h); the engine doesn't time-expire created items.
const SpellCreateItemMechanicSchema = z
  .object({
    kind: z.literal('create-item'),
    itemDefinitionId: z.string(),
    quantity: z.number().int().min(1),
  })
  .strict();

// Slice 494: weapon-attack-via-spell. Canonical user: True Strike RAW
// (2024 cantrip): "you make one attack with the weapon used in the
// spell's casting. The attack uses your spellcasting ability for the
// attack and damage rolls instead of using Strength or Dexterity."
// The weapon is named on the cast intent (weaponInstanceId); the
// mechanic flag drives the cast-spell planner to call resolveAttack
// with the abilityOverride set to the caster's spellcasting ability.
// Damage-type choice (radiant-or-normal) and cantrip-scaling extra
// radiant are deferred — the first ship leaves damage at the weapon's
// printed type and skips the L5/L11/L17 bonus.
const SpellWeaponAttackMechanicSchema = z
  .object({
    kind: z.literal('weaponAttack'),
  })
  .strict();

// Slice 501: weapon-transformation buff. Canonical user: Shillelagh
// (2024 Druid cantrip): imbues a held Club or Quarterstaff so its
// attack + damage rolls use the caster's spellcasting ability instead
// of Strength, its damage die becomes a d8, and (caster's choice) its
// damage can be Force. The weapon is named on the cast intent
// (`weaponInstanceId`); the planner stamps an `ItemBuffApplied` (no
// concentration link, since Shillelagh is a 1-minute non-concentration
// effect with consumer-managed expiry) carrying the chosen overrides
// onto the instance. The attack resolver + attack-bonus derive read
// them back when the weapon is next used.
//
// - `useSpellcastingAbility`: when true, attack + damage use the caster's
//   spellcasting ability (stamped as the buff's `abilityOverride`).
// - `damageDieOverride`: replaces the weapon's printed damage die
//   (Shillelagh: `1d8`).
// - `damageTypeChoice`: the caster may pick one of `allowed` to override
//   the weapon's damage type. The planner reads `intent.casterChoice`
//   (kind 'damageType'); when the pick is in `allowed` it stamps a fixed
//   `damageTypeOverride`, otherwise the weapon's normal type stands.
//
// Documented RAW deviation: Shillelagh's damage-type choice is per-hit
// ("If the attack deals damage, it can be Force damage or the weapon's
// normal damage type"). The engine collapses it to a single cast-time
// choice. Force is universally at-least-as-good as bludgeoning, so the
// collapse rarely changes outcomes.
const SpellWeaponBuffMechanicSchema = z
  .object({
    kind: z.literal('weapon-buff'),
    useSpellcastingAbility: z.boolean().optional(),
    damageDieOverride: DiceExpressionSchema.optional(),
    damageTypeChoice: z
      .object({
        allowed: z.array(DamageTypeSchema).min(1),
      })
      .optional(),
  })
  .strict();

export const SpellMechanicSchema = z.discriminatedUnion('kind', [
  SpellAttackMechanicSchema,
  SpellSaveMechanicSchema,
  SpellHealMechanicSchema,
  SpellTempHPMechanicSchema,
  SpellAutoHitMechanicSchema,
  SpellBuffMechanicSchema,
  SpellRemoveConditionMechanicSchema,
  SpellHPPoolKnockoutMechanicSchema,
  SpellAuraDamageMechanicSchema,
  SpellMovementDamageMechanicSchema,
  SpellRecurringMechanicSchema,
  SpellSummonMechanicSchema,
  SpellTrapMechanicSchema,
  SpellHpThresholdMechanicSchema,
  SpellWeaponAttackMechanicSchema,
  SpellWeaponBuffMechanicSchema,
  SpellZoneMechanicSchema,
  SpellCreateItemMechanicSchema,
]);
export type SpellMechanic = z.infer<typeof SpellMechanicSchema>;

export const SpellSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: SpellLevelSchema,
  school: SpellSchoolSchema,
  castingTime: z.string(),
  range: z.string(),
  components: z.object({
    verbal: z.boolean().default(false),
    somatic: z.boolean().default(false),
    material: z.string().optional(),
  }),
  duration: z.string(),
  concentration: z.boolean().default(false),
  ritual: z.boolean().default(false),
  classes: z.array(z.string()).default([]),
  description: z.string().optional(),
  mechanicalEffects: z.array(SpellMechanicSchema).default([]),
  targeting: SpellTargetingSchema.optional(),
})
  // Slice 372: `.strict()` so a top-level field the schema doesn't have
  // fails to parse loudly instead of being silently dropped. Caught a
  // misplaced top-level `cantripScalingDice` map on four cantrips
  // (Ray of Frost / Shocking Grasp didn't scale because the engine only
  // reads the per-mechanic `cantripScalingDice` string).
  .strict();
export type Spell = z.infer<typeof SpellSchema>;
