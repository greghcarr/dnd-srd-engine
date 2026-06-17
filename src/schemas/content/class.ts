import { z } from 'zod';
import {
  AbilityScoreSchema,
  CHARACTER_LEVEL_MAX,
  CHARACTER_LEVEL_MIN,
  HitDieSchema,
  SkillSchema,
} from '../primitives.js';
import { EffectSchema } from '../effects.js';

export const ClassFeatureSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  // Slice 811: dev-only engineering annotation (not player-facing); see
  // the note in item.ts ItemBaseSchema. `description` carries clean
  // SRD-style rules text; implementation notes live here.
  engineNotes: z.string().optional(),
  effects: z.array(EffectSchema).default([]),
});
export type ClassFeature = z.infer<typeof ClassFeatureSchema>;

const LevelEntrySchema = z.object({
  proficiencyBonus: z.number().int().min(2).max(6),
  features: z.array(ClassFeatureSchema).default([]),
  columns: z.record(z.string(), z.union([z.number(), z.string()])).default({}),
});
export type LevelEntry = z.infer<typeof LevelEntrySchema>;

export const SpellcastingProgressionSchema = z.object({
  ability: AbilityScoreSchema,
  type: z.enum(['full', 'half', 'third', 'pact']),
  preparedFormula: z.string().optional(),
});
export type SpellcastingProgression = z.infer<typeof SpellcastingProgressionSchema>;

export const ClassSchema = z.object({
  id: z.string(),
  name: z.string(),
  hitDie: HitDieSchema,
  primaryAbility: z.array(AbilityScoreSchema).min(1),
  // Slice 810: how the 13+ multiclass prerequisite reads `primaryAbility`
  // when the class lists two. RAW 2024 multiclass prerequisites mirror the
  // class's "Primary Ability" phrasing: Fighter is "Strength OR Dexterity"
  // (`any`), while Monk / Paladin / Ranger are "X AND Y" (`all`). Single-
  // ability classes are unaffected (any === all of one). Default `all`;
  // only Fighter overrides to `any`. Read by `validateMulticlass`.
  multiclassAbilityMode: z.enum(['any', 'all']).default('all'),
  savingThrowProficiencies: z.array(AbilityScoreSchema).length(2),
  armorProficiencies: z.array(z.string()).default([]),
  weaponProficiencies: z.array(z.string()).default([]),
  toolProficiencies: z.array(z.string()).default([]),
  // Slice 890: the REDUCED proficiencies a character gains when this class is
  // taken as a MULTICLASS entry (not their origin class). RAW 2024 ("As a
  // Multiclass Character", per class) grants only a subset of the full
  // proficiencies above — e.g. multiclassing into Fighter grants Martial
  // weapons + Light/Medium armor + Shields (NOT Heavy), and NO saving-throw
  // proficiencies (those come only from the origin class). The origin class is
  // `character.classes[0]` (the consumer orders the array so the first entry is
  // the class chosen at creation); entries 1+ use this reduced set. Skill /
  // tool / instrument choices granted on multiclass entry stay consumer-
  // resolved at build time (like the origin class's skill choices), so only
  // armor + weapon tokens live here.
  multiclassProficiencies: z
    .object({
      armor: z.array(z.string()).default([]),
      weapon: z.array(z.string()).default([]),
    })
    .default({ armor: [], weapon: [] }),
  skillChoices: z
    .object({
      choices: z.number().int().min(0),
      from: z.array(SkillSchema),
    })
    .optional(),
  levelTable: z
    .record(
      z
        .string()
        .regex(/^([1-9]|1[0-9]|20)$/, 'Level keys must be 1..20'),
      LevelEntrySchema,
    )
    .superRefine((val, ctx) => {
      for (const key of Object.keys(val)) {
        const n = Number.parseInt(key, 10);
        if (n < CHARACTER_LEVEL_MIN || n > CHARACTER_LEVEL_MAX) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Level key ${key} out of range`,
          });
        }
      }
    }),
  subclassLevel: z.number().int().min(1).max(CHARACTER_LEVEL_MAX).optional(),
  spellcasting: SpellcastingProgressionSchema.optional(),
});
export type Class = z.infer<typeof ClassSchema>;

export const SubclassSchema = z.object({
  id: z.string(),
  parentClassId: z.string(),
  name: z.string(),
  levelGrants: z.record(z.string(), z.array(ClassFeatureSchema)).default({}),
});
export type Subclass = z.infer<typeof SubclassSchema>;
