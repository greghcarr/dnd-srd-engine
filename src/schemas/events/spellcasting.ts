import { z } from 'zod';
import { SpellLevelSchema, ULIDSchema } from '../primitives.js';
import { EventEnvelopeSchema } from './envelope.js';

export const SpellSlotSourceSchema = z.enum(['standard', 'pact']);
export type SpellSlotSource = z.infer<typeof SpellSlotSourceSchema>;

export const SpellCastDeclaredEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('SpellCastDeclared'),
  characterId: ULIDSchema,
  spellId: z.string(),
  slotLevel: SpellLevelSchema,
  slotSource: SpellSlotSourceSchema,
  targetIds: z.array(ULIDSchema).default([]),
  castAsRitual: z.boolean().default(false),
});
export type SpellCastDeclaredEvent = z.infer<typeof SpellCastDeclaredEventSchema>;

// Slice 682: marker event — the cast attempt fizzled per a
// pre-cast gate (today the only user is Slow's d20-vs-11 V/S
// component check). The cast's action IS consumed per RAW but the
// slot is NOT, and no mechanical effects fire. The reducer is a
// no-op (transcript-only); the planner returns early after
// emitting this event + the ActionEconomyConsumed for the cast's
// action.
export const SpellCastFizzledEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('SpellCastFizzled'),
  characterId: ULIDSchema,
  spellId: z.string(),
  reason: z.enum(['slow-spell-v-or-s-d20-failed']),
  d20: z.number().int().min(1).max(20).optional(),
});
export type SpellCastFizzledEvent = z.infer<typeof SpellCastFizzledEventSchema>;

export const SpellSlotConsumedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('SpellSlotConsumed'),
  characterId: ULIDSchema,
  slotLevel: SpellLevelSchema,
});
export type SpellSlotConsumedEvent = z.infer<typeof SpellSlotConsumedEventSchema>;

export const PactSlotConsumedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('PactSlotConsumed'),
  characterId: ULIDSchema,
});
export type PactSlotConsumedEvent = z.infer<typeof PactSlotConsumedEventSchema>;

// Slice 637: emitted when a feature gives back previously-spent pact
// slots mid-rest (Warlock L2 Magical Cunning: regain up to ceil(max/2)
// expended Pact Magic slots as part of a 1-minute esoteric rite;
// Warlock L20 Eldritch Master uses the same shape with `count: 'all'`
// when that planner lands). Reducer decrements `pactSlotsUsed` by
// `count`, clamped at 0.
export const PactSlotsRegainedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('PactSlotsRegained'),
  characterId: ULIDSchema,
  count: z.number().int().min(1),
  source: z.string(),
});
export type PactSlotsRegainedEvent = z.infer<typeof PactSlotsRegainedEventSchema>;

// Slice 721: regain expended STANDARD spell slots of a given level (the
// sibling of PactSlotsRegained for the standard slot table). Druid Wild
// Resurgence (expend a Wild Shape use to regain a level-1 slot) is the
// first user. Reducer decrements `spellSlotsUsed[slotLevel]` by `count`,
// clamped at 0.
export const SpellSlotsRegainedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('SpellSlotsRegained'),
  characterId: ULIDSchema,
  slotLevel: z.number().int().min(1).max(9),
  count: z.number().int().min(1),
  source: z.string(),
});
export type SpellSlotsRegainedEvent = z.infer<typeof SpellSlotsRegainedEventSchema>;

// Slice 724: swap one prepared spell for another from the spellbook
// (Wizard L5 Memorize Spell). Reducer removes `removed` from and adds
// `added` to `preparedSpells`. The engine doesn't enforce prepared-spell
// counts, so this is the mechanical realization of the swap, not a
// count-gated re-preparation.
export const PreparedSpellsChangedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('PreparedSpellsChanged'),
  characterId: ULIDSchema,
  removed: z.string(),
  added: z.string(),
  source: z.string(),
});
export type PreparedSpellsChangedEvent = z.infer<typeof PreparedSpellsChangedEventSchema>;

// Slice 486: emitted when a cast consumes a oncePerLongRest free cast
// from a GrantSpell grant (Magic Initiate, Warlock Contact Patron).
// Reducer pushes `spellId` onto the bearer's `usedFreeCastSpellIds`;
// the long-rest reducer clears that list. Cast-spell planner emits
// this alongside SpellCastDeclared (no SpellSlotConsumed) when the
// intent's `useFreeCast: true` flag is set and the validation gate
// passes.
export const FreeCastUsedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('FreeCastUsed'),
  characterId: ULIDSchema,
  spellId: z.string(),
});
export type FreeCastUsedEvent = z.infer<typeof FreeCastUsedEventSchema>;

// Slice 794: emitted when a cast consumes one of an NPC's per-long-rest
// "N/Day Each" uses (a GrantSpell with `preparation: 'perLongRest'`).
// Reducer increments the bearer's `perDayCastsUsed[spellId]`; the
// long-rest reducer clears the map. Emitted alongside SpellCastDeclared
// (no SpellSlotConsumed) when `useFreeCast: true` matches a perLongRest
// grant and the per-spell count is still below `usesPerLongRest`.
export const PerDayCastUsedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('PerDayCastUsed'),
  characterId: ULIDSchema,
  spellId: z.string(),
});
export type PerDayCastUsedEvent = z.infer<typeof PerDayCastUsedEventSchema>;
