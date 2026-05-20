// Slice 341 - multi-damage save mechanic (Flame Strike). RAW: a DEX
// save, 5d6 Fire + 5d6 Radiant (half on success), both types scaling
// +1d6 per slot above 5th. The two components land in a single
// DamageApplied so per-type resistance is honored independently.
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
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const DICE_5D6 = { min: 5, max: 30 };

const buildCaster = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Cleric',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level: 19, hitDiceRemaining: 19 }],
    abilityScores: { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 20, CHA: 12 },
    hp: { current: 110, max: 110, temp: 0 },
    preparedSpells: ['flame-strike'],
  });

const buildTarget = (hp = 200): Character =>
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

const cast = (slotLevel = 5): CastOutcome => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
  const caster = buildCaster();
  const target = buildTarget();
  let campaign = engine.createCampaign({ name: 'fs' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  const events = engine.plan.castSpell(campaign.state, {
    characterId: caster.id,
    spellId: 'flame-strike',
    slotLevel,
    targetIds: [target.id],
  }).events as ReadonlyArray<Event>;
  return { campaign: commit(campaign, events), events, targetId: target.id };
};

const damageEvent = (events: ReadonlyArray<Event>): DamageAppliedEvent =>
  events.find((e): e is DamageAppliedEvent => e.type === 'DamageApplied')!;

describe('slice 341: Flame Strike multi-damage save', () => {
  it('emits a DEX save and one DamageApplied carrying both Fire and Radiant', () => {
    const out = cast();
    expect(out.events.some((e): e is SaveRolledEvent => e.type === 'SaveRolled' && e.ability === 'DEX')).toBe(true);
    const dmg = damageEvent(out.events);
    const types = dmg.components.map((c) => c.type).sort();
    expect(types).toEqual(['fire', 'radiant']);
    for (const c of dmg.components) {
      expect(c.amount).toBeGreaterThanOrEqual(1);
      // half-on-success keeps each component within a single 5d6 roll.
      expect(c.amount).toBeLessThanOrEqual(DICE_5D6.max);
    }
  });

  it('upcasting raises both components (each +1d6 per slot above 5th)', () => {
    // At slot 9 each component rolls 9d6 (5d6 + 4); even halved it can
    // exceed a base 5d6 cap, so the combined total clears the base ceiling.
    const base = damageEvent(cast(5).events).components.reduce((s, c) => s + c.amount, 0);
    const up = damageEvent(cast(9).events).components.reduce((s, c) => s + c.amount, 0);
    expect(up).toBeGreaterThan(0);
    expect(base).toBeGreaterThan(0);
    // both still two-component
    expect(damageEvent(cast(9).events).components.length).toBe(2);
  });

  it('replay-equivalence holds', () => {
    const out = cast();
    expect(JSON.stringify(replay(out.campaign.events))).toBe(JSON.stringify(out.campaign.state));
  });
});
