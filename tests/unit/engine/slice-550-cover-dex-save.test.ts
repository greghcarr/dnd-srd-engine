// Slice 550: Cover bonus on Dexterity saving throws.
//
// RAW (SRD 5.2.1 Cover): "A target with half cover has a +2 bonus to
// AC and Dexterity saving throws. A target with three-quarters cover
// has a +5 bonus to AC and Dexterity saving throws."
//
// Pre-slice the cover field was only applied to AC (coverACBonus).
// This slice mirrors the bonus onto Dexterity saves via the new
// coverDexSaveBonus helper, threaded through both `rollSaveAgainstDC`
// (used by spell on-hit-save / breath weapon / recurring saves) and
// the public `planSave` (used by direct save calls).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import { coverDexSaveBonus, coverACBonus } from '../../../src/engine/plan/attack.js';

const PACK = loadStarterPack();

const buildCharacter = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Halfling',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
  });

const seedCampaign = (engine: ReturnType<typeof createEngine>, character: Character) => {
  let campaign = engine.createCampaign({ name: 'cover-save' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: character } satisfies CharacterCreatedEvent,
  ]);
  return campaign;
};

describe('Cover bonus on Dex saves (slice 550)', () => {
  describe('coverDexSaveBonus helper', () => {
    it('returns 0 for none, +2 for half, +5 for three-quarters, 0 for total', () => {
      expect(coverDexSaveBonus('none')).toBe(0);
      expect(coverDexSaveBonus('half')).toBe(2);
      expect(coverDexSaveBonus('three-quarters')).toBe(5);
      expect(coverDexSaveBonus('total')).toBe(0);
    });

    it('mirrors coverACBonus exactly (same bonus values for both arms)', () => {
      for (const c of ['none', 'half', 'three-quarters', 'total'] as const) {
        expect(coverDexSaveBonus(c)).toBe(coverACBonus(c));
      }
    });
  });

  describe('planSave', () => {
    it('DEX save with half cover: +2 added to bonus + breakdown reflects it', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const character = buildCharacter();
      const campaign = seedCampaign(engine, character);
      const { events } = engine.plan.save(campaign.state, {
        characterId: character.id,
        ability: 'DEX',
        dc: 15,
        cover: 'half',
      });
      const save = events[0] as SaveRolledEvent;
      // DEX 14 = +2 mod (no proficiency on Fighter L1 DEX saves)
      // + half cover +2 = bonus should be 4
      expect(save.bonus).toBe(4);
      expect(save.breakdown?.some((b) => b.source.includes('cover (half)') && b.value === 2)).toBe(true);
    });

    it('DEX save with three-quarters cover: +5 added', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
      const character = buildCharacter();
      const campaign = seedCampaign(engine, character);
      const { events } = engine.plan.save(campaign.state, {
        characterId: character.id,
        ability: 'DEX',
        dc: 15,
        cover: 'three-quarters',
      });
      const save = events[0] as SaveRolledEvent;
      expect(save.bonus).toBe(7); // DEX +2 + cover +5
      expect(save.breakdown?.some((b) => b.source.includes('cover (three-quarters)') && b.value === 5)).toBe(true);
    });

    it('DEX save with no cover: no bonus + no breakdown entry', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
      const character = buildCharacter();
      const campaign = seedCampaign(engine, character);
      const { events } = engine.plan.save(campaign.state, {
        characterId: character.id,
        ability: 'DEX',
        dc: 15,
      });
      const save = events[0] as SaveRolledEvent;
      expect(save.bonus).toBe(2); // just DEX +2
      expect(save.breakdown?.some((b) => b.source.includes('cover'))).toBe(false);
    });

    it('CON save with half cover: NO bonus (cover only applies to DEX)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
      const character = buildCharacter();
      const campaign = seedCampaign(engine, character);
      const { events } = engine.plan.save(campaign.state, {
        characterId: character.id,
        ability: 'CON',
        dc: 15,
        cover: 'half',
      });
      const save = events[0] as SaveRolledEvent;
      // CON 12 = +1 mod (Fighter L1 IS proficient in CON saves, +2 PB = +3)
      expect(save.bonus).toBe(3);
      expect(save.breakdown?.some((b) => b.source.includes('cover'))).toBe(false);
    });

    it('STR save with three-quarters cover: NO bonus', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
      const character = buildCharacter();
      const campaign = seedCampaign(engine, character);
      const { events } = engine.plan.save(campaign.state, {
        characterId: character.id,
        ability: 'STR',
        dc: 15,
        cover: 'three-quarters',
      });
      const save = events[0] as SaveRolledEvent;
      // STR 10 (+0) + Fighter L1 STR proficient (+2 PB)
      expect(save.bonus).toBe(2);
      expect(save.breakdown?.some((b) => b.source.includes('cover'))).toBe(false);
    });

    it('DEX save with total cover: no cover bonus (target untargetable anyway; consumer enforcement)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(6) });
      const character = buildCharacter();
      const campaign = seedCampaign(engine, character);
      const { events } = engine.plan.save(campaign.state, {
        characterId: character.id,
        ability: 'DEX',
        dc: 15,
        cover: 'total',
      });
      const save = events[0] as SaveRolledEvent;
      expect(save.bonus).toBe(2); // just DEX
    });
  });
});
