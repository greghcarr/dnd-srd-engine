// Slice 500: Animal Friendship (L1) - Beast-only WIS-save charm.
//
// RAW (SRD 5.2.1 Animal Friendship, Bard/Druid/Ranger): "Target a
// Beast that you can see within range. The target must succeed on a
// Wisdom saving throw or have the Charmed condition for the duration.
// If you or one of your allies deals damage to the target, the spell
// ends."
//
// Engine additions (slice 500):
//   - `targetCreatureType?: CreatureType` on the save mechanic: targets
//     whose creature type doesn't match are skipped (no save, no
//     condition).
//   - `conditionEndsOnDamage?: boolean` on the save mechanic: stamps the
//     slice-391 per-instance endsOnDamage flag on the applied condition.
//
// Content: animal-friendship save mechanic (WIS, conditionOnFail
// 'charmed', targetCreatureType 'Beast', conditionEndsOnDamage true).
//
// Documented RAW deviation: endsOnDamage fires on ANY positive damage,
// not just caster-side damage; the 24h duration is consumer-managed.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();

const buildDruid = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Druid',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'druid', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 10, DEX: 12, CON: 13, INT: 10, WIS: 18, CHA: 10 },
    hp: { current: 24, max: 24, temp: 0 },
    knownSpells: ['animal-friendship'],
    preparedSpells: ['animal-friendship'],
  });

// A Beast (wolf statblock) — low WIS so it tends to fail the save.
const buildWolf = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Wolf',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'wolf',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 15, CON: 12, INT: 3, WIS: 7, CHA: 6 },
    hp: { current: 11, max: 11, temp: 0 },
  });

// A Humanoid (not a Beast) — should be skipped by the Beast filter.
const buildHumanoid = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Bandit',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 10, WIS: 7, CHA: 10 },
    hp: { current: 11, max: 11, temp: 0 },
  });

describe('Animal Friendship (slice 500)', () => {
  it('ships a WIS save gated to Beast targets, charmed-on-fail, ends-on-damage', () => {
    const s = PACK.spells.find((sp) => sp.id === 'animal-friendship');
    expect(s?.mechanicalEffects).toEqual([
      { kind: 'save', ability: 'WIS', conditionOnFail: 'charmed', targetCreatureType: 'Beast', conditionEndsOnDamage: true },
    ]);
  });

  it('a Beast that fails the WIS save gets Charmed (with endsOnDamage stamped)', () => {
    for (let seed = 1; seed < 40; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const druid = buildDruid();
      const wolf = buildWolf();
      let campaign: Campaign = engine.createCampaign({ name: `af-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: druid } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wolf } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.castSpell(campaign.state, {
        characterId: druid.id,
        spellId: 'animal-friendship',
        slotLevel: 1,
        targetIds: [wolf.id],
      }).events;
      const save = events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      expect(save, 'a Beast target rolls a save').toBeDefined();
      expect(save?.ability).toBe('WIS');
      if (save?.success === true) continue; // need a fail seed for the charm assertion
      const charm = events.find(
        (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'charmed',
      ) as ConditionAppliedEvent | undefined;
      expect(charm).toBeDefined();
      expect(charm?.targetId).toBe(wolf.id);
      expect((charm as { endsOnDamage?: boolean })?.endsOnDamage).toBe(true);
      return;
    }
    throw new Error('no failed-save seed across 40 tries');
  });

  it('a non-Beast (Humanoid) target is skipped entirely - no save, no charm', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const druid = buildDruid();
    const bandit = buildHumanoid();
    let campaign: Campaign = engine.createCampaign({ name: 'af-humanoid' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: druid } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bandit } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: druid.id,
      spellId: 'animal-friendship',
      slotLevel: 1,
      targetIds: [bandit.id],
    }).events;
    expect(events.some((e) => e.type === 'SaveRolled')).toBe(false);
    expect(events.some((e) => e.type === 'ConditionApplied')).toBe(false);
  });

  it('mixed targets: only the Beast is affected, the Humanoid is skipped', () => {
    for (let seed = 1; seed < 40; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const druid = buildDruid();
      const wolf = buildWolf();
      const bandit = buildHumanoid();
      let campaign: Campaign = engine.createCampaign({ name: `af-mixed-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: druid } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wolf } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bandit } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.castSpell(campaign.state, {
        characterId: druid.id,
        spellId: 'animal-friendship',
        slotLevel: 2,
        targetIds: [wolf.id, bandit.id],
      }).events;
      const saves = events.filter((e) => e.type === 'SaveRolled') as SaveRolledEvent[];
      // Only the wolf (Beast) rolls a save; the bandit (Humanoid) is skipped.
      expect(saves.length).toBe(1);
      return;
    }
    throw new Error('unreachable');
  });
});
