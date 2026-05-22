import { z } from 'zod';
import { ULIDSchema } from '../primitives.js';

export const EncounterStatusSchema = z.enum(['planning', 'active', 'ended']);
export type EncounterStatus = z.infer<typeof EncounterStatusSchema>;

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type Position = z.infer<typeof PositionSchema>;

export const TurnUsageSchema = z.object({
  actionUsed: z.boolean().default(false),
  bonusActionUsed: z.boolean().default(false),
  attacksMadeThisTurn: z.number().int().min(0).default(0),
  reactionUsedThisRound: z.boolean().default(false),
  feetMovedThisTurn: z.number().min(0).default(0),
  dashed: z.boolean().default(false),
  disengaged: z.boolean().default(false),
  // Item-instance ids of any weapons with the `loading` property that
  // were fired this turn. RAW Loading: a Loading weapon can fire only
  // one piece of ammunition per attack action / bonus action / reaction.
  // Reset alongside the other per-turn flags at TurnStarted.
  loadedWeaponsFiredThisTurn: ULIDSchema.array().default([]),
  // Barbarian Reckless Attack toggle. Set when the combatant activates
  // Reckless Attack on their turn; resolved attacks made by this
  // combatant gain advantage on melee STR attack rolls, and attack
  // rolls against this combatant have advantage. Cleared on the next
  // TurnStarted (which matches RAW: "until the start of your next turn").
  recklessAttackActive: z.boolean().default(false),
  // Monk Stunning Strike "once per turn" gate. Set when the Monk
  // attempts a Stunning Strike, cleared at TurnStarted.
  stunningStrikeUsedThisTurn: z.boolean().default(false),
  // Rogue Withdraw (Cunning Strike): the high-water-mark of
  // `feetMovedThisTurn` up to which movement does NOT provoke Opportunity
  // Attacks (RAW "move up to half your Speed without provoking"). Distinct
  // from `disengaged`, which suppresses provocation for the whole turn's
  // movement; this caps the no-provoke distance. 0 = no allowance. Cleared
  // at TurnStarted.
  noProvokeMovementUpToFeet: z.number().min(0).default(0),
});
export type TurnUsage = z.infer<typeof TurnUsageSchema>;

export const EMPTY_TURN_USAGE: TurnUsage = {
  actionUsed: false,
  bonusActionUsed: false,
  attacksMadeThisTurn: 0,
  reactionUsedThisRound: false,
  feetMovedThisTurn: 0,
  dashed: false,
  disengaged: false,
  loadedWeaponsFiredThisTurn: [],
  recklessAttackActive: false,
  stunningStrikeUsedThisTurn: false,
  noProvokeMovementUpToFeet: 0,
};

export const CombatantSchema = z.object({
  combatantId: ULIDSchema,
  initiative: z.number().int(),
  initiativeOrder: z.number().int().min(0),
  hasActedThisRound: z.boolean().default(false),
  turnUsage: TurnUsageSchema.default(EMPTY_TURN_USAGE),
  position: PositionSchema.optional(),
});
export type Combatant = z.infer<typeof CombatantSchema>;

export const EncounterSchema = z.object({
  id: ULIDSchema,
  name: z.string().optional(),
  status: EncounterStatusSchema,
  combatants: z.array(CombatantSchema).default([]),
  round: z.number().int().min(0),
  activeIndex: z.number().int().min(0),
  startedAtEventId: ULIDSchema.optional(),
  endedAtEventId: ULIDSchema.optional(),
  outcome: z.enum(['victory', 'defeat', 'fled', 'parley']).optional(),
});
export type Encounter = z.infer<typeof EncounterSchema>;
