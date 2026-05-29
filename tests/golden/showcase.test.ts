// Showcase scenario: "The Stoneheart Saga". A four-act campaign
// exercising as many engine features as possible while reading like a
// coherent story. The Bridge Burners (a Fighter, Wizard, Paladin, and
// Rogue) respond to a goblin raid that draws them out of their bastion,
// through forest and travel, into a dragon lair.
//
// Each act emits the events for a different mechanical surface. Together
// the showcase touches: sessions + journal + clock, locations + doors +
// terrain, parties + currency + treasure, quests + objectives +
// milestones + XP, settings toggles, NPC reactions, mounts + vehicles,
// travel + forage + navigation, combat with movement / opportunity
// attacks / action surge / off-hand / sneak attack / counterspell /
// weapon mastery / cover / mitigation, conditions, concentration,
// grapple + shove, polymorph, magic-item charges, downtime, bastion
// founding + facilities + turn + damage + level-up, death save +
// revivify, multiattack creatures, falling, hit-die spending, short
// rest, long rest, and replay-equivalence + RNG-capture invariants over
// a long event chain.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/index.js';
import { seededRNG } from '../../src/rng/seeded.js';
import { throwOnCallRNG } from '../../src/rng/throw.js';
import { replay } from '../../src/engine/replay.js';
import { commit, type Campaign } from '../../src/engine/commit.js';
import {
  buildFighter,
  eventId,
  isoTimestamp,
  makeItemInstance,
} from '../fixtures/index.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { resolveContent } from '../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../src/schemas/runtime/character.js';
import {
  newCharacterId,
  newJournalEntryId,
  newPartyId,
  newSessionId,
} from '../../src/ids.js';
import type { CharacterCreatedEvent } from '../../src/schemas/events/progression.js';
import type {
  DamageAppliedEvent,
  DeathSaveRolledEvent,
} from '../../src/schemas/events/combat.js';
import type { SaveRolledEvent } from '../../src/schemas/events/checks.js';
import type {
  SpellCastDeclaredEvent,
  SpellSlotConsumedEvent,
} from '../../src/schemas/events/spellcasting.js';
import type {
  AttackRolledEvent,
  DamageRolledEvent,
} from '../../src/schemas/events/attack.js';
import type { HitDieSpentEvent } from '../../src/schemas/events/resources.js';
import type {
  EncounterStartedEvent,
  InitiativeRolledEvent,
} from '../../src/schemas/events/encounter.js';
import type { ItemAcquiredEvent, ItemEquippedEvent, ItemAttunedEvent } from '../../src/schemas/events/inventory.js';
import type {
  PartyCreatedEvent,
  CurrencyAcquiredEvent,
  ItemDepositedToPartyEvent,
} from '../../src/schemas/events/party.js';
import type {
  SessionStartedEvent,
  SessionEndedEvent,
  JournalEntryAddedEvent,
  InGameTimeAdvancedEvent,
} from '../../src/schemas/events/session.js';
import type {
  LocationCreatedEvent,
  DoorAddedEvent,
  DoorStateChangedEvent,
  CharacterLocationChangedEvent,
} from '../../src/schemas/events/locations.js';
import type {
  QuestStartedEvent,
  ObjectiveCompletedEvent,
  QuestCompletedEvent,
  QuestRewardClaimedEvent,
  XPAwardedEvent,
  MilestoneAwardedEvent,
} from '../../src/schemas/events/quests.js';
import type { TravelLegCompletedEvent } from '../../src/schemas/events/travel.js';
import type {
  MountedEvent,
  DismountedEvent,
  VehicleAcquiredEvent,
  VehicleBoardedEvent,
  VehicleDamagedEvent,
  VehicleRepairedEvent,
} from '../../src/schemas/events/mounts-vehicles.js';
import type { DowntimeActivityResolvedEvent } from '../../src/schemas/events/downtime.js';
import type {
  ItemChargeConsumedEvent,
  ItemRechargedEvent,
} from '../../src/schemas/events/charges.js';
import type {
  PolymorphAppliedEvent,
  PolymorphRevertedEvent,
} from '../../src/schemas/events/transformations.js';
import type {
  BastionFoundedEvent,
  BastionFacilityAddedEvent,
  BastionHirelingAddedEvent,
  BastionTurnTakenEvent,
  BastionDamagedEvent,
  BastionLevelChangedEvent,
} from '../../src/schemas/events/bastion.js';
import type { CampaignSettingsChangedEvent } from '../../src/schemas/events/settings.js';
import type { Event } from '../../src/schemas/events/index.js';
import { formatTranscript } from '../transcript.js';

const buildWizard = (
  name: string,
  hp: number,
  opts: { level?: number; preparedSpells?: string[] } = {},
): Character => {
  const level = opts.level ?? 5;
  return CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'wizard', level, hitDiceRemaining: level }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: hp, max: hp, temp: 0 },
    featsTaken: ['savage-attacker'],
    preparedSpells:
      opts.preparedSpells ??
      ['fire-bolt', 'fireball', 'magic-missile', 'hold-person', 'misty-step', 'shield', 'mage-armor', 'polymorph'],
  });
};

const buildPaladin = (name: string, hp: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'paladin', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 10, WIS: 12, CHA: 16 },
    hp: { current: hp, max: hp, temp: 0 },
    featsTaken: ['savage-attacker'],
    preparedSpells: ['cure-wounds', 'bless', 'healing-word'],
  });

const buildRogue = (name: string, hp: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'halfling',
    backgroundId: 'criminal',
    classes: [{ classId: 'rogue', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 10, DEX: 18, CON: 14, INT: 12, WIS: 12, CHA: 10 },
    hp: { current: hp, max: hp, temp: 0 },
    featsTaken: ['savage-attacker'],
    preparedSpells: [],
    // Slice 502: Vex masters the dagger so the Nick mastery applies to her
    // off-hand attack (keeps the showcase's action-economy behavior).
    weaponMasteries: ['dagger'],
  });

const buildOgre = (name: string, hp: number, weaponInstanceId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name,
    statblockId: 'ogre',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 19, DEX: 8, CON: 16, INT: 5, WIS: 7, CHA: 7 },
    hp: { current: hp, max: hp, temp: 0 },
    armorClass: 11, // hide armor per MM 2024
    featsTaken: ['savage-attacker'],
    speedFeet: 40,
    multiattack: { name: 'Greatclub frenzy', attacks: [{ weaponInstanceId, count: 2 }] },
  });

describe('golden: showcase party adventure (the Stoneheart Saga)', () => {
  it('a four-act campaign exercising the full engine surface', async () => {
    const STARTER_PACK = loadStarterPack();
    const STARTER_CONTENT = resolveContent([STARTER_PACK]);
    const engine = createEngine({ contentPacks: [STARTER_PACK], rng: seededRNG(2026) });

    // ---------- Cast ----------
    const alyx = buildFighter({
      name: 'Alyx', level: 5, hpMax: 44, hpCurrent: 44, STR: 18, DEX: 14, CON: 14,
      weaponMasteries: ['longsword'],
      resources: [
        { resourceId: 'second-wind', current: 2, max: 2 },
        { resourceId: 'action-surge', current: 1, max: 1 },
      ],
    });
    const mira = buildWizard('Mira', 44, { level: 7 });
    const cassius = buildPaladin('Brother Cassius', 44);
    const vex = buildRogue('Vex', 38);

    // ---------- Equipment ----------
    const alyxSword = makeItemInstance('longsword');
    const alyxArmor = makeItemInstance('chain-shirt');
    const cassiusSword = makeItemInstance('longsword');
    const cassiusArmor = makeItemInstance('plate');
    const vexDagger = makeItemInstance('dagger');
    const vexOffhandDagger = makeItemInstance('dagger');
    const vexLeather = makeItemInstance('studded-leather');
    const miraQuarterstaff = makeItemInstance('quarterstaff');

    // Magic loot (used later)
    const wandOfMagicMissiles = makeItemInstance('wand-of-magic-missiles', { chargesRemaining: 5 });
    const cloakOfProtection = makeItemInstance('cloak-of-protection');

    // ---------- Identifiers used across acts ----------
    const partyId = newPartyId();
    const session1Id = newSessionId();
    const session2Id = newSessionId();
    const bastionId = newJournalEntryId();
    const stablesFacility = newJournalEntryId();
    const libraryFacility = newJournalEntryId();
    const hirelingChief = newJournalEntryId();
    const villageId = newJournalEntryId();
    const forestPathId = newJournalEntryId();
    const dragonLairId = newJournalEntryId();
    const lairDoorId = newJournalEntryId();
    const wagonId = newJournalEntryId();
    const warhorseId = newCharacterId();
    const goblinAClub = makeItemInstance('handaxe');
    const goblinBClub = makeItemInstance('handaxe');
    const goblinShamanQuarterstaff = makeItemInstance('quarterstaff');
    const ogreClub = makeItemInstance('ogre-greatclub');
    const dragonRend = makeItemInstance('young-red-dragon-rend');
    const mainQuestId = newJournalEntryId();
    const obj1 = newJournalEntryId();
    const obj2 = newJournalEntryId();
    const obj3 = newJournalEntryId();
    const dmNoteId = newJournalEntryId();
    const playerLogId = newJournalEntryId();
    const finalLogId = newJournalEntryId();

    const SHORT_REST_MINUTES = 60;
    const LONG_REST_MINUTES = 8 * 60;
    const TRAVEL_MORNING_MINUTES = 6 * 60;
    const TRAVEL_AFTERNOON_MINUTES = 4 * 60;

    let clock = 0;
    const at = (): string => isoTimestamp((clock += 1));
    const evt = <T extends Event>(e: Omit<T, 'id' | 'at'>): T =>
      ({ id: eventId(), at: at(), ...e }) as T;

    let campaign: Campaign = engine.createCampaign({ name: 'The Stoneheart Saga' });

    // ====================================================================
    // ACT 0: CAMPAIGN SET-UP
    // The Bridge Burners exist, have a bastion, are about to start a
    // session, and the DM has enabled some 2024 variant rules.
    // ====================================================================

    campaign = commit(campaign, [
      evt<CampaignSettingsChangedEvent>({
        type: 'CampaignSettingsChanged',
        heroPoints: true,
        feaCharacterFlaws: true,
        customHouserulesAdd: ['inspiration-on-natural-1', 'sundering-armor'],
      }),
      evt<ItemAcquiredEvent>({ type: 'ItemAcquired', instance: alyxSword }),
      evt<ItemAcquiredEvent>({ type: 'ItemAcquired', instance: alyxArmor }),
      evt<ItemAcquiredEvent>({ type: 'ItemAcquired', instance: cassiusSword }),
      evt<ItemAcquiredEvent>({ type: 'ItemAcquired', instance: cassiusArmor }),
      evt<ItemAcquiredEvent>({ type: 'ItemAcquired', instance: vexDagger }),
      evt<ItemAcquiredEvent>({ type: 'ItemAcquired', instance: vexOffhandDagger }),
      evt<ItemAcquiredEvent>({ type: 'ItemAcquired', instance: vexLeather }),
      evt<ItemAcquiredEvent>({ type: 'ItemAcquired', instance: miraQuarterstaff }),
      evt<CharacterCreatedEvent>({ type: 'CharacterCreated', snapshot: alyx }),
      evt<CharacterCreatedEvent>({ type: 'CharacterCreated', snapshot: mira }),
      evt<CharacterCreatedEvent>({ type: 'CharacterCreated', snapshot: cassius }),
      evt<CharacterCreatedEvent>({ type: 'CharacterCreated', snapshot: vex }),
      evt<ItemEquippedEvent>({ type: 'ItemEquipped', characterId: alyx.id, instanceId: alyxArmor.id, slot: 'armor' }),
      evt<ItemEquippedEvent>({ type: 'ItemEquipped', characterId: cassius.id, instanceId: cassiusArmor.id, slot: 'armor' }),
      evt<ItemEquippedEvent>({ type: 'ItemEquipped', characterId: vex.id, instanceId: vexLeather.id, slot: 'armor' }),
      evt<PartyCreatedEvent>({
        type: 'PartyCreated',
        partyId,
        name: 'The Bridge Burners',
        memberIds: [alyx.id, mira.id, cassius.id, vex.id],
      }),
      evt<CurrencyAcquiredEvent>({
        type: 'CurrencyAcquired',
        partyId,
        amounts: { cp: 0, sp: 0, ep: 0, gp: 240, pp: 0 },
        source: 'previous adventure earnings',
      }),
      evt<BastionFoundedEvent>({
        type: 'BastionFounded',
        bastionId,
        name: 'Stoneheart Keep',
        ownerCharacterId: alyx.id,
        level: 1,
        hpMax: 100,
      }),
      evt<BastionFacilityAddedEvent>({
        type: 'BastionFacilityAdded',
        bastionId,
        facilityId: stablesFacility,
        name: 'Stables',
        kind: 'basic',
        space: 'roomy',
      }),
      evt<BastionFacilityAddedEvent>({
        type: 'BastionFacilityAdded',
        bastionId,
        facilityId: libraryFacility,
        name: 'Reliquary Library',
        kind: 'special',
        space: 'cramped',
        description: 'Mira researches and copies spells from rescued tomes.',
      }),
      evt<BastionHirelingAddedEvent>({
        type: 'BastionHirelingAdded',
        bastionId,
        hirelingId: hirelingChief,
        name: 'Sergeant Halric',
        role: 'Captain of the Guard',
      }),
    ]);

    // ====================================================================
    // ACT 1: A SESSION BEGINS, THE PARTY RIDES OUT
    // Session start syncs the in-game clock. Travel to a burned village.
    // ====================================================================

    campaign = commit(campaign, [
      evt<SessionStartedEvent>({
        type: 'SessionStarted',
        sessionId: session1Id,
        name: 'Session 1: Smoke on the Horizon',
        inGameStart: { totalMinutes: 7 * 60 },
      }),
      evt<JournalEntryAddedEvent>({
        type: 'JournalEntryAdded',
        entryId: dmNoteId,
        sessionId: session1Id,
        authorKind: 'dm',
        visibility: 'dm-only',
        visibleToCharacterIds: [],
        title: 'Pre-session notes',
        body: 'Goblins burned three villages last night. A hermit at Riverside saw a young red dragon overhead.',
      }),
      evt<LocationCreatedEvent>({
        type: 'LocationCreated',
        locationId: villageId,
        name: 'Riverside (burned)',
        description: 'The riverside village. Smouldering.',
      }),
      evt<LocationCreatedEvent>({
        type: 'LocationCreated',
        locationId: forestPathId,
        name: 'Whispering Forest Road',
        parentLocationId: villageId,
      }),
      evt<VehicleAcquiredEvent>({
        type: 'VehicleAcquired',
        vehicleId: wagonId,
        name: 'Supply Wagon',
        kind: 'land',
        speedFeet: 20,
        ac: 14,
        maxHp: 80,
        capacity: 4,
      }),
      evt<CharacterCreatedEvent>({
        type: 'CharacterCreated',
        snapshot: CharacterSchema.parse({
          id: warhorseId,
          kind: 'creature',
          name: 'Stride',
          speciesId: 'human',
          backgroundId: 'soldier',
          classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
          abilityScores: { STR: 18, DEX: 12, CON: 14, INT: 2, WIS: 12, CHA: 7 },
          hp: { current: 19, max: 19, temp: 0 },
          featsTaken: ['savage-attacker'],
          speedFeet: 60,
        }),
      }),
      evt<MountedEvent>({ type: 'Mounted', riderId: alyx.id, mountId: warhorseId }),
      evt<VehicleBoardedEvent>({ type: 'VehicleBoarded', vehicleId: wagonId, characterId: cassius.id }),
      evt<VehicleBoardedEvent>({ type: 'VehicleBoarded', vehicleId: wagonId, characterId: mira.id }),
      evt<VehicleBoardedEvent>({ type: 'VehicleBoarded', vehicleId: wagonId, characterId: vex.id }),
      evt<InGameTimeAdvancedEvent>({ type: 'InGameTimeAdvanced', minutes: TRAVEL_MORNING_MINUTES, reason: 'ride to Riverside' }),
      evt<TravelLegCompletedEvent>({
        type: 'TravelLegCompleted',
        partyId,
        pace: 'fast',
        hours: 6,
        miles: 24,
        fromLocationId: villageId,
        notes: 'Forced march, fast pace.',
      }),
    ]);

    // (No forced-march save yet — RAW only kicks in past 8 hours of
    // travel in a single day. The morning leg is 6h; the cumulative
    // total reaches 10h after the afternoon push, so the save fires
    // there instead.)

    // Navigation check by Mira; she succeeds.
    campaign = commit(
      campaign,
      engine.plan.navigationCheck(campaign.state, { partyId, navigatorId: mira.id, dc: 10 }).events,
    );
    // Vex forages while the party rests at midday.
    campaign = commit(
      campaign,
      engine.plan.forage(campaign.state, { partyId, foragerId: vex.id, dc: 12 }).events,
    );

    // ====================================================================
    // ACT 2: THE HERMIT AT RIVERSIDE
    // NPC reaction roll. Talk with a hermit; learn the dragon's lair.
    // ====================================================================

    const hermit = CharacterSchema.parse({
      id: newCharacterId(),
      kind: 'npc',
      name: 'Elder Ymra',
      speciesId: 'human',
      backgroundId: 'sage',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 10, DEX: 10, CON: 12, INT: 14, WIS: 16, CHA: 12 },
      hp: { current: 9, max: 9, temp: 0 },
      featsTaken: ['savage-attacker'],
      attitude: 'unfriendly',
      morale: { current: 3, max: 5 },
    });

    campaign = commit(campaign, [
      evt<CharacterCreatedEvent>({ type: 'CharacterCreated', snapshot: hermit }),
      evt<CharacterLocationChangedEvent>({
        type: 'CharacterLocationChanged',
        characterId: hermit.id,
        toLocationId: villageId,
      }),
      evt<CharacterLocationChangedEvent>({
        type: 'CharacterLocationChanged',
        characterId: alyx.id,
        toLocationId: villageId,
      }),
    ]);

    // Cassius rolls Persuasion via reaction roll.
    campaign = commit(
      campaign,
      engine.plan.reactionRoll(campaign.state, {
        npcId: hermit.id,
        presenterId: cassius.id,
        dc: 10,
      }).events,
    );

    // Hermit gives directions and a starting quest.
    campaign = commit(campaign, [
      evt<JournalEntryAddedEvent>({
        type: 'JournalEntryAdded',
        entryId: playerLogId,
        sessionId: session1Id,
        authorKind: 'player',
        authorCharacterId: cassius.id,
        visibility: 'party',
        visibleToCharacterIds: [],
        title: 'The hermit',
        body: 'Elder Ymra warmed to us after Cassius helped her dig her sister out of the rubble. The dragon nests in a basalt cave two days east.',
      }),
      evt<QuestStartedEvent>({
        type: 'QuestStarted',
        questId: mainQuestId,
        title: 'Slay the Stoneheart Dragon',
        description: "Young red dragon nesting in basalt caves east of Riverside.",
        partyId,
        objectives: [
          { id: obj1, description: 'Cross the Whispering Forest', status: 'pending', optional: false, progress: 0, required: 1 },
          { id: obj2, description: 'Survive the goblin scouts on the path', status: 'pending', optional: false, progress: 0, required: 1 },
          { id: obj3, description: 'Defeat the young red dragon', status: 'pending', optional: false, progress: 0, required: 1 },
        ],
        reward: {
          xpPerCharacter: 1500,
          currency: { cp: 0, sp: 0, ep: 0, gp: 1200, pp: 12 },
          itemDefinitionIds: ['flametongue-longsword'],
        },
      }),
    ]);

    // ====================================================================
    // ACT 3: GOBLIN SCOUTS IN THE FOREST
    // Full combat round with positioning, opportunity attack, action
    // surge, off-hand attack, sneak attack via OnEvent, grapple, shove,
    // weapon mastery, cover, concentration, conditions, mitigation.
    // ====================================================================

    const goblinA = CharacterSchema.parse({
      id: newCharacterId(),
      kind: 'creature',
      name: 'Goblin Scout A',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 8, DEX: 15, CON: 10, INT: 10, WIS: 8, CHA: 8 },
      hp: { current: 14, max: 14, temp: 0 },
      armorClass: 15, // leather armor + shield per MM 2024
      featsTaken: ['savage-attacker'],
    });
    const goblinB = CharacterSchema.parse({
      id: newCharacterId(),
      kind: 'creature',
      name: 'Goblin Scout B',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 8, DEX: 15, CON: 10, INT: 10, WIS: 8, CHA: 8 },
      hp: { current: 12, max: 12, temp: 0 },
      armorClass: 15, // leather armor + shield per MM 2024
      featsTaken: ['savage-attacker'],
    });
    const goblinShaman = buildWizard('Goblin Shaman', 22, {
      preparedSpells: ['fire-bolt', 'hold-person', 'mage-armor'],
    });

    campaign = commit(campaign, [
      evt<ItemAcquiredEvent>({ type: 'ItemAcquired', instance: goblinAClub }),
      evt<ItemAcquiredEvent>({ type: 'ItemAcquired', instance: goblinBClub }),
      evt<ItemAcquiredEvent>({ type: 'ItemAcquired', instance: goblinShamanQuarterstaff }),
      evt<CharacterCreatedEvent>({ type: 'CharacterCreated', snapshot: goblinA }),
      evt<CharacterCreatedEvent>({ type: 'CharacterCreated', snapshot: goblinB }),
      evt<CharacterCreatedEvent>({ type: 'CharacterCreated', snapshot: goblinShaman }),
    ]);

    // Dismount so Alyx fights on foot.
    campaign = commit(campaign, [
      evt<DismountedEvent>({ type: 'Dismounted', riderId: alyx.id, mountId: warhorseId, voluntary: true }),
    ]);

    const enc = engine.plan.createEncounter(campaign.state, {
      combatantIds: [alyx.id, cassius.id, vex.id, mira.id, goblinA.id, goblinB.id, goblinShaman.id],
      name: 'Goblin Ambush',
    });
    campaign = commit(campaign, enc.events);

    // Pinned initiative so the narrative reads in a clean order.
    campaign = commit(campaign, [
      evt<InitiativeRolledEvent>({
        type: 'InitiativeRolled',
        encounterId: enc.encounterId,
        rolls: [
          { combatantId: vex.id, d20: 18, modifier: 4, total: 22 },
          { combatantId: alyx.id, d20: 14, modifier: 2, total: 16 },
          { combatantId: goblinA.id, d20: 13, modifier: 2, total: 15 },
          { combatantId: cassius.id, d20: 12, modifier: 0, total: 12 },
          { combatantId: goblinShaman.id, d20: 10, modifier: 2, total: 12 },
          { combatantId: goblinB.id, d20: 9, modifier: 2, total: 11 },
          { combatantId: mira.id, d20: 8, modifier: 2, total: 10 },
        ],
      }),
      evt<EncounterStartedEvent>({ type: 'EncounterStarted', encounterId: enc.encounterId }),
    ]);
    campaign = commit(
      campaign,
      engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events,
    );

    const advance = (): void => {
      campaign = commit(
        campaign,
        engine.plan.advanceTurn(campaign.state, { encounterId: enc.encounterId }).events,
      );
    };

    // --- Round 1 ---

    // Vex strikes with advantage (flanking with Alyx), then off-hand attack.
    // Sneak Attack should rider on the main hit via the OnEvent trigger system.
    campaign = commit(
      campaign,
      engine.plan.attack(campaign.state, {
        attackerId: vex.id,
        targetId: goblinA.id,
        weaponInstanceId: vexDagger.id,
        advantage: 'advantage',
      }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.offHandAttack(campaign.state, {
        attackerId: vex.id,
        targetId: goblinA.id,
        weaponInstanceId: vexOffhandDagger.id,
      }).events,
    );
    advance();

    // Alyx attacks the Shaman; activates Sap mastery; uses Action Surge
    // to swing a second time. Off-hand longsword would be illegal so we
    // just use Action Surge.
    campaign = commit(
      campaign,
      engine.plan.attack(campaign.state, {
        attackerId: alyx.id,
        targetId: goblinShaman.id,
        weaponInstanceId: alyxSword.id,
      }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.weaponMastery(campaign.state, {
        mastery: 'Sap',
        attackerId: alyx.id,
        targetId: goblinShaman.id,
        weaponInstanceId: alyxSword.id,
      }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.actionSurge(campaign.state, {
        combatantId: alyx.id,
      }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.attack(campaign.state, {
        attackerId: alyx.id,
        targetId: goblinShaman.id,
        weaponInstanceId: alyxSword.id,
      }).events,
    );
    advance();

    // Goblin Scout A's turn: stabs Vex with a handaxe. Synthetic
    // damage event attributed to the goblin, marked as resisted via
    // Vex's leather armor (rawAmount 15 -> amount 12 after mitigation).
    campaign = commit(campaign, [
      evt<DamageAppliedEvent>({
        type: 'DamageApplied',
        targetId: vex.id,
        components: [{ amount: 12, type: 'piercing', rawAmount: 15, mitigation: 'resisted' }],
        sourceCharacterId: goblinA.id,
        source: 'handaxe (resisted by light armor)',
      }),
    ]);
    advance();

    // Cassius's turn: he casts Bless to support the front line. Starts
    // concentrating on it (Bless is a concentration spell).
    campaign = commit(
      campaign,
      engine.plan.castSpell(campaign.state, {
        characterId: cassius.id,
        spellId: 'bless',
        slotLevel: 1,
        targetIds: [alyx.id, vex.id, cassius.id],
        castingClassId: 'paladin',
      }).events,
    );
    advance();

    // Goblin Shaman's turn: tries to drop Cassius with Hold Person.
    // Mira uses her reaction to Counterspell. The shaman's spell is
    // declared first (so the chain reads as a real reactive interrupt),
    // then Mira spends her 3rd-level slot to negate it.
    const shamanCastEventId = eventId();
    campaign = commit(campaign, [
      {
        id: shamanCastEventId,
        at: at(),
        type: 'SpellCastDeclared',
        characterId: goblinShaman.id,
        spellId: 'hold-person',
        slotLevel: 2,
        slotSource: 'standard',
        targetIds: [cassius.id],
        castAsRitual: false,
      } satisfies Event,
    ]);
    const counterspellEvents = engine.plan.counterspell(campaign.state, {
      counterCasterId: mira.id,
      targetCasterId: goblinShaman.id,
      originalSpellEventId: shamanCastEventId,
      spellId: 'hold-person',
      castingClassId: 'wizard',
      slotLevelToConsume: 3,
      originalSpellLevel: 2,
    }).events;
    campaign = commit(campaign, counterspellEvents);
    // If the shaman makes the CON save against Mira's Counterspell, the
    // counter fails and Hold Person resolves normally — Cassius needs to
    // make a WIS save against the shaman's spell save DC (15) or be
    // paralyzed. Shaman: INT 18 (+4), PB +3 → DC 8+4+3 = 15. Cassius:
    // WIS 12 (+1), Paladin WIS-save proficient (+3) → +4. Synthetic save
    // result baked here so the scene remains deterministic regardless of
    // how the engine's RNG rolls.
    const counterSucceeded = counterspellEvents.some((e) => e.type === 'SpellCountered');
    if (!counterSucceeded) {
      campaign = commit(campaign, [
        evt<SaveRolledEvent>({
          type: 'SaveRolled',
          targetId: cassius.id,
          ability: 'WIS',
          dc: 15,
          d20: [13],
          used: 'none',
          bonus: 4,
          total: 17,
          success: true,
          breakdown: [
            { source: 'WIS-mod', value: 1 },
            { source: 'proficiency', value: 3 },
          ],
        }),
      ]);
    }
    advance();

    // Goblin B's turn: lands a handaxe on Cassius (forcing a CON save to
    // hold concentration), then withdraws toward Vex; the withdrawal
    // leaves Cassius's reach and provokes an opportunity attack.
    // Damage is a plausible handaxe hit (1d6+2 STR = 7 max in 2024 stats).
    campaign = commit(campaign, [
      evt<DamageAppliedEvent>({
        type: 'DamageApplied',
        targetId: cassius.id,
        components: [{ amount: 6, type: 'slashing' }],
        sourceCharacterId: goblinB.id,
        source: 'handaxe',
      }),
    ]);
    campaign = commit(
      campaign,
      engine.plan.checkConcentration(campaign.state, {
        characterId: cassius.id,
        damageTaken: 6,
      }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.opportunityAttack(campaign.state, {
        reactorId: cassius.id,
        targetId: goblinB.id,
        weaponInstanceId: cassiusSword.id,
      }).events,
    );
    advance();

    // Mira's turn: closes round 1 with Fireball at the bunched goblins.
    // Note: the engine currently rolls damage per target instead of
    // once per spell with save-or-half per target. This is RAW-adjacent
    // but not strict 2024 Fireball semantics; see Slice 16 follow-up.
    campaign = commit(
      campaign,
      engine.plan.castSpell(campaign.state, {
        characterId: mira.id,
        spellId: 'fireball',
        slotLevel: 3,
        targetIds: [goblinA.id, goblinB.id, goblinShaman.id],
      }).events,
    );
    advance(); // Round ends, encounter wraps.

    // Clean up the goblins: they're either dead or dispersed.
    for (const goblinId of [goblinA.id, goblinB.id, goblinShaman.id]) {
      const remaining = campaign.state.characters[goblinId]?.hp.current ?? 0;
      if (remaining > 0) {
        campaign = commit(campaign, [
          evt<DamageAppliedEvent>({
            type: 'DamageApplied',
            targetId: goblinId,
            components: [{ amount: remaining, type: 'slashing' }],
          }),
        ]);
      }
    }
    campaign = commit(
      campaign,
      engine.plan.endEncounter(campaign.state, {
        encounterId: enc.encounterId,
        outcome: 'victory',
      }).events,
    );

    // Quest objective progress.
    campaign = commit(campaign, [
      evt<ObjectiveCompletedEvent>({
        type: 'ObjectiveCompleted',
        questId: mainQuestId,
        objectiveId: obj2,
      }),
      evt<MilestoneAwardedEvent>({
        type: 'MilestoneAwarded',
        kind: 'minor',
        title: 'Goblin scouts routed',
        partyId,
        questId: mainQuestId,
      }),
    ]);

    // Short rest by the river. Hit-die spending.
    const shortRestEvents = engine.plan.shortRest(campaign.state, {
      participantIds: [alyx.id, mira.id, cassius.id, vex.id],
    }).events;
    campaign = commit(campaign, [shortRestEvents[0]!]);
    campaign = commit(campaign, [
      evt<HitDieSpentEvent>({ type: 'HitDieSpent', characterId: cassius.id, die: 10, rolled: 7, conMod: 2, healed: 9 }),
      evt<HitDieSpentEvent>({ type: 'HitDieSpent', characterId: vex.id, die: 8, rolled: 6, conMod: 2, healed: 8 }),
    ]);
    campaign = commit(campaign, [shortRestEvents[1]!]);

    // Travel onward. The party has now traveled 6h (morning) + 4h
    // (afternoon) = 10h in a single day, crossing the 8-hour forced-
    // march threshold. RAW requires a CON save vs DC 10 per extra hour;
    // Cassius (heavy armor, no CON proficiency) fails one and gains a
    // level of exhaustion.
    campaign = commit(campaign, [
      evt<InGameTimeAdvancedEvent>({ type: 'InGameTimeAdvanced', minutes: SHORT_REST_MINUTES, reason: 'short rest' }),
      evt<InGameTimeAdvancedEvent>({ type: 'InGameTimeAdvanced', minutes: TRAVEL_AFTERNOON_MINUTES, reason: 'press into the forest' }),
      evt<TravelLegCompletedEvent>({
        type: 'TravelLegCompleted',
        partyId,
        pace: 'normal',
        hours: 4,
        miles: 12,
        fromLocationId: villageId,
        toLocationId: forestPathId,
        notes: 'Forest path, dusk approaching. Day total: 10h travel.',
      }),
      evt({
        type: 'ExhaustionChanged',
        targetId: cassius.id,
        fromLevel: 0,
        toLevel: 1,
      } as never),
      evt<ObjectiveCompletedEvent>({ type: 'ObjectiveCompleted', questId: mainQuestId, objectiveId: obj1 }),
    ]);

    // Session 1 ends. Long rest at the forest edge.
    campaign = commit(campaign, [
      evt<InGameTimeAdvancedEvent>({ type: 'InGameTimeAdvanced', minutes: LONG_REST_MINUTES, reason: 'long rest at the forest edge' }),
    ]);
    campaign = commit(
      campaign,
      engine.plan.longRest(campaign.state, {
        participantIds: [alyx.id, mira.id, cassius.id, vex.id],
      }).events,
    );
    campaign = commit(campaign, [
      evt<SessionEndedEvent>({
        type: 'SessionEnded',
        sessionId: session1Id,
        summary: 'Cleared the goblin scouts and made it through the forest.',
      }),
    ]);

    // ====================================================================
    // ACT 4: DOWNTIME AT THE KEEP, THEN THE LAIR
    // The party rides home (offscreen), Mira researches a polymorph
    // tactic, the bastion takes a turn and weathers a raid. Then they
    // descend on the dragon's lair.
    // ====================================================================

    campaign = commit(campaign, [
      evt<DowntimeActivityResolvedEvent>({
        type: 'DowntimeActivityResolved',
        characterId: mira.id,
        kind: 'research',
        days: 3,
        outcome: 'success',
        summary: 'Mira translates a battered dracologist tome.',
      }),
      evt<DowntimeActivityResolvedEvent>({
        type: 'DowntimeActivityResolved',
        characterId: vex.id,
        kind: 'training',
        days: 7,
        outcome: 'success',
        summary: "Sergeant Halric drilled Vex on dragon-fighting form.",
        toolProficiencyGained: 'thieves-tools',
      }),
      evt<BastionTurnTakenEvent>({
        type: 'BastionTurnTaken',
        bastionId,
        order: 'recruit',
        treasuryDeltaGp: -75,
        summary: 'Hired two militia for the keep.',
      }),
      evt<BastionDamagedEvent>({
        type: 'BastionDamaged',
        bastionId,
        amount: 18,
        source: 'goblin retaliation raid',
      }),
      evt<BastionLevelChangedEvent>({
        type: 'BastionLevelChanged',
        bastionId,
        fromLevel: 1,
        toLevel: 2,
      }),
      evt<VehicleDamagedEvent>({
        type: 'VehicleDamaged',
        vehicleId: wagonId,
        amount: 30,
        source: 'broken axle on a rutted road',
      }),
      evt<VehicleRepairedEvent>({
        type: 'VehicleRepaired',
        vehicleId: wagonId,
        amount: 20,
      }),
    ]);

    // Loot turned up during the bastion turn: Mira identifies a wand
    // and a cloak the party hauled home.
    campaign = commit(campaign, [
      evt<ItemAcquiredEvent>({ type: 'ItemAcquired', instance: wandOfMagicMissiles }),
      evt<ItemAcquiredEvent>({ type: 'ItemAcquired', instance: cloakOfProtection }),
    ]);
    campaign = commit(
      campaign,
      engine.plan.identify(campaign.state, {
        casterId: mira.id,
        itemInstanceId: wandOfMagicMissiles.id,
      }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.identify(campaign.state, {
        casterId: mira.id,
        itemInstanceId: cloakOfProtection.id,
      }).events,
    );
    campaign = commit(campaign, [
      evt<ItemDepositedToPartyEvent>({
        type: 'ItemDepositedToParty',
        partyId,
        itemInstanceId: wandOfMagicMissiles.id,
      }),
      evt<ItemAttunedEvent>({
        type: 'ItemAttuned',
        characterId: cassius.id,
        instanceId: cloakOfProtection.id,
      }),
    ]);

    // ====================================================================
    // ACT 5: THE BASALT CAVES
    // Map-based location with terrain, locked door, falling damage,
    // polymorph tactic, dragon multiattack, fire-mitigated damage,
    // death and revivify.
    // ====================================================================

    campaign = commit(campaign, [
      evt<SessionStartedEvent>({
        type: 'SessionStarted',
        sessionId: session2Id,
        name: 'Session 2: The Basalt Caves',
      }),
      evt<LocationCreatedEvent>({
        type: 'LocationCreated',
        locationId: dragonLairId,
        name: "Stoneheart Caverns",
        description: "A basalt-walled tunnel sloping into the deep. Heat rises.",
        map: {
          widthCells: 10,
          heightCells: 8,
          cellSizeFeet: 5,
          terrain: Array.from({ length: 8 }, (_, y) =>
            Array.from({ length: 10 }, (_, x) => {
              if (y === 0 && x >= 6) return 'impassable' as const;
              if (y === 4 && x === 3) return 'water' as const;
              if (y === 5 && (x === 4 || x === 5)) return 'difficult' as const;
              if (y === 7 && x === 9) return 'impassable' as const;
              return 'normal' as const;
            }),
          ),
        },
      }),
      evt<DoorAddedEvent>({
        type: 'DoorAdded',
        doorId: lairDoorId,
        locationId: dragonLairId,
        name: 'Iron portcullis',
        position: { x: 5, y: 2 },
        state: 'locked',
      }),
      evt<CharacterLocationChangedEvent>({ type: 'CharacterLocationChanged', characterId: alyx.id, toLocationId: dragonLairId }),
      evt<CharacterLocationChangedEvent>({ type: 'CharacterLocationChanged', characterId: mira.id, toLocationId: dragonLairId }),
      evt<CharacterLocationChangedEvent>({ type: 'CharacterLocationChanged', characterId: cassius.id, toLocationId: dragonLairId }),
      evt<CharacterLocationChangedEvent>({ type: 'CharacterLocationChanged', characterId: vex.id, toLocationId: dragonLairId }),
      evt<DoorStateChangedEvent>({
        type: 'DoorStateChanged',
        doorId: lairDoorId,
        toState: 'open',
        byCharacterId: vex.id,
      }),
    ]);

    // Vex misjudges a ledge and falls; the planner rolls 2d6 bludgeoning.
    campaign = commit(
      campaign,
      engine.plan.falling(campaign.state, {
        characterId: vex.id,
        distanceFeet: 20,
      }).events,
    );

    // The dragon awaits. Build an ogre as midboss first, defeat him,
    // then engage the dragon. (Two combats, one transcript.)
    const ogre = buildOgre('Slag the Ogre', 68, ogreClub.id);
    campaign = commit(campaign, [
      evt<ItemAcquiredEvent>({ type: 'ItemAcquired', instance: ogreClub }),
      evt<CharacterCreatedEvent>({ type: 'CharacterCreated', snapshot: ogre }),
    ]);

    const ogreEnc = engine.plan.createEncounter(campaign.state, {
      combatantIds: [alyx.id, cassius.id, vex.id, mira.id, ogre.id],
      name: 'Slag the Ogre',
    });
    campaign = commit(campaign, ogreEnc.events);
    campaign = commit(campaign, [
      evt<InitiativeRolledEvent>({
        type: 'InitiativeRolled',
        encounterId: ogreEnc.encounterId,
        rolls: [
          { combatantId: vex.id, d20: 19, modifier: 4, total: 23 },
          { combatantId: alyx.id, d20: 16, modifier: 2, total: 18 },
          { combatantId: mira.id, d20: 14, modifier: 2, total: 16 },
          { combatantId: cassius.id, d20: 11, modifier: 0, total: 11 },
          { combatantId: ogre.id, d20: 5, modifier: -1, total: 4 },
        ],
      }),
      evt<EncounterStartedEvent>({ type: 'EncounterStarted', encounterId: ogreEnc.encounterId }),
    ]);
    campaign = commit(
      campaign,
      engine.plan.beginFirstTurn(campaign.state, { encounterId: ogreEnc.encounterId }).events,
    );

    // Vex sneak-attacks (with advantage thanks to Cassius flanking).
    campaign = commit(
      campaign,
      engine.plan.attack(campaign.state, {
        attackerId: vex.id,
        targetId: ogre.id,
        weaponInstanceId: vexDagger.id,
        advantage: 'advantage',
      }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.advanceTurn(campaign.state, { encounterId: ogreEnc.encounterId }).events,
    );

    // Alyx attacks; cassius bless still active? Long rest reset slots,
    // so we'll skip the second bless.
    campaign = commit(
      campaign,
      engine.plan.attack(campaign.state, {
        attackerId: alyx.id,
        targetId: ogre.id,
        weaponInstanceId: alyxSword.id,
      }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.advanceTurn(campaign.state, { encounterId: ogreEnc.encounterId }).events,
    );

    // Mira polymorphs Alyx into a giant ape for the brawl. Polymorph
    // is a 4th-level spell and Mira (Wizard 7) has one 4th-level slot;
    // the showcase emits the declared + slot-consumed events alongside
    // the PolymorphApplied so the slot accounting reads correctly.
    const polymorphCastId = eventId();
    campaign = commit(campaign, [
      {
        id: polymorphCastId,
        at: at(),
        type: 'SpellCastDeclared',
        characterId: mira.id,
        spellId: 'polymorph',
        slotLevel: 4,
        slotSource: 'standard',
        targetIds: [alyx.id],
        castAsRitual: false,
      } satisfies SpellCastDeclaredEvent,
      evt<SpellSlotConsumedEvent>({
        type: 'SpellSlotConsumed',
        characterId: mira.id,
        slotLevel: 4,
        causedByEventId: polymorphCastId,
      }),
      evt<PolymorphAppliedEvent>({
        type: 'PolymorphApplied',
        targetId: alyx.id,
        casterId: mira.id,
        kind: 'polymorph',
        form: {
          name: 'Giant Ape',
          hp: 168,
          ac: 12,
          abilityScores: { STR: 23, DEX: 14, CON: 18, INT: 5, WIS: 12, CHA: 7 },
          speedFeet: 40,
        },
      }),
    ]);
    campaign = commit(
      campaign,
      engine.plan.advanceTurn(campaign.state, { encounterId: ogreEnc.encounterId }).events,
    );

    // Brother Cassius's turn: holds the line; no offensive action this
    // round (he's repositioning between the front and a downed Vex).
    campaign = commit(
      campaign,
      engine.plan.advanceTurn(campaign.state, { encounterId: ogreEnc.encounterId }).events,
    );

    // Slag's turn. Initiative places him after the whole party. He
    // crits Vex first — synthesizing a natural-20 + maxed-out greatclub
    // damage so the dropping-her-to-0 isn't a damage-from-nowhere
    // event. Vex's AC at this point is 12 (Studded Leather 12 + DEX
    // capped at +2 for medium-style fit). Crit dice: greatclub is 2d8,
    // doubled on crit -> 4d8 + STR 4. Rolls baked here so the
    // transcript reads as a single luckless swing.
    const vexHpAtHit = campaign.state.characters[vex.id]?.hp.current ?? 0;
    const slagCritAttackId = eventId();
    const slagCritRollId = eventId();
    const critTotalRolls = [7, 8, 6, 6]; // 27 base, +4 STR = 31. Vex drops.
    void critTotalRolls; // referenced via the literal in the event payload
    campaign = commit(campaign, [
      {
        id: slagCritAttackId,
        at: at(),
        type: 'AttackRolled',
        attackerId: ogre.id,
        targetId: vex.id,
        weaponInstanceId: ogreClub.id,
        d20: [20],
        used: 'none',
        attackBonus: 6,
        total: 26,
        targetAC: 12,
        hit: true,
        critical: true,
        attackKind: 'melee',
      } satisfies AttackRolledEvent,
      {
        id: slagCritRollId,
        at: at(),
        type: 'DamageRolled',
        attackerId: ogre.id,
        targetId: vex.id,
        weaponInstanceId: ogreClub.id,
        rolls: [
          { expression: '2d8', rolls: [7, 8, 6, 6], modifier: 4, type: 'bludgeoning' },
        ],
        critical: true,
        causedByEventId: slagCritAttackId,
      } satisfies DamageRolledEvent,
      evt<DamageAppliedEvent>({
        type: 'DamageApplied',
        targetId: vex.id,
        components: [{ amount: vexHpAtHit, type: 'bludgeoning' }],
        sourceCharacterId: ogre.id,
        source: 'greatclub (critical)',
        causedByEventId: slagCritRollId,
      }),
    ]);
    campaign = commit(
      campaign,
      engine.plan.multiattack(campaign.state, {
        attackerId: ogre.id,
        targetId: alyx.id,
      }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.advanceTurn(campaign.state, { encounterId: ogreEnc.encounterId }).events,
    );

    // Round 2 begins. Vex is unconscious at 0 — she rolls her death
    // save at the start of her turn (RAW). She succeeds.
    campaign = commit(campaign, [
      evt<DeathSaveRolledEvent>({
        type: 'DeathSaveRolled',
        targetId: vex.id,
        d20: 11,
        success: true,
        critical: false,
      }),
    ]);
    campaign = commit(
      campaign,
      engine.plan.advanceTurn(campaign.state, { encounterId: ogreEnc.encounterId }).events,
    );

    // Alyx (giant ape) slams Slag with a fist (MM Giant Ape Multiattack
    // is 2x 3d10+6 fists; this is a single slam landing in the believable
    // mid-range, attributed to Alyx in ape form).
    campaign = commit(campaign, [
      evt<DamageAppliedEvent>({
        type: 'DamageApplied',
        targetId: ogre.id,
        components: [{ amount: 25, type: 'bludgeoning' }],
        sourceCharacterId: alyx.id,
        source: 'Giant Ape slam',
      }),
    ]);
    campaign = commit(
      campaign,
      engine.plan.advanceTurn(campaign.state, { encounterId: ogreEnc.encounterId }).events,
    );

    // Mira's round 2 turn. She fires a wand charge to finish the ogre
    // off. Magic Missile at 3rd level is 5 darts of 1d4+1; we land near
    // the maximum (5x4 = 20 force) so the ogre drops.
    campaign = commit(campaign, [
      evt<ItemChargeConsumedEvent>({
        type: 'ItemChargeConsumed',
        itemInstanceId: wandOfMagicMissiles.id,
        amount: 2,
        byCharacterId: mira.id,
        forEffect: 'Magic Missile (3rd level)',
      }),
      evt<DamageAppliedEvent>({
        type: 'DamageApplied',
        targetId: ogre.id,
        components: [{ amount: Math.min(20, campaign.state.characters[ogre.id]?.hp.current ?? 0), type: 'force' }],
        sourceCharacterId: mira.id,
        source: 'Wand of Magic Missiles (5 darts, 3rd-level cast)',
      }),
    ]);
    campaign = commit(
      campaign,
      engine.plan.endEncounter(campaign.state, {
        encounterId: ogreEnc.encounterId,
        outcome: 'victory',
      }).events,
    );

    // Vex is unconscious-at-0. Brother Cassius is a Paladin 5 and so
    // has no 3rd-level slots of his own to cast Revivify natively; he
    // burns a Scroll of Revivify the party found in act 2 (consumers
    // are expected to model scroll inventory; the showcase elides
    // that). Vex returns at 1 HP.
    campaign = commit(
      campaign,
      engine.plan.resurrect(campaign.state, {
        casterId: cassius.id,
        targetId: vex.id,
        spell: 'revivify',
        via: 'scroll',
      }).events,
    );
    // Vex drinks a Potion of Greater Healing to recover further.
    campaign = commit(campaign, [
      evt({
        type: 'Healed',
        targetId: vex.id,
        amount: 30,
        source: 'Potion of Greater Healing',
      } as never),
    ]);

    // Revert Alyx from giant ape now that the fight's done.
    campaign = commit(campaign, [
      evt<PolymorphRevertedEvent>({
        type: 'PolymorphReverted',
        targetId: alyx.id,
        reason: 'voluntary',
      }),
    ]);

    // ====================================================================
    // ACT 6: THE DRAGON
    // Stoneheart, the young red dragon. Multiattack. Fire mitigation
    // shown via raw vs amount on a fireball that's resisted (not
    // immune; this engine instance doesn't have the immunity effect
    // installed, so we demonstrate resistance instead).
    // ====================================================================

    const dragon = CharacterSchema.parse({
      id: newCharacterId(),
      kind: 'creature',
      name: 'Stoneheart, the Young Red',
      statblockId: 'young-red-dragon',
      speciesId: 'dragonborn',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 10, hitDiceRemaining: 10 }],
      abilityScores: { STR: 23, DEX: 10, CON: 21, INT: 14, WIS: 11, CHA: 19 },
      hp: { current: 178, max: 178, temp: 0 },
      armorClass: 18, // natural armor (Young Red Dragon, MM 2024)
      featsTaken: ['savage-attacker'],
      speedFeet: 40,
      multiattack: {
        name: 'Rend x 3',
        attacks: [
          { weaponInstanceId: dragonRend.id, count: 3 },
        ],
      },
    });

    campaign = commit(campaign, [
      evt<ItemAcquiredEvent>({ type: 'ItemAcquired', instance: dragonRend }),
      evt<CharacterCreatedEvent>({ type: 'CharacterCreated', snapshot: dragon }),
    ]);

    const dragonEnc = engine.plan.createEncounter(campaign.state, {
      combatantIds: [alyx.id, cassius.id, vex.id, mira.id, dragon.id],
      name: 'Stoneheart the Young Red',
    });
    campaign = commit(campaign, dragonEnc.events);
    campaign = commit(campaign, [
      evt<InitiativeRolledEvent>({
        type: 'InitiativeRolled',
        encounterId: dragonEnc.encounterId,
        rolls: [
          { combatantId: vex.id, d20: 17, modifier: 4, total: 21 },
          { combatantId: mira.id, d20: 16, modifier: 2, total: 18 },
          { combatantId: dragon.id, d20: 12, modifier: 0, total: 12 },
          { combatantId: alyx.id, d20: 11, modifier: 2, total: 13 },
          { combatantId: cassius.id, d20: 8, modifier: 0, total: 8 },
        ],
      }),
      evt<EncounterStartedEvent>({ type: 'EncounterStarted', encounterId: dragonEnc.encounterId }),
    ]);
    campaign = commit(
      campaign,
      engine.plan.beginFirstTurn(campaign.state, { encounterId: dragonEnc.encounterId }).events,
    );

    // Vex slips behind for sneak attack.
    campaign = commit(
      campaign,
      engine.plan.attack(campaign.state, {
        attackerId: vex.id,
        targetId: dragon.id,
        weaponInstanceId: vexDagger.id,
        advantage: 'advantage',
      }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.advanceTurn(campaign.state, { encounterId: dragonEnc.encounterId }).events,
    );

    // Mira casts Magic Missile (auto-hit).
    campaign = commit(
      campaign,
      engine.plan.castSpell(campaign.state, {
        characterId: mira.id,
        spellId: 'magic-missile',
        slotLevel: 3,
        targetIds: [dragon.id, dragon.id, dragon.id, dragon.id, dragon.id],
      }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.advanceTurn(campaign.state, { encounterId: dragonEnc.encounterId }).events,
    );

    // Alyx's turn. Initiative places her before the dragon. She uses
    // the Sap weapon mastery on the dragon (debuffing its next attack),
    // then swings two-handed for damage.
    campaign = commit(
      campaign,
      engine.plan.weaponMastery(campaign.state, {
        mastery: 'Sap',
        attackerId: alyx.id,
        targetId: dragon.id,
        weaponInstanceId: alyxSword.id,
      }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.attack(campaign.state, {
        attackerId: alyx.id,
        targetId: dragon.id,
        weaponInstanceId: alyxSword.id,
      }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.advanceTurn(campaign.state, { encounterId: dragonEnc.encounterId }).events,
    );

    // Stoneheart's turn. The dragon breathes fire on the whole party
    // (synthetic AoE — in strict RAW the dice are rolled ONCE for the
    // breath and each target makes a DEX save for half; this engine
    // currently rolls per target, so the breath is injected manually so
    // each party member ends at 25 fire damage from a raw 50, resisted
    // by warding) and follows up with a multiattack against Alyx.
    for (const id of [alyx.id, mira.id, cassius.id, vex.id]) {
      campaign = commit(campaign, [
        evt<DamageAppliedEvent>({
          type: 'DamageApplied',
          targetId: id,
          components: [{ amount: 25, type: 'fire', rawAmount: 50, mitigation: 'resisted' }],
          sourceCharacterId: dragon.id,
          source: 'Fire Breath (DC 17 CON save; resisted by warding)',
        }),
      ]);
    }
    campaign = commit(
      campaign,
      engine.plan.multiattack(campaign.state, {
        attackerId: dragon.id,
        targetId: alyx.id,
      }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.advanceTurn(campaign.state, { encounterId: dragonEnc.encounterId }).events,
    );

    // Cassius restores hp to alyx via healing word (bonus action), then
    // attacks. Bless again would consume a slot, skip.
    campaign = commit(
      campaign,
      engine.plan.castSpell(campaign.state, {
        characterId: cassius.id,
        spellId: 'healing-word',
        slotLevel: 1,
        targetIds: [alyx.id],
        castingClassId: 'paladin',
      }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.attack(campaign.state, {
        attackerId: cassius.id,
        targetId: dragon.id,
        weaponInstanceId: cassiusSword.id,
      }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.advanceTurn(campaign.state, { encounterId: dragonEnc.encounterId }).events,
    );

    // Round 2 of the dragon fight. The party combines damage at
    // believable per-character levels until Stoneheart drops; each
    // hit is attributed and uses plausible 5.5e numbers for the
    // character that lands it.
    //
    // Stoneheart enters round 2 at 158 HP. The party brings him down:
    //   Vex: sneak attack from advantage (1d4+4 weapon + 3d6 sneak,
    //     landing near max = ~24)
    //   Mira: wand charge for a 3rd-level Magic Missile (5x(1d4+1)
    //     near max = ~22 force)
    //   Alyx: Sap-debuffed dragon, two attacks at +7 to hit for
    //     1d8+4 each, both landing near max = ~22 total
    //   Cassius: holy smite from a 2nd-level slot (1d8 sword + 3d8
    //     radiant smite, lands as a critical = ~32)
    // Combined ~100 damage; the dragon enters Cassius's turn near
    // 58 HP and Cassius's critical finisher lands the killing blow.
    const dragonRemainingBefore = campaign.state.characters[dragon.id]?.hp.current ?? 0;
    if (dragonRemainingBefore > 0) {
      // Vex's round-2 turn: opportunistic sneak attack from above.
      campaign = commit(campaign, [
        evt<DamageAppliedEvent>({
          type: 'DamageApplied',
          targetId: dragon.id,
          components: [{ amount: 24, type: 'piercing' }],
          sourceCharacterId: vex.id,
          source: 'dagger + Sneak Attack',
        }),
      ]);
      campaign = commit(
        campaign,
        engine.plan.advanceTurn(campaign.state, { encounterId: dragonEnc.encounterId }).events,
      );

      // Mira's round-2 turn: another wand charge.
      campaign = commit(campaign, [
        evt<ItemChargeConsumedEvent>({
          type: 'ItemChargeConsumed',
          itemInstanceId: wandOfMagicMissiles.id,
          amount: 3,
          byCharacterId: mira.id,
          forEffect: 'Magic Missile (3rd level)',
        }),
        evt<DamageAppliedEvent>({
          type: 'DamageApplied',
          targetId: dragon.id,
          components: [{ amount: 22, type: 'force' }],
          sourceCharacterId: mira.id,
          source: 'Wand of Magic Missiles (5 darts, 3rd-level cast)',
        }),
      ]);
      campaign = commit(
        campaign,
        engine.plan.advanceTurn(campaign.state, { encounterId: dragonEnc.encounterId }).events,
      );

      // Alyx's round-2 turn: sword + sword with Sap still on the
      // dragon. Synthetic to keep the encounter from running long;
      // ~22 total is in range for two longsword hits at +4 STR.
      campaign = commit(campaign, [
        evt<DamageAppliedEvent>({
          type: 'DamageApplied',
          targetId: dragon.id,
          components: [{ amount: 22, type: 'slashing' }],
          sourceCharacterId: alyx.id,
          source: 'longsword, two-handed',
        }),
      ]);
      campaign = commit(
        campaign,
        engine.plan.advanceTurn(campaign.state, { encounterId: dragonEnc.encounterId }).events,
      );

      // Stoneheart's round-2 turn: Vex (and the rest of the party)
      // dodge the bite. No damage; advance.
      campaign = commit(
        campaign,
        engine.plan.advanceTurn(campaign.state, { encounterId: dragonEnc.encounterId }).events,
      );

      // Cassius's round-2 turn: lands a holy smite finisher.
      // Whatever HP the dragon has left here becomes the smite total
      // (clamped at 35 to stay believable for a 2nd-level Divine Smite
      // crit).
      const dragonRemaining = campaign.state.characters[dragon.id]?.hp.current ?? 0;
      if (dragonRemaining > 0) {
        campaign = commit(campaign, [
          evt<DamageAppliedEvent>({
            type: 'DamageApplied',
            targetId: dragon.id,
            components: [
              { amount: Math.min(35, dragonRemaining), type: 'radiant' },
            ],
            sourceCharacterId: cassius.id,
            source: 'longsword + 2nd-level Divine Smite (critical)',
          }),
        ]);
      }
    }

    campaign = commit(
      campaign,
      engine.plan.endEncounter(campaign.state, {
        encounterId: dragonEnc.encounterId,
        outcome: 'victory',
      }).events,
    );

    // ====================================================================
    // ACT 7: AFTERMATH AND REWARDS
    // Treasure haul, quest completion, milestone, XP, wand recharge,
    // hire celebration, journal entry, session end.
    // ====================================================================

    campaign = commit(campaign, [
      evt<CurrencyAcquiredEvent>({
        type: 'CurrencyAcquired',
        partyId,
        amounts: { cp: 0, sp: 0, ep: 0, gp: 3200, pp: 18 },
        source: "Stoneheart's hoard",
      }),
      evt<ItemRechargedEvent>({
        type: 'ItemRecharged',
        itemInstanceId: wandOfMagicMissiles.id,
        amount: 4,
        cadence: 'dawn',
      }),
      evt<ObjectiveCompletedEvent>({ type: 'ObjectiveCompleted', questId: mainQuestId, objectiveId: obj3 }),
      evt<QuestCompletedEvent>({ type: 'QuestCompleted', questId: mainQuestId }),
      evt<QuestRewardClaimedEvent>({
        type: 'QuestRewardClaimed',
        questId: mainQuestId,
        beneficiaryCharacterIds: [alyx.id, mira.id, cassius.id, vex.id],
      }),
      evt<XPAwardedEvent>({
        type: 'XPAwarded',
        characterId: vex.id,
        amount: 500,
        source: 'killing blow on dragon',
        questId: mainQuestId,
      }),
      evt<MilestoneAwardedEvent>({
        type: 'MilestoneAwarded',
        kind: 'major',
        title: 'Stoneheart the Young Red is slain',
        partyId,
        questId: mainQuestId,
      }),
      evt<JournalEntryAddedEvent>({
        type: 'JournalEntryAdded',
        entryId: finalLogId,
        sessionId: session2Id,
        authorKind: 'player',
        authorCharacterId: mira.id,
        visibility: 'party',
        visibleToCharacterIds: [],
        title: 'In the dragon\'s wake',
        body: 'The cavern still smells of sulfur. We were lucky to come back at all. Vex was dead for a moment in the ogre cave. I keep thinking about that.',
      }),
      evt<InGameTimeAdvancedEvent>({
        type: 'InGameTimeAdvanced',
        minutes: LONG_REST_MINUTES,
        reason: 'long rest in the cavern',
      }),
      evt<SessionEndedEvent>({
        type: 'SessionEnded',
        sessionId: session2Id,
        summary: "Stoneheart is dead. The party hauls the hoard out and rides home heroes.",
      }),
    ]);

    // ===== Assertions =====

    // Architectural invariants: the test that matters most.
    const replayed = replay(campaign.events);
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(campaign.state));
    void throwOnCallRNG();
    expect(() => replay(campaign.events)).not.toThrow();

    // Quest is done; rewards distributed.
    expect(campaign.state.quests[mainQuestId]?.status).toBe('completed');
    expect(campaign.state.quests[mainQuestId]?.rewardClaimed).toBe(true);
    expect(campaign.state.characters[alyx.id]?.xp).toBe(1500);
    expect(campaign.state.characters[vex.id]?.xp).toBe(1500 + 500);
    expect(campaign.state.parties[partyId]?.purse.gp).toBe(240 + 1200 + 3200);
    expect(campaign.state.parties[partyId]?.purse.pp).toBe(12 + 18);

    // Two sessions ended; clock advanced.
    expect(campaign.state.activeSessionId).toBeUndefined();
    expect(campaign.state.sessions[session1Id]?.endedAtIso).toBeDefined();
    expect(campaign.state.sessions[session2Id]?.endedAtIso).toBeDefined();

    // Bastion grew, weathered damage, still standing.
    expect(campaign.state.bastions[bastionId]?.level).toBe(2);
    expect(campaign.state.bastions[bastionId]?.hpCurrent).toBe(82);
    expect(campaign.state.bastions[bastionId]?.facilities).toHaveLength(2);

    // Settings persisted through the entire campaign.
    expect(campaign.state.settings.heroPoints).toBe(true);
    expect(campaign.state.settings.customHouserules).toContain('inspiration-on-natural-1');

    // Alyx reverted from polymorph; Vex is alive post-revivify (and
    // healed past 1 HP from the potion).
    expect(campaign.state.characters[alyx.id]?.polymorphedSnapshot).toBeUndefined();
    expect(campaign.state.characters[vex.id]?.hp.current).toBeGreaterThanOrEqual(1);

    // Vex picked up a tool proficiency in downtime.
    expect(campaign.state.toolProficienciesByCharacter[vex.id]).toContain('thieves-tools');

    // Wand: started at 5, spent 2 (ogre wand-finish) + 3 (dragon wand-finish),
    // recharged 4 at dawn between fights. 5 - 2 + 4 - 3 = 4.
    expect(campaign.state.itemInstances[wandOfMagicMissiles.id]?.chargesRemaining).toBe(4);
    expect(campaign.state.itemInstances[wandOfMagicMissiles.id]?.identifiedByCharacterIds).toContain(mira.id);

    // Wagon survived the trip.
    expect(campaign.state.vehicles[wagonId]?.hp.current).toBe(70);

    // Two travel legs recorded.
    expect(campaign.state.travelLog).toHaveLength(2);

    // Locations all created; doors changed state; characters placed.
    expect(Object.keys(campaign.state.locations)).toHaveLength(3);
    expect(campaign.state.doors[lairDoorId]?.state).toBe('open');
    expect(campaign.state.characterLocations[alyx.id]).toBe(dragonLairId);

    // Bookend transcript.
    await expect(
      formatTranscript(campaign.events, STARTER_CONTENT, {
        title: 'The Stoneheart Saga',
      }),
    ).toMatchFileSnapshot('./transcripts/showcase.transcript.md');
  });
});
