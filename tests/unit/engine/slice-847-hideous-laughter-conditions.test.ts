// Slice 847 — Hideous Laughter projects Prone + Incapacitated, and the
// damage-triggered repeat save rolls with Advantage.
//
// Bug (L7 audit row `hideous-laughter-no-conditions`): `hideous-laughter-active`
// shipped `effects: []`. The Incapacitated half was wired (the variant id is in
// ACTION_BLOCKING_CONDITIONS, slice 366) but the Prone half projected nothing —
// a creature laughing helplessly on the ground was NOT easier to hit in melee.
// RAW (SRD 5.2.1): "On a failed save, it has the Prone and Incapacitated
// conditions for the duration. ... At the end of each of its turns AND each time
// it takes damage, it makes another Wisdom saving throw. The target has
// Advantage on the save if the save is triggered by damage."
//
// Slice 847 (a) gives the variant Prone's three effect-stack arms (generic,
// keyed on event.attackKind, so they reproduce Prone's combat math) and (b)
// adds a force-advantage flag threaded tickRecurringSave -> _save-roll ->
// computeSavingThrow so the consumer can roll the damage-triggered repeat save
// with Advantage (netted against any disadvantage per RAW).
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { ACTION_BLOCKING_CONDITIONS } from '../../../src/engine/plan/_actor-state.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newAppliedConditionId, newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ItemAcquiredEvent } from '../../../src/schemas/events/inventory.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';

const PACK = loadStarterPack();
const CONDITION_ID = 'hideous-laughter-active';

const buildFighter = (name: string, mainHandId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
    inventory: [mainHandId],
    equipped: { mainHand: mainHandId, attuned: [] },
  });

// A target carrying hideous-laughter-active, sourced to `casterId` so the
// recurring save resolves the caster's spell DC.
const buildLaughingVictim = (casterId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Cackler',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
    appliedConditions: [{
      id: newAppliedConditionId(),
      conditionId: CONDITION_ID,
      appliedAt: isoTimestamp(),
      sourceCharacterId: casterId,
    }],
  });

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Jester',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 24, max: 24, temp: 0 },
    preparedSpells: ['hideous-laughter'],
  });

const findAttack = (events: ReadonlyArray<unknown>): AttackRolledEvent | undefined =>
  events.find((e): e is AttackRolledEvent => (e as { type: string }).type === 'AttackRolled');

const findSave = (events: ReadonlyArray<unknown>): SaveRolledEvent | undefined =>
  events.find((e): e is SaveRolledEvent => (e as { type: string }).type === 'SaveRolled');

interface CondEffect { readonly kind: string; readonly on?: unknown; readonly mode?: string }
const effects = (): CondEffect[] =>
  (PACK.conditions?.find((c) => c.id === CONDITION_ID)?.effects ?? []) as CondEffect[];

describe('slice 847: Hideous Laughter projects Prone + Incapacitated', () => {
  it('the variant carries Prone’s three effect-stack arms (was effects: [])', () => {
    const e = effects();
    // Bearer's own attacks at Disadvantage.
    expect(e.some((x) => x.kind === 'SetAdvantage' && x.on === 'attack' && x.mode === 'disadvantage')).toBe(true);
    // Melee attackers gain Advantage; ranged attackers take Disadvantage.
    expect(e.some((x) => x.kind === 'GrantAdvantageToAttackers')).toBe(true);
    expect(e.some((x) => x.kind === 'ImposeDisadvantageOnAttackers')).toBe(true);
  });

  it('the variant is still action-blocking (the Incapacitated half)', () => {
    // Prone + Incapacitated compose: Prone via the effects above, Incapacitated
    // via the engine-coded allowlist (slice 366).
    expect(ACTION_BLOCKING_CONDITIONS.has(CONDITION_ID)).toBe(true);
  });

  it('a melee attack against the laughing target rolls with Advantage', () => {
    const longsword = makeItemInstance('longsword');
    const fighter = buildFighter('Aria', longsword.id);
    const victim = buildLaughingVictim(fighter.id);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    let campaign = engine.createCampaign({ name: 'laugh-melee' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword } satisfies ItemAcquiredEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.attack(campaign.state, {
      attackerId: fighter.id,
      targetId: victim.id,
      weaponInstanceId: longsword.id,
    });
    expect(findAttack(events)!.used).toBe('advantage');
  });

  it('a ranged attack against the laughing target rolls with Disadvantage', () => {
    const bow = makeItemInstance('longbow');
    const fighter = buildFighter('Aria', bow.id);
    const victim = buildLaughingVictim(fighter.id);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    let campaign = engine.createCampaign({ name: 'laugh-ranged' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bow } satisfies ItemAcquiredEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.attack(campaign.state, {
      attackerId: fighter.id,
      targetId: victim.id,
      weaponInstanceId: bow.id,
    });
    expect(findAttack(events)!.used).toBe('disadvantage');
  });
});

describe('slice 847: the damage-triggered repeat save rolls with Advantage', () => {
  const setup = () => {
    const wizard = buildWizard();
    const victim = buildLaughingVictim(wizard.id);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
    let campaign = engine.createCampaign({ name: 'laugh-resave' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
    ]);
    return { engine, state: campaign.state, victimId: victim.id };
  };

  it('the end-of-turn tick rolls a flat WIS save (no advantage flag)', () => {
    const { engine, state, victimId } = setup();
    const { events } = engine.plan.tickRecurringSave(state, {
      targetId: victimId,
      conditionId: CONDITION_ID,
    });
    const save = findSave(events)!;
    expect(save.ability).toBe('WIS');
    expect(save.used).toBe('none');
    expect(save.d20.length).toBe(1);
  });

  it('the damage-triggered tick (advantage: true) rolls WIS with Advantage', () => {
    const { engine, state, victimId } = setup();
    const { events } = engine.plan.tickRecurringSave(state, {
      targetId: victimId,
      conditionId: CONDITION_ID,
      advantage: true,
    });
    const save = findSave(events)!;
    expect(save.ability).toBe('WIS');
    expect(save.used).toBe('advantage');
    expect(save.d20.length).toBe(2);
  });
});
