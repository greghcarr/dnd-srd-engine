import { z } from 'zod';
import { EventEnvelopeSchema } from './envelope.js';
import { ULIDSchema, WeaponMasterySchema } from '../primitives.js';

export const WeaponMasteryActivatedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('WeaponMasteryActivated'),
  mastery: WeaponMasterySchema,
  attackerId: ULIDSchema,
  targetId: ULIDSchema.optional(),
  weaponInstanceId: ULIDSchema,
});
export type WeaponMasteryActivatedEvent = z.infer<typeof WeaponMasteryActivatedEventSchema>;

// Slice 502: records a character's 2024 Weapon Mastery selection (the
// weapon kinds they've mastered). The reducer overwrites
// `character.weaponMasteries` with `weaponDefinitionIds`, so this event
// both establishes and replaces the selection (re-choosable on a Long
// Rest by emitting it again). `planChooseWeaponMasteries` validates the
// choice against the character's mastery slot budget + proficiency.
export const WeaponMasteriesChosenEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('WeaponMasteriesChosen'),
  characterId: ULIDSchema,
  weaponDefinitionIds: z.array(z.string()),
});
export type WeaponMasteriesChosenEvent = z.infer<typeof WeaponMasteriesChosenEventSchema>;
