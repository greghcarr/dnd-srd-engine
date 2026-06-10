import { z } from 'zod';
import type { Campaign } from './commit.js';
import type { CampaignState } from '../schemas/runtime/campaign.js';
import type { Engine, PlanResult } from './index.js';
import { commit } from './commit.js';
import { replay } from './replay.js';
import { CharacterSchema, type Character } from '../schemas/runtime/character.js';
import { EventSchema, type Event } from '../schemas/events/index.js';
import { newCharacterId } from '../ids.js';
import { SCHEMA_VERSION } from '../version.js';

/**
 * Plan-only dispatch: route an intent to the right planner by its `type`
 * tag and return its PlanResult (no commit). Shared by `performIntent`
 * (which commits) and `engine.plan.useOption` (which returns the result
 * for the caller to commit), so there's one dispatch table, not two.
 */
export const planIntent = (
  plan: Engine['plan'],
  state: CampaignState,
  // Only `type` is read here (to pick the planner); the rest is forwarded
  // verbatim. Kept loose so both the generic `{ type, ...fields }` form and
  // a typed intent union (e.g. BonusActionIntent) dispatch through it.
  intent: { readonly type: string },
): PlanResult => {
  const dispatch: Readonly<Record<string, (i: never) => PlanResult>> = {
    Attack: (i) => plan.attack(state, i),
    OpportunityAttack: (i) => plan.opportunityAttack(state, i),
    ShortRest: (i) => plan.shortRest(state, i),
    LongRest: (i) => plan.longRest(state, i),
    CastSpell: (i) => plan.castSpell(state, i),
    CheckConcentration: (i) => plan.checkConcentration(state, i),
    Save: (i) => plan.save(state, i),
    AbilityCheck: (i) => plan.abilityCheck(state, i),
    LevelUp: (i) => plan.levelUp(state, i),
    ResolveChoice: (i) => plan.resolveChoice(state, i),
    Move: (i) => plan.move(state, i),
    Dash: (i) => plan.dash(state, i),
    Disengage: (i) => plan.disengage(state, i),
    ActionSurge: (i) => plan.actionSurge(state, i),
    SacredWeapon: (i) => plan.sacredWeapon(state, i),
    ChooseWeaponMasteries: (i) => plan.chooseWeaponMasteries(state, i),
    ConjurePactWeapon: (i) => plan.conjurePactWeapon(state, i),
    RecklessAttack: (i) => plan.recklessAttack(state, i),
    SteadyAim: (i) => plan.steadyAim(state, i),
    FastHands: (i) => plan.fastHands(state, i),
    StunningStrike: (i) => plan.stunningStrike(state, i),
    FlurryOfBlows: (i) => plan.flurryOfBlows(state, i),
    PatientDefense: (i) => plan.patientDefense(state, i),
    StepOfTheWind: (i) => plan.stepOfTheWind(state, i),
    AdrenalineRush: (i) => plan.adrenalineRush(state, i),
    Stonecunning: (i) => plan.stonecunning(state, i),
    DragonbornBreath: (i) => plan.dragonbornBreath(state, i),
    ConsumeHeroicInspiration: (i) => plan.consumeHeroicInspiration(state, i),
    SecondWind: (i) => plan.secondWind(state, i),
    SpendHitDie: (i) => plan.spendHitDie(state, i),
    UseHealersKit: (i) => plan.useHealersKit(state, i),
    Rage: (i) => plan.rage(state, i),
    Help: (i) => plan.help(state, i),
    Ready: (i) => plan.ready(state, i),
    BardicInspiration: (i) => plan.bardicInspiration(state, i),
    LayOnHands: (i) => plan.layOnHands(state, i),
    Search: (i) => plan.search(state, i),
    Study: (i) => plan.study(state, i),
    Influence: (i) => plan.influence(state, i),
    Utilize: (i) => plan.utilize(state, i),
    CloudsJaunt: (i) => plan.cloudsJaunt(state, i),
    NimbleEscape: (i) => plan.nimbleEscape(state, i),
    CunningAction: (i) => plan.cunningAction(state, i),
    ExpeditiousRetreatDash: (i) => plan.expeditiousRetreatDash(state, i),
    TurnUndead: (i) => plan.turnUndead(state, i),
    DivineSpark: (i) => plan.divineSpark(state, i),
    UncannyMetabolism: (i) => plan.uncannyMetabolism(state, i),
    MagicalCunning: (i) => plan.magicalCunning(state, i),
    IntimidatingPresence: (i) => plan.intimidatingPresence(state, i),
    DragonWings: (i) => plan.dragonWings(state, i),
    PreserveLife: (i) => plan.preserveLife(state, i),
    LandsAid: (i) => plan.landsAid(state, i),
    WholenessOfBody: (i) => plan.wholenessOfBody(state, i),
    WildResurgence: (i) => plan.wildResurgence(state, i),
    MemorizeSpell: (i) => plan.memorizeSpell(state, i),
    NaturalRecovery: (i) => plan.naturalRecovery(state, i),
    PeerlessSkill: (i) => plan.peerlessSkill(state, i),
    Countercharm: (i) => plan.countercharm(state, i),
    TacticalMind: (i) => plan.tacticalMind(state, i),
    Frenzy: (i) => plan.frenzy(state, i),
    ExhaleDragonsBreath: (i) => plan.exhaleDragonsBreath(state, i),
    BlinkTurnEnd: (i) => plan.blinkTurnEnd(state, i),
    Metamagic: (i) => plan.metamagic(state, i),
    WildCompanion: (i) => plan.wildCompanion(state, i),
    OffHandAttack: (i) => plan.offHandAttack(state, i),
    // Slice 762: Innate Sorcery is a `bonusActions` menu option now, so
    // useOption routes it through planIntent (was direct-invoke only).
    InnateSorcery: (i) => plan.innateSorcery(state, i),
    Multiattack: (i) => plan.multiattack(state, i),
    Falling: (i) => plan.falling(state, i),
    Grapple: (i) => plan.grapple(state, i),
    Shove: (i) => plan.shove(state, i),
    Hide: (i) => plan.hide(state, i),
    Counterspell: (i) => plan.counterspell(state, i),
    DispelMagic: (i) => plan.dispelMagic(state, i),
    Identify: (i) => plan.identify(state, i),
    WeaponMastery: (i) => plan.weaponMastery(state, i),
    Forage: (i) => plan.forage(state, i),
    NavigationCheck: (i) => plan.navigationCheck(state, i),
    MoraleCheck: (i) => plan.moraleCheck(state, i),
    ReactionRoll: (i) => plan.reactionRoll(state, i),
  };
  const planner = dispatch[intent.type];
  if (planner === undefined) {
    throw new Error(`Unknown intent type: ${intent.type}`);
  }
  const { type: _, ...rest } = intent;
  void _;
  return planner(rest as never);
};

/**
 * Plan + commit in one call. Dispatches the intent to the right planner
 * by its `type` tag and appends the resulting events to the campaign.
 */
export const performIntent = (
  engine: Engine,
  campaign: Campaign,
  intent: { readonly type: string } & Record<string, unknown>,
): Campaign => commit(campaign, planIntent(engine.plan, campaign.state, intent).events);

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
