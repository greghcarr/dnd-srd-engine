import { z } from 'zod';

export const ABILITY_SCORES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
export const AbilityScoreSchema = z.enum(ABILITY_SCORES);
export type AbilityScore = z.infer<typeof AbilityScoreSchema>;

export const ABILITY_SCORE_MIN = 1;
export const ABILITY_SCORE_MAX = 30;
export const AbilityScoreValueSchema = z
  .number()
  .int()
  .min(ABILITY_SCORE_MIN)
  .max(ABILITY_SCORE_MAX);

export const AbilityScoresSchema = z.object({
  STR: AbilityScoreValueSchema,
  DEX: AbilityScoreValueSchema,
  CON: AbilityScoreValueSchema,
  INT: AbilityScoreValueSchema,
  WIS: AbilityScoreValueSchema,
  CHA: AbilityScoreValueSchema,
});
export type AbilityScores = z.infer<typeof AbilityScoresSchema>;

export const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'] as const;
export const SizeSchema = z.enum(SIZES);
export type Size = z.infer<typeof SizeSchema>;

export const CREATURE_TYPES = [
  'Aberration',
  'Beast',
  'Celestial',
  'Construct',
  'Dragon',
  'Elemental',
  'Fey',
  'Fiend',
  'Giant',
  'Humanoid',
  'Monstrosity',
  'Ooze',
  'Plant',
  'Undead',
] as const;
export const CreatureTypeSchema = z.enum(CREATURE_TYPES);
export type CreatureType = z.infer<typeof CreatureTypeSchema>;

export const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
] as const;
export const DamageTypeSchema = z.enum(DAMAGE_TYPES);
export type DamageType = z.infer<typeof DamageTypeSchema>;

export const SKILLS = [
  'acrobatics',
  'animal-handling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleight-of-hand',
  'stealth',
  'survival',
] as const;
export const SkillSchema = z.enum(SKILLS);
export type Skill = z.infer<typeof SkillSchema>;

export const SKILL_ABILITY: Record<Skill, AbilityScore> = {
  acrobatics: 'DEX',
  'animal-handling': 'WIS',
  arcana: 'INT',
  athletics: 'STR',
  deception: 'CHA',
  history: 'INT',
  insight: 'WIS',
  intimidation: 'CHA',
  investigation: 'INT',
  medicine: 'WIS',
  nature: 'INT',
  perception: 'WIS',
  performance: 'CHA',
  persuasion: 'CHA',
  religion: 'INT',
  'sleight-of-hand': 'DEX',
  stealth: 'DEX',
  survival: 'WIS',
};

export const ProficiencyLevelSchema = z.enum(['none', 'half', 'proficient', 'expertise']);
export type ProficiencyLevel = z.infer<typeof ProficiencyLevelSchema>;

export const PROFICIENCY_MULTIPLIER: Record<ProficiencyLevel, number> = {
  none: 0,
  half: 0.5,
  proficient: 1,
  expertise: 2,
};

export const HitDieSchema = z.union([
  z.literal(6),
  z.literal(8),
  z.literal(10),
  z.literal(12),
]);
export type HitDie = z.infer<typeof HitDieSchema>;

export const MovementModeSchema = z.enum(['walk', 'fly', 'swim', 'climb', 'burrow']);
export type MovementMode = z.infer<typeof MovementModeSchema>;

export const SpeedSchema = z.object({
  walk: z.number().int().min(0).default(0),
  fly: z.number().int().min(0).optional(),
  swim: z.number().int().min(0).optional(),
  climb: z.number().int().min(0).optional(),
  burrow: z.number().int().min(0).optional(),
  hover: z.boolean().optional(),
});
export type Speed = z.infer<typeof SpeedSchema>;

export const SenseSchema = z.enum(['darkvision', 'blindsight', 'tremorsense', 'truesight']);
export type Sense = z.infer<typeof SenseSchema>;

export const SensesSchema = z.object({
  darkvision: z.number().int().min(0).optional(),
  blindsight: z.number().int().min(0).optional(),
  tremorsense: z.number().int().min(0).optional(),
  truesight: z.number().int().min(0).optional(),
  passivePerceptionOverride: z.number().int().min(0).optional(),
});
export type Senses = z.infer<typeof SensesSchema>;

export const SpellSchoolSchema = z.enum([
  'abjuration',
  'conjuration',
  'divination',
  'enchantment',
  'evocation',
  'illusion',
  'necromancy',
  'transmutation',
]);
export type SpellSchool = z.infer<typeof SpellSchoolSchema>;

export const SPELL_LEVEL_MIN = 0;
export const SPELL_LEVEL_MAX = 9;
export const SpellLevelSchema = z.number().int().min(SPELL_LEVEL_MIN).max(SPELL_LEVEL_MAX);
export type SpellLevel = z.infer<typeof SpellLevelSchema>;

export const CHARACTER_LEVEL_MIN = 1;
export const CHARACTER_LEVEL_MAX = 20;
export const CharacterLevelSchema = z
  .number()
  .int()
  .min(CHARACTER_LEVEL_MIN)
  .max(CHARACTER_LEVEL_MAX);
export type CharacterLevel = z.infer<typeof CharacterLevelSchema>;

export const EXHAUSTION_MIN = 0;
export const EXHAUSTION_MAX = 6;
export const ExhaustionLevelSchema = z
  .number()
  .int()
  .min(EXHAUSTION_MIN)
  .max(EXHAUSTION_MAX);
export type ExhaustionLevel = z.infer<typeof ExhaustionLevelSchema>;

export const ALIGNMENT_LAW_CHAOS = ['lawful', 'neutral', 'chaotic'] as const;
export const ALIGNMENT_GOOD_EVIL = ['good', 'neutral', 'evil'] as const;
export const AlignmentSchema = z.union([
  z.literal('unaligned'),
  z.literal('any'),
  z.object({
    lawChaos: z.enum(ALIGNMENT_LAW_CHAOS),
    goodEvil: z.enum(ALIGNMENT_GOOD_EVIL),
  }),
]);
export type Alignment = z.infer<typeof AlignmentSchema>;

export const ULIDSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/i, 'Expected a ULID');

export const CurrencySchema = z.object({
  cp: z.number().int().min(0).default(0),
  sp: z.number().int().min(0).default(0),
  ep: z.number().int().min(0).default(0),
  gp: z.number().int().min(0).default(0),
  pp: z.number().int().min(0).default(0),
});
export type Currency = z.infer<typeof CurrencySchema>;

export const CURRENCY_KEYS = ['cp', 'sp', 'ep', 'gp', 'pp'] as const;
export type CurrencyKey = (typeof CURRENCY_KEYS)[number];

export const RechargeSchema = z.enum([
  'shortRest',
  'longRest',
  // Slice 657: RAW for several "rest" resources (Cleric/Paladin
  // Channel Divinity, Druid Wild Shape) is partial: regain 1
  // expended use on a Short Rest, all uses on a Long Rest.
  // applyShortRestEnded restores +1 (capped at max) for resources
  // with this cadence; applyLongRestEnded restores all (same as
  // longRest). Before this primitive, those features used
  // recharge: 'shortRest' as an over-permissive approximation
  // (documented deviation in slice 640 + 650).
  'partialShortFullLong',
  'turn',
  'round',
  'dawn',
  'never',
]);
export type Recharge = z.infer<typeof RechargeSchema>;

export const WEAPON_PROPERTIES = [
  'ammunition',
  'finesse',
  'heavy',
  'light',
  'loading',
  'reach',
  'thrown',
  'two-handed',
  'versatile',
  'special',
] as const;
export const WeaponPropertySchema = z.enum(WEAPON_PROPERTIES);
export type WeaponProperty = z.infer<typeof WeaponPropertySchema>;

export const WEAPON_MASTERIES = [
  'Vex',
  'Topple',
  'Sap',
  'Nick',
  'Push',
  'Slow',
  'Cleave',
  'Graze',
  'Flex',
] as const;
export const WeaponMasterySchema = z.enum(WEAPON_MASTERIES);
export type WeaponMastery = z.infer<typeof WeaponMasterySchema>;

export const DiceExpressionSchema = z.string().regex(/^\d+d\d+(?:[+-]\d+)?$/, {
  message: 'Expected dice expression like "2d6", "1d8+3", "3d6-1"',
});
export type DiceExpression = z.infer<typeof DiceExpressionSchema>;
