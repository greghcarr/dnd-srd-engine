// Slice 338 - HP-threshold tier effect (Power Word Kill, the canonical
// user of the new `hp-threshold` SpellMechanic). RAW: a target with
// 100 Hit Points or fewer is destroyed (CreatureDestroyed, bypassing
// death saves, slice 323); above 100 it takes 12d12 Psychic instead.
// Exercises both arms, the threshold boundary, and replay-equivalence.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { replay } from '../../../src/engine/replay.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { Event } from '../../../src/schemas/events/index.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const DEATH_SAVE_FAILURES_TO_DIE = 3;
const PWK_DICE = { min: 12, max: 144 }; // 12d12 psychic

const buildCaster = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Archmage',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 19, hitDiceRemaining: 19 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 20, WIS: 12, CHA: 10 },
    hp: { current: 90, max: 90, temp: 0 },
    preparedSpells: ['power-word-kill'],
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
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
  const caster = buildCaster();
  let campaign = engine.createCampaign({ name: 'pwk' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  const events = engine.plan.castSpell(campaign.state, {
    characterId: caster.id,
    spellId: 'power-word-kill',
    slotLevel: 9,
    targetIds: [target.id],
  }).events as ReadonlyArray<Event>;
  return { campaign: commit(campaign, events), events, targetId: target.id };
};

describe('slice 338: Power Word Kill HP-threshold', () => {
  it('destroys a target at or below 100 HP, with no damage roll', () => {
    const out = castOn(buildTarget(80));
    const types = out.events.map((e) => e.type);
    expect(types).toContain('CreatureDestroyed');
    expect(types).not.toContain('DamageApplied');
    const t = out.campaign.state.characters[out.targetId];
    expect(t?.hp.current).toBe(0);
    expect(t?.deathSaves.failures).toBe(DEATH_SAVE_FAILURES_TO_DIE);
  });

  it('deals 12d12 psychic to a target above 100 HP, with no destroy', () => {
    const out = castOn(buildTarget(150));
    const types = out.events.map((e) => e.type);
    expect(types).toContain('DamageApplied');
    expect(types).not.toContain('CreatureDestroyed');
    const dmg = out.events.find(
      (e): e is DamageAppliedEvent => e.type === 'DamageApplied',
    )!;
    expect(dmg.components.every((c) => c.type === 'psychic')).toBe(true);
    const total = dmg.components.reduce((s, c) => s + c.amount, 0);
    expect(total).toBeGreaterThanOrEqual(PWK_DICE.min);
    expect(total).toBeLessThanOrEqual(PWK_DICE.max);
    expect(out.campaign.state.characters[out.targetId]?.hp.current).toBe(150 - total);
  });

  it('boundary: a target with exactly 100 HP is destroyed (<= threshold)', () => {
    const out = castOn(buildTarget(100));
    expect(out.events.map((e) => e.type)).toContain('CreatureDestroyed');
  });

  it('replay-equivalence holds for both arms', () => {
    for (const hp of [80, 150]) {
      const out = castOn(buildTarget(hp));
      expect(JSON.stringify(replay(out.campaign.events))).toBe(
        JSON.stringify(out.campaign.state),
      );
    }
  });
});
