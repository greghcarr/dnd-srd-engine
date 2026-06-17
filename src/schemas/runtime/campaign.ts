import { z } from 'zod';
import { ULIDSchema } from '../primitives.js';
import { CharacterSchema } from './character.js';
import { ItemInstanceSchema } from './item-instance.js';
import { PendingChoiceSchema } from './pending-choice.js';
import { EncounterSchema } from './encounter.js';
import { EffectInstanceSchema } from './effect-instance.js';
import { PartySchema } from './party.js';
import { SessionSchema, JournalEntrySchema } from './session.js';
import { InGameTimeSchema } from './in-game-time.js';
import { LocationSchema, DoorSchema } from './location.js';
import { QuestSchema } from './quest.js';
import { MilestoneKindSchema } from '../events/quests.js';
import { VehicleSchema } from './vehicle.js';
import { TravelLegSchema } from './travel.js';
import { DowntimeLogEntrySchema } from './downtime.js';
import { BastionSchema } from './bastion.js';
import { TrapSchema } from './trap.js';
import { SensorSchema } from './sensor.js';
import { IllusionSchema } from './illusion.js';
import { CampaignSettingsSchema, defaultCampaignSettings } from './settings.js';

export const CampaignStateSchema = z.object({
  characters: z.record(ULIDSchema, CharacterSchema).default({}),
  itemInstances: z.record(ULIDSchema, ItemInstanceSchema).default({}),
  pendingChoices: z.record(ULIDSchema, PendingChoiceSchema).default({}),
  encounters: z.record(ULIDSchema, EncounterSchema).default({}),
  effectInstances: z.record(ULIDSchema, EffectInstanceSchema).default({}),
  parties: z.record(ULIDSchema, PartySchema).default({}),
  sessions: z.record(ULIDSchema, SessionSchema).default({}),
  journalEntries: z.record(ULIDSchema, JournalEntrySchema).default({}),
  locations: z.record(ULIDSchema, LocationSchema).default({}),
  doors: z.record(ULIDSchema, DoorSchema).default({}),
  characterLocations: z.record(ULIDSchema, ULIDSchema).default({}),
  quests: z.record(ULIDSchema, QuestSchema).default({}),
  vehicles: z.record(ULIDSchema, VehicleSchema).default({}),
  travelLog: z.array(TravelLegSchema).default([]),
  downtimeLog: z.array(DowntimeLogEntrySchema).default([]),
  toolProficienciesByCharacter: z.record(ULIDSchema, z.array(z.string())).default({}),
  bastions: z.record(ULIDSchema, BastionSchema).default({}),
  traps: z.record(ULIDSchema, TrapSchema).default({}),
  sensors: z.record(ULIDSchema, SensorSchema).default({}),
  illusions: z.record(ULIDSchema, IllusionSchema).default({}),
  settings: CampaignSettingsSchema.default(defaultCampaignSettings()),
  milestones: z
    .array(
      z.object({
        kind: MilestoneKindSchema,
        title: z.string(),
        atIso: z.string(),
        partyId: ULIDSchema.optional(),
        questId: ULIDSchema.optional(),
      }),
    )
    .default([]),
  inGameTime: InGameTimeSchema.default({ totalMinutes: 0 }),
  // Slice 898: per-character in-game time (minutes) at which that character last
  // finished a Long Rest. Written by `applyLongRestEnded`, read by the
  // `enforceLongRestCadence` gate in `planLongRest` (SRD 16-hour cadence). A
  // character with no entry has never long-rested under cadence tracking.
  lastLongRestEndMinutesByCharacter: z.record(ULIDSchema, z.number().int().min(0)).default({}),
  activeSessionId: ULIDSchema.optional(),
  activeShortRest: z
    .object({
      startedAtEventId: ULIDSchema,
      participantIds: z.array(ULIDSchema),
    })
    .optional(),
  activeLongRest: z
    .object({
      startedAtEventId: ULIDSchema,
      participantIds: z.array(ULIDSchema),
    })
    .optional(),
  activeEncounterId: ULIDSchema.optional(),
  version: z.number().int().min(0).default(0),
});
export type CampaignState = z.infer<typeof CampaignStateSchema>;

export const emptyCampaignState = (): CampaignState => ({
  characters: {},
  itemInstances: {},
  pendingChoices: {},
  encounters: {},
  effectInstances: {},
  parties: {},
  sessions: {},
  journalEntries: {},
  locations: {},
  doors: {},
  characterLocations: {},
  quests: {},
  vehicles: {},
  travelLog: [],
  downtimeLog: [],
  toolProficienciesByCharacter: {},
  bastions: {},
  traps: {},
  sensors: {},
  illusions: {},
  settings: defaultCampaignSettings(),
  milestones: [],
  inGameTime: { totalMinutes: 0 },
  lastLongRestEndMinutesByCharacter: {},
  version: 0,
});
