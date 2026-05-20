// Slice 339 - HP-threshold `condition` arm (Power Word Stun). RAW: a
// target with 150 Hit Points or fewer gains the Stunned condition (with
// a recurring CON save to end); above 150, its Speed is 0 until the
// start of the caster's next turn. Also pins the pattern-check fix:
// spell-bound incapacitating condition variants (the new
// power-word-stunned-active and the pre-existing held-paralyzed-active)
// are now action-blocking.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { replay } from '../../../src/engine/replay.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import {
  findActorBlockingCondition,
  ACTION_BLOCKING_CONDITIONS,
} from '../../../src/engine/plan/_actor-state.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { Event } from '../../../src/schemas/events/index.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const STUNNED_ID = 'power-word-stunned-active';
const SPEED_ZERO_ID = 'power-word-speed-zero-active';

const buildCaster = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Archmage',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 19, hitDiceRemaining: 19 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 20, WIS: 12, CHA: 10 },
    hp: { current: 90, max: 90, temp: 0 },
    preparedSpells: ['power-word-stun'],
  });

const buildTarget = (hp: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Foe',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: hp, max: hp, temp: 0 },
  });

interface CastOutcome {
  campaign: Campaign;
  events: ReadonlyArray<Event>;
  targetId: string;
}

const castOn = (target: Character): CastOutcome => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
  const caster = buildCaster();
  let campaign = engine.createCampaign({ name: 'pws' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  const events = engine.plan.castSpell(campaign.state, {
    characterId: caster.id,
    spellId: 'power-word-stun',
    slotLevel: 8,
    targetIds: [target.id],
  }).events as ReadonlyArray<Event>;
  return { campaign: commit(campaign, events), events, targetId: target.id };
};

const appliedConditionIds = (events: ReadonlyArray<Event>): string[] =>
  events
    .filter((e): e is ConditionAppliedEvent => e.type === 'ConditionApplied')
    .map((e) => e.conditionId);

describe('slice 339: Power Word Stun HP-threshold condition arm', () => {
  it('stuns a target at or below 150 HP, and the stun is action-blocking', () => {
    const out = castOn(buildTarget(120));
    expect(appliedConditionIds(out.events)).toContain(STUNNED_ID);
    expect(appliedConditionIds(out.events)).not.toContain(SPEED_ZERO_ID);
    const t = out.campaign.state.characters[out.targetId]!;
    expect(findActorBlockingCondition(t)).toBe(STUNNED_ID);
  });

  it('sets Speed 0 (not Stunned) on a target above 150 HP', () => {
    const out = castOn(buildTarget(200));
    expect(appliedConditionIds(out.events)).toContain(SPEED_ZERO_ID);
    expect(appliedConditionIds(out.events)).not.toContain(STUNNED_ID);
    // The speed-0 arm does not incapacitate.
    const t = out.campaign.state.characters[out.targetId]!;
    expect(findActorBlockingCondition(t)).toBeUndefined();
  });

  it('boundary: exactly 150 HP is stunned (<= threshold)', () => {
    const out = castOn(buildTarget(150));
    expect(appliedConditionIds(out.events)).toContain(STUNNED_ID);
  });

  it('replay-equivalence holds for both arms', () => {
    for (const hp of [120, 200]) {
      const out = castOn(buildTarget(hp));
      expect(JSON.stringify(replay(out.campaign.events))).toBe(
        JSON.stringify(out.campaign.state),
      );
    }
  });

  it('pattern-check: spell-bound incapacitating variants are action-blocking', () => {
    // held-paralyzed-active was missing pre-slice 339 (Hold Person /
    // Hold Monster targets could still act); power-word-stunned-active
    // is the new entry.
    expect(ACTION_BLOCKING_CONDITIONS.has('held-paralyzed-active')).toBe(true);
    expect(ACTION_BLOCKING_CONDITIONS.has(STUNNED_ID)).toBe(true);
  });
});
