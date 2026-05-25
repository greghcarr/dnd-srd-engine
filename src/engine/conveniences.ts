import { z } from 'zod';
import type { Campaign } from './commit.js';
import type { Engine, PlanResult } from './index.js';
import { commit } from './commit.js';
import { replay } from './replay.js';
import { CharacterSchema, type Character } from '../schemas/runtime/character.js';
import { EventSchema, type Event } from '../schemas/events/index.js';
import { newCharacterId } from '../ids.js';
import { SCHEMA_VERSION } from '../version.js';

/**
 * Plan + commit in one call. Dispatches the intent to the right planner
 * by its `type` tag and appends the resulting events to the campaign.
 */
export const performIntent = (
  engine: Engine,
  campaign: Campaign,
  intent: { readonly type: string } & Record<string, unknown>,
): Campaign => {
  const dispatch: Readonly<Record<string, (i: never) => PlanResult>> = {
    Attack: (i) => engine.plan.attack(campaign.state, i),
    OpportunityAttack: (i) => engine.plan.opportunityAttack(campaign.state, i),
    ShortRest: (i) => engine.plan.shortRest(campaign.state, i),
    LongRest: (i) => engine.plan.longRest(campaign.state, i),
    CastSpell: (i) => engine.plan.castSpell(campaign.state, i),
    CheckConcentration: (i) => engine.plan.checkConcentration(campaign.state, i),
    Save: (i) => engine.plan.save(campaign.state, i),
    AbilityCheck: (i) => engine.plan.abilityCheck(campaign.state, i),
    LevelUp: (i) => engine.plan.levelUp(campaign.state, i),
    ResolveChoice: (i) => engine.plan.resolveChoice(campaign.state, i),
    Move: (i) => engine.plan.move(campaign.state, i),
    Dash: (i) => engine.plan.dash(campaign.state, i),
    Disengage: (i) => engine.plan.disengage(campaign.state, i),
    ActionSurge: (i) => engine.plan.actionSurge(campaign.state, i),
    SacredWeapon: (i) => engine.plan.sacredWeapon(campaign.state, i),
    RecklessAttack: (i) => engine.plan.recklessAttack(campaign.state, i),
    StunningStrike: (i) => engine.plan.stunningStrike(campaign.state, i),
    FlurryOfBlows: (i) => engine.plan.flurryOfBlows(campaign.state, i),
    PatientDefense: (i) => engine.plan.patientDefense(campaign.state, i),
    StepOfTheWind: (i) => engine.plan.stepOfTheWind(campaign.state, i),
    AdrenalineRush: (i) => engine.plan.adrenalineRush(campaign.state, i),
    IntimidatingPresence: (i) => engine.plan.intimidatingPresence(campaign.state, i),
    DragonWings: (i) => engine.plan.dragonWings(campaign.state, i),
    PreserveLife: (i) => engine.plan.preserveLife(campaign.state, i),
    LandsAid: (i) => engine.plan.landsAid(campaign.state, i),
    WholenessOfBody: (i) => engine.plan.wholenessOfBody(campaign.state, i),
    PeerlessSkill: (i) => engine.plan.peerlessSkill(campaign.state, i),
    Frenzy: (i) => engine.plan.frenzy(campaign.state, i),
    Metamagic: (i) => engine.plan.metamagic(campaign.state, i),
    WildCompanion: (i) => engine.plan.wildCompanion(campaign.state, i),
    OffHandAttack: (i) => engine.plan.offHandAttack(campaign.state, i),
    Multiattack: (i) => engine.plan.multiattack(campaign.state, i),
    Falling: (i) => engine.plan.falling(campaign.state, i),
    Grapple: (i) => engine.plan.grapple(campaign.state, i),
    Shove: (i) => engine.plan.shove(campaign.state, i),
    Hide: (i) => engine.plan.hide(campaign.state, i),
    Counterspell: (i) => engine.plan.counterspell(campaign.state, i),
    DispelMagic: (i) => engine.plan.dispelMagic(campaign.state, i),
    Identify: (i) => engine.plan.identify(campaign.state, i),
    WeaponMastery: (i) => engine.plan.weaponMastery(campaign.state, i),
    Forage: (i) => engine.plan.forage(campaign.state, i),
    NavigationCheck: (i) => engine.plan.navigationCheck(campaign.state, i),
    MoraleCheck: (i) => engine.plan.moraleCheck(campaign.state, i),
    ReactionRoll: (i) => engine.plan.reactionRoll(campaign.state, i),
  };
  const planner = dispatch[intent.type];
  if (planner === undefined) {
    throw new Error(`Unknown intent type: ${intent.type}`);
  }
  const { type: _, ...rest } = intent;
  void _;
  const result = planner(rest as never);
  return commit(campaign, result.events);
};

const SerializedCampaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  schemaVersion: z.number().int(),
  events: z.array(EventSchema),
});
export type SerializedCampaign = z.infer<typeof SerializedCampaignSchema>;

/** Serialize a campaign to a JSON string. State is omitted because it is computed by replay. */
export const serializeCampaign = (campaign: Campaign): string =>
  JSON.stringify({
    id: campaign.id,
    name: campaign.name,
    schemaVersion: campaign.schemaVersion,
    events: [...campaign.events],
  } satisfies SerializedCampaign);

/** Parse a serialized campaign and replay its events to reconstruct state. */
export const loadCampaign = (json: string): Campaign => {
  const parsed = SerializedCampaignSchema.parse(JSON.parse(json));
  const state = replay(parsed.events);
  return {
    id: parsed.id,
    name: parsed.name,
    state,
    events: parsed.events,
    cursor: parsed.events.length,
    schemaVersion: parsed.schemaVersion,
  };
};

export interface CreatePCOptions {
  readonly name: string;
  readonly speciesId: string;
  readonly backgroundId: string;
  readonly classId: string;
  readonly level?: number;
  readonly abilityScores?: Character['abilityScores'];
  readonly hpMax: number;
  readonly hpCurrent?: number;
  readonly featsTaken?: ReadonlyArray<string>;
  readonly id?: string;
}

const DEFAULT_ABILITY_SCORES: Character['abilityScores'] = {
  STR: 14,
  DEX: 12,
  CON: 14,
  INT: 10,
  WIS: 10,
  CHA: 10,
};

/**
 * Build a Character with sensible defaults. The caller still emits the
 * CharacterCreated event when ready to add them to the campaign.
 */
export const createPC = (opts: CreatePCOptions): Character => {
  const level = opts.level ?? 1;
  return CharacterSchema.parse({
    id: opts.id ?? newCharacterId(),
    name: opts.name,
    speciesId: opts.speciesId,
    backgroundId: opts.backgroundId,
    classes: [{ classId: opts.classId, level, hitDiceRemaining: level }],
    abilityScores: opts.abilityScores ?? DEFAULT_ABILITY_SCORES,
    hp: { current: opts.hpCurrent ?? opts.hpMax, max: opts.hpMax, temp: 0 },
    featsTaken: opts.featsTaken ?? [],
  });
};

export { SCHEMA_VERSION };

void EventSchema; // ensure the Event type is included
void ((): Event[] => []);
