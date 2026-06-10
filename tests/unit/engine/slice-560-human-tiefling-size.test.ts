// Slice 560: Human + Tiefling Medium-or-Small size choice.
//
// RAW (SRD 5.2.1 Human): "Size: Medium or Small (your choice)."
// RAW (SRD 5.2.1 Tiefling): "Size: Medium or Small (your choice)."
//
// Pre-slice the engine hardcoded both species to Medium. The pack
// now declares an OfferChoice on each species ("human-size" /
// "tiefling-size"), the Character schema carries an optional
// `sizeOverride: Size`, and the `creatureSize` derive consults the
// override first.
//
// Consumer projection: the engine doesn't auto-apply OfferChoice
// option ids to `sizeOverride` (no SetSize effect kind exists). The
// consumer (UI / VTT / character builder) reads the resolved choice
// and sets `character.sizeOverride` before committing the character.
// Documented as consumer-managed; this slice verifies the schema +
// derive honor the override. (The "downstream Heavy-weapon disadvantage"
// the size choice once fed was the 2014 Small-creature-Heavy rule, which
// 2024 removed — slice 782; the block below now asserts size is decoupled
// from Heavy and only the STR/DEX-13 rule applies.)

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ItemAcquiredEvent } from '../../../src/schemas/events/inventory.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import { creatureSize } from '../../../src/derive/creature-size.js';
import { resolveContent } from '../../../src/content/pack.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

describe('Human / Tiefling Medium-or-Small size choice (slice 560)', () => {
  describe('pack OfferChoice declarations', () => {
    it('Human declares a human-size OfferChoice with Medium + Small options', () => {
      const human = PACK.species?.find((s) => s.id === 'human');
      expect(human).toBeDefined();
      const offer = human!.traits?.find(
        (t) => t.kind === 'OfferChoice' && t.choiceId === 'human-size',
      ) as { options: Array<{ id: string; label: string }> } | undefined;
      expect(offer).toBeDefined();
      const ids = offer!.options.map((o) => o.id);
      expect(ids).toContain('medium');
      expect(ids).toContain('small');
    });

    it('Tiefling declares a tiefling-size OfferChoice with Medium + Small options', () => {
      const tiefling = PACK.species?.find((s) => s.id === 'tiefling');
      expect(tiefling).toBeDefined();
      const offer = tiefling!.traits?.find(
        (t) => t.kind === 'OfferChoice' && t.choiceId === 'tiefling-size',
      ) as { options: Array<{ id: string; label: string }> } | undefined;
      expect(offer).toBeDefined();
      const ids = offer!.options.map((o) => o.id);
      expect(ids).toContain('medium');
      expect(ids).toContain('small');
    });
  });

  describe('creatureSize derive honors sizeOverride', () => {
    it('Human with no override: Medium (default species size)', () => {
      const human = CharacterSchema.parse({
        id: newCharacterId(), name: 'Alyx', speciesId: 'human', backgroundId: 'soldier',
        classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
        hp: { current: 12, max: 12, temp: 0 },
      });
      expect(creatureSize(human, CONTENT)).toBe('Medium');
    });

    it('Human with sizeOverride = Small: Small', () => {
      const human = CharacterSchema.parse({
        id: newCharacterId(), name: 'Pip', speciesId: 'human', backgroundId: 'soldier',
        classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 12, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
        hp: { current: 10, max: 10, temp: 0 },
        sizeOverride: 'Small',
      });
      expect(creatureSize(human, CONTENT)).toBe('Small');
    });

    it('Tiefling with sizeOverride = Small: Small', () => {
      const tiefling = CharacterSchema.parse({
        id: newCharacterId(), name: 'Imp', speciesId: 'tiefling', backgroundId: 'criminal',
        classes: [{ classId: 'rogue', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 10, DEX: 16, CON: 12, INT: 12, WIS: 10, CHA: 14 },
        hp: { current: 10, max: 10, temp: 0 },
        sizeOverride: 'Small',
      });
      expect(creatureSize(tiefling, CONTENT)).toBe('Small');
    });

    it('Tiefling with sizeOverride = Medium: Medium (explicit medium == default)', () => {
      const tiefling = CharacterSchema.parse({
        id: newCharacterId(), name: 'Vex', speciesId: 'tiefling', backgroundId: 'criminal',
        classes: [{ classId: 'rogue', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 10, DEX: 16, CON: 12, INT: 12, WIS: 10, CHA: 14 },
        hp: { current: 10, max: 10, temp: 0 },
        sizeOverride: 'Medium',
      });
      expect(creatureSize(tiefling, CONTENT)).toBe('Medium');
    });

    it('sizeOverride takes precedence over statblockId (overrides matter most)', () => {
      const c = CharacterSchema.parse({
        id: newCharacterId(), name: 'Override', speciesId: 'human', backgroundId: 'soldier',
        classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
        hp: { current: 12, max: 12, temp: 0 },
        statblockId: 'hill-giant', // would normally be Huge
        sizeOverride: 'Small',
      });
      expect(creatureSize(c, CONTENT)).toBe('Small');
    });
  });

  describe('Small size no longer affects Heavy-weapon attacks (2024 — slice 782)', () => {
    it('Small Human + Greatsword (STR 16): no disadvantage — 2024 decoupled size from Heavy', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const greatsword = makeItemInstance('greatsword');
      const human = CharacterSchema.parse({
        id: newCharacterId(), name: 'Pip', speciesId: 'human', backgroundId: 'soldier',
        classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
        hp: { current: 12, max: 12, temp: 0 },
        sizeOverride: 'Small',
        equipped: { mainHand: greatsword.id }, inventory: [greatsword.id],
      });
      const dummy = CharacterSchema.parse({
        id: newCharacterId(), name: 'Target', speciesId: 'human', backgroundId: 'soldier',
        classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 10, DEX: 10, CON: 12, INT: 10, WIS: 10, CHA: 10 },
        hp: { current: 30, max: 30, temp: 0 },
      });
      let campaign = engine.createCampaign({ name: 'small-heavy' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: human } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dummy } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: greatsword } satisfies ItemAcquiredEvent,
      ]);
      const { events } = engine.plan.attack(campaign.state, {
        attackerId: human.id, targetId: dummy.id, weaponInstanceId: greatsword.id,
      });
      const attack = events.find((e): e is AttackRolledEvent =>
        (e as { type: string }).type === 'AttackRolled');
      expect(attack?.used).toBe('none');
    });

    it('Medium Human attacking with Greatsword: no disadvantage (control)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
      const greatsword = makeItemInstance('greatsword');
      const human = CharacterSchema.parse({
        id: newCharacterId(), name: 'Alyx', speciesId: 'human', backgroundId: 'soldier',
        classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
        hp: { current: 12, max: 12, temp: 0 },
        // no sizeOverride; Human defaults Medium
        equipped: { mainHand: greatsword.id }, inventory: [greatsword.id],
      });
      const dummy = CharacterSchema.parse({
        id: newCharacterId(), name: 'Target', speciesId: 'human', backgroundId: 'soldier',
        classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 10, DEX: 10, CON: 12, INT: 10, WIS: 10, CHA: 10 },
        hp: { current: 30, max: 30, temp: 0 },
      });
      let campaign = engine.createCampaign({ name: 'medium-heavy' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: human } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dummy } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: greatsword } satisfies ItemAcquiredEvent,
      ]);
      const { events } = engine.plan.attack(campaign.state, {
        attackerId: human.id, targetId: dummy.id, weaponInstanceId: greatsword.id,
      });
      const attack = events.find((e): e is AttackRolledEvent =>
        (e as { type: string }).type === 'AttackRolled');
      expect(attack?.used).toBe('none');
    });

    it('Small Tiefling + Greatsword (STR 16): no disadvantage (same as Human, 2024)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
      const greatsword = makeItemInstance('greatsword');
      const tiefling = CharacterSchema.parse({
        id: newCharacterId(), name: 'Imp', speciesId: 'tiefling', backgroundId: 'criminal',
        classes: [{ classId: 'rogue', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 16, DEX: 14, CON: 12, INT: 12, WIS: 10, CHA: 14 },
        hp: { current: 10, max: 10, temp: 0 },
        sizeOverride: 'Small',
        equipped: { mainHand: greatsword.id }, inventory: [greatsword.id],
      });
      const dummy = CharacterSchema.parse({
        id: newCharacterId(), name: 'Target', speciesId: 'human', backgroundId: 'soldier',
        classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 10, DEX: 10, CON: 12, INT: 10, WIS: 10, CHA: 10 },
        hp: { current: 30, max: 30, temp: 0 },
      });
      let campaign = engine.createCampaign({ name: 'small-tief' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: tiefling } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dummy } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: greatsword } satisfies ItemAcquiredEvent,
      ]);
      const { events } = engine.plan.attack(campaign.state, {
        attackerId: tiefling.id, targetId: dummy.id, weaponInstanceId: greatsword.id,
      });
      const attack = events.find((e): e is AttackRolledEvent =>
        (e as { type: string }).type === 'AttackRolled');
      expect(attack?.used).toBe('none');
    });
  });
});
