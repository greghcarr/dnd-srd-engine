import { z } from 'zod';
import {
  AbilityScoresSchema,
  AlignmentSchema,
  CreatureTypeSchema,
  DamageTypeSchema,
  SensesSchema,
  SizeSchema,
  SkillSchema,
  SpeedSchema,
} from '../primitives.js';
import { EffectSchema } from '../effects.js';
import { DiceExpressionSchema } from '../primitives.js';

// Slice 140: breath weapon RAW shape, parameterized so a single
// primitive handles every dragon, golem, and ankheg-style "Recharge
// area-save damage" action. RAW examples:
//   Adult Red Dragon Fire Breath: Recharge 5-6, 60-ft cone,
//     DEX DC 21, 18d6 fire, half on success
//   Young Blue Dragon Lightning Breath: Recharge 5-6, 60-ft line,
//     DEX DC 16, 10d10 lightning, half on success
//   Iron Golem Poison Breath: Recharge 6, 15-ft cone, CON DC 19,
//     10d8 poison, half on success
//   Ankheg Acid Spray: Recharge 6, 30-ft line, DEX DC 13, 3d6 acid,
//     half on success
//
// The engine doesn't model area-of-effect target inclusion (no LOS
// or positional cone / line resolution); consumers supply the
// affected target list directly, same as planThunderStep's ally
// argument. The area shape + size ship as data for consumer display.
//
// `rechargeMin` is the minimum d6 roll that returns the action to
// ready at the start of the bearer's turn. 5 means recharge on a
// roll of 5 or 6 (Dragon style); 6 means recharge on 6 only (Iron
// Golem / Ankheg style). Recharge state lives on the bearer's
// `breathWeaponExpended` runtime flag.

export const BreathWeaponAreaSchema = z.object({
  shape: z.enum(['cone', 'line']),
  sizeFeet: z.number().int().min(1),
});
export type BreathWeaponArea = z.infer<typeof BreathWeaponAreaSchema>;

export const BreathWeaponSpecSchema = z.object({
  // Stable id for consumer display ("fire-breath", "acid-spray").
  // No relationship to other ids in the engine.
  id: z.string(),
  name: z.string(),
  // Minimum d6 roll that returns the action to ready at turn-start.
  // Most dragons: 5 (i.e. 5 or 6 recharges). Iron Golem / Ankheg: 6.
  rechargeMin: z.number().int().min(2).max(6),
  area: BreathWeaponAreaSchema,
  saveAbility: z.enum(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']),
  saveDC: z.number().int().min(1),
  damageDice: DiceExpressionSchema,
  damageType: DamageTypeSchema,
  // RAW: every breath weapon halves damage on a successful save.
  // Field exists for future variants (instant-death breath weapons,
  // breath weapons with no save, etc.).
  halfOnSuccess: z.boolean().default(true),
});
export type BreathWeaponSpec = z.infer<typeof BreathWeaponSpecSchema>;

// Slice 464: statblock-side declaration of a monster's Multiattack
// action. RAW examples (SRD 5.2.1):
//   Ghoul Multiattack: "The ghoul makes two Bite attacks."
//   Brown Bear Multiattack: "one Bite attack and two Claw attacks."
//   Bulette Multiattack: "two Bite attacks."
//
// Each `attacks` entry names a weapon DEFINITION id from the pack
// (e.g. "ghoul-bite") plus how many swings. Consumers mint per-monster
// weapon item instances and bridge to the runtime Character.multiattack
// pattern via runtimeMultiattackFromStatblock (src/derive/multiattack.ts);
// the existing planMultiattack then consumes the runtime pattern.
//
// The runtime pattern uses weaponInstanceId (one per swing source, even
// for "two Bites" where both reuse the same definition) because each
// monster instance owns a unique inventory item. The statblock pattern
// is definition-keyed precisely because content cannot know which
// instances a consumer will mint.
export const MonsterMultiattackSchema = z.object({
  name: z.string(),
  attacks: z.array(
    z.object({
      weaponId: z.string(),
      count: z.number().int().min(1),
    }),
  ).min(1),
});
export type MonsterMultiattack = z.infer<typeof MonsterMultiattackSchema>;

// Slice 788: the statblock's "Actions" — the weapon attacks a monster can
// make, each linking a weapon DEFINITION id in the pack (a natural weapon
// like "wolf-bite", or a mundane weapon like "scimitar"). Closes the
// `no-actions-field` L7 blocker: a single-attack monster's natural weapon was
// previously unlinked, so consumers hardcoded `wolf → wolf-bite` and diverged.
// Now the link is on the statblock and queryable (resolve via
// `monsterAttackActions`). `multiattack` groups these into a per-turn pattern
// ("two Bite attacks"); `actions` is the menu of distinct attack options
// (primary first — combat-fuzz equips `actions[0]`). The `weaponId`s are
// integrity-checked against the pack's weapon definitions.
export const MonsterAttackActionSchema = z.object({
  name: z.string(),
  weaponId: z.string(),
});
export type MonsterAttackAction = z.infer<typeof MonsterAttackActionSchema>;

// Slice 828: a monster "save-action" — an auto-hit action with NO attack
// roll, resolved by a saving throw, where a FAILED save deals damage
// and/or applies condition(s). The Constrict family is the canonical user
// (SRD 5.2.1):
//   Behir Constrict: STR DC 18, one Large-or-smaller creature within 5 ft.
//     Failure: 28 (5d8+6) bludgeoning, Grappled (escape DC 16) + Restrained
//     until the grapple ends.
//   Couatl / Salamander / Constrictor Snake: same shape, different DC /
//     size / dice (Salamander adds a 2d6 Fire component).
// Because there is no attack roll, the slice-321 weapon on-hit-rider
// machinery (which hangs the rider off a *hit*) cannot express these.
//
// Distinct from `breathWeapon` (also auto-hit save-or-effect): a breath
// weapon is an AREA action with recharge whose payload is damage halved on
// a success; a save-action is SINGLE-target, has no recharge, and its
// primary payload is the condition(s) on a FAILED save (damage optional,
// nothing on a success). The `halfDamageOnSuccess` field is present so the
// shape generalizes to the half-on-success save-actions (the Air Elemental
// Whirlwind) without a schema break — though those also need recharge +
// forced-push and stay deferred.
//
// Action economy is NOT modeled here. Constrict is bundled into the
// Multiattack action for the Behir / Salamander (whose Multiattack "uses
// Constrict") yet is a standalone action for the Constrictor Snake, and the
// MonsterMultiattack schema can't express "uses Constrict". So the consumer
// owns whether a save-action costs part of a Multiattack or a full action;
// the planner only resolves the save + payload (mirroring how the runtime
// multiattack pattern is already consumer-sequenced).
export const SaveActionDamageSchema = z.object({
  dice: DiceExpressionSchema,
  type: DamageTypeSchema,
});
export type SaveActionDamage = z.infer<typeof SaveActionDamageSchema>;

export const SaveActionSpecSchema = z.object({
  // Stable id for consumer display + the SaveAction intent ("constrict").
  id: z.string(),
  name: z.string(),
  saveAbility: z.enum(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']),
  saveDC: z.number().int().min(1),
  // RAW "one creature ... within N feet" — reach for consumer display /
  // targeting. The engine doesn't model positions; like every reach value
  // it's data the consumer enforces.
  reachFeet: z.number().int().min(1),
  // RAW "one Large or smaller creature": the largest size the action can
  // target. Omitted = no size restriction. Enforced by the planner (it
  // throws when handed a too-large target, matching the input-validation
  // posture for illegal single-target input).
  maxTargetSize: SizeSchema.optional(),
  // Resolved on a FAILED save. Each damage component is rolled and applied
  // with its own type (Salamander Constrict: bludgeoning + fire); the
  // condition ids are applied with the monster stamped as their source (so
  // a Grappled condition's grappler resolves) plus any autoExpiry. `pushFeet`
  // (Air Elemental Whirlwind: "pushed up to 20 feet straight away") emits an
  // informational `CreaturePushed` — the engine doesn't model positions, so
  // the consumer applies the displacement (as it does every forced move).
  onFail: z.object({
    damage: z.array(SaveActionDamageSchema).default([]),
    applyConditionIds: z.array(z.string()).default([]),
    pushFeet: z.number().int().min(0).optional(),
    // Slice 834: undead Life Drain on a save-action (Wight Life Drain). When
    // true, a failed save reduces the target's Hit Point maximum by the
    // post-mitigation damage taken (the same `life-drained` mechanism the
    // slice-832 weapon `drainsMaxHp` flag uses), restored on a Long Rest.
    drainMaxHp: z.boolean().optional(),
  }),
  // RAW most save-actions do nothing on a success; the Air Elemental
  // Whirlwind's "Success: Half damage only" is the exception. Damage
  // components are halved (each floored) on a successful save when true; the
  // failure-only payload (conditions, push) never applies on a success.
  halfDamageOnSuccess: z.boolean().default(false),
  // Slice 829: optional Recharge gating (Air Elemental Whirlwind is
  // "Recharge 4–6"). When present, the action expends on use and returns to
  // ready at the bearer's turn-start on a d6 ≥ rechargeMin — the same
  // economy as `breathWeapon`, tracked per save-action id on the bearer's
  // `expendedSaveActionIds`. Absent (Constrict) = always available.
  recharge: z
    .object({ rechargeMin: z.number().int().min(2).max(6) })
    .optional(),
});
export type SaveActionSpec = z.infer<typeof SaveActionSpecSchema>;

// Slice 836: the ooze Split trait (Black Pudding / Ochre Jelly). RAW (SRD
// 5.2.1): "While the [ooze] is Large or Medium and has 10+ Hit Points, it
// becomes Bloodied or is subjected to Lightning or Slashing damage [trigger];
// the [ooze] splits into two new [oozes], each one size smaller, the original's
// Hit Points divided evenly (round down)." The TRIGGER (took slashing/lightning,
// or became bloodied) is consumer-detected — it has the DamageApplied events +
// HP; the consumer then calls `engine.plan.oozeSplit`, which resolves the
// mechanical split (two one-smaller copies at half HP, the original removed).
// Placement + initiative insertion stay consumer-managed (positions / encounter
// are out of engine scope). `damageTypes` is the trigger metadata the consumer
// reads; `minHp` is the engine-validated floor.
export const OozeSplitSpecSchema = z.object({
  damageTypes: z.array(DamageTypeSchema).default(['slashing', 'lightning']),
  minHp: z.number().int().min(1).default(10),
});
export type OozeSplitSpec = z.infer<typeof OozeSplitSpecSchema>;

// Slice 839: Legendary Resistance (SRD 5.2.1). "If the creature fails a saving
// throw, it can choose to succeed instead." A per-day budget (3/Day; some
// creatures 4/Day, or +1 In Lair). Consumer-driven, the Shield `preventedHit`
// shape: the consumer (which orchestrates the encounter + sees the failed save)
// calls `engine.plan.legendaryResistance`, the engine confirms the budgeted
// spend (throwing when exhausted) and emits `LegendaryResistanceUsed`, and the
// consumer treats the triggering save as a success (drops the fail
// consequences). `inLair` is a consumer fact (positional). The budget resets on
// a Long Rest (the 2024 X/Day default).
export const LegendaryResistanceSpecSchema = z.object({
  usesPerDay: z.number().int().min(1),
  usesPerDayInLair: z.number().int().min(1).optional(),
});
export type LegendaryResistanceSpec = z.infer<typeof LegendaryResistanceSpecSchema>;

// Slice 840: Legendary Actions (SRD 5.2.1). "Legendary Action Uses: N (M in
// Lair). Immediately after another creature's turn, the creature can expend a
// use to take one of the following actions. It regains all expended uses at the
// start of each of its turns." `uses` is the pool; `actions` is the menu (each
// `name` + a `cost` in uses, default 1). The engine owns the BUDGET (the pool +
// the turn-start refresh + the validated spend via `engine.plan.legendaryAction`,
// emitting `LegendaryActionUsed`); the "after another creature's turn" timing is
// consumer-orchestrated and the underlying game action (a Tentacle attack, a
// save-action) is dispatched separately by the consumer. `usesInLair` raises the
// pool (a consumer `inLair` fact).
export const LegendaryActionsSpecSchema = z.object({
  uses: z.number().int().min(1),
  usesInLair: z.number().int().min(1).optional(),
  actions: z
    .array(z.object({ name: z.string(), cost: z.number().int().min(1).default(1) }))
    .min(1),
});
export type LegendaryActionsSpec = z.infer<typeof LegendaryActionsSpecSchema>;

export const MonsterStatblockSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: SizeSchema,
  type: CreatureTypeSchema,
  subtype: z.string().optional(),
  alignment: AlignmentSchema.default('unaligned'),
  ac: z.number().int().min(0),
  hp: z.object({
    average: z.number().int().min(1),
    formula: z.string(),
  }),
  speed: SpeedSchema,
  abilityScores: AbilityScoresSchema,
  savingThrows: z.record(z.string(), z.number().int()).optional(),
  skills: z.record(SkillSchema, z.number().int()).optional(),
  damageResistances: z.array(DamageTypeSchema).default([]),
  damageImmunities: z.array(DamageTypeSchema).default([]),
  damageVulnerabilities: z.array(DamageTypeSchema).default([]),
  conditionImmunities: z.array(z.string()).default([]),
  senses: SensesSchema.optional(),
  languages: z.array(z.string()).default([]),
  cr: z.number().min(0),
  xp: z.number().int().min(0),
  proficiencyBonus: z.number().int().min(2).max(9),
  traits: z.array(EffectSchema).default([]),
  breathWeapon: BreathWeaponSpecSchema.optional(),
  multiattack: MonsterMultiattackSchema.optional(),
  actions: z.array(MonsterAttackActionSchema).default([]),
  // Slice 828: auto-hit save-or-effect actions (Constrict). Array (a
  // monster could print more than one) defaulting to [] so every existing
  // statblock is byte-unchanged.
  saveActions: z.array(SaveActionSpecSchema).default([]),
  // Slice 836: the ooze Split trait (Black Pudding / Ochre Jelly). Optional —
  // absent for every non-ooze statblock.
  split: OozeSplitSpecSchema.optional(),
  // Slice 839: Legendary Resistance (Aboleth / Sphinx of Lore / Unicorn).
  // Optional — absent for non-legendary statblocks.
  legendaryResistance: LegendaryResistanceSpecSchema.optional(),
  // Slice 840: Legendary Actions (the Aboleth in scope). Optional.
  legendaryActions: LegendaryActionsSpecSchema.optional(),
});
export type MonsterStatblock = z.infer<typeof MonsterStatblockSchema>;
