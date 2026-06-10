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
});
export type MonsterStatblock = z.infer<typeof MonsterStatblockSchema>;
