// Slice 576: auto-fail save consumption.
//
// Closes the real RAW drift documented in slice 575's comment block:
// the pack carries `SetAdvantage { on: { kind:'save', ability:'STR'|'DEX' },
// mode: 'auto-fail' }` entries on Paralyzed / Stunned / Petrified /
// Unconscious. The EffectAccumulator tracks `autoFail` per ability,
// but pre-slice the save derive only exposed `hasAdvantage` /
// `hasDisadvantage`. The save planner therefore couldn't force-fail.
//
// Slice 576: `SaveResult` gains `hasAutoFail`; `rollSaveAgainstDC`
// sets `success = false` when the flag is true; the breakdown gets
// an 'auto-fail' source entry. The d20 + modifiers are still rolled
// and emitted for transcript visibility — the save just doesn't
// succeed regardless of the total.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { computeSavingThrow } from '../../../src/derive/save.js';
import { newAppliedConditionId, newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildVictim = (conditionId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Victim',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 20, DEX: 20, CON: 20, INT: 20, WIS: 20, CHA: 20 },
    hp: { current: 50, max: 50, temp: 0 },
    appliedConditions: [{
      id: newAppliedConditionId(),
      conditionId,
      appliedAt: isoTimestamp(),
    }],
  });

describe('Auto-fail save consumption (slice 576)', () => {
  describe('SaveResult exposes hasAutoFail', () => {
    for (const cond of ['paralyzed', 'stunned', 'petrified', 'unconscious']) {
      for (const ability of ['STR', 'DEX'] as const) {
        it(`${cond} bearer's ${ability} save derivation has hasAutoFail = true`, () => {
          const character = buildVictim(cond);
          const r = computeSavingThrow({
            character,
            itemInstances: {},
            content: CONTENT,
            ability,
          });
          expect(r.hasAutoFail).toBe(true);
        });
      }

      for (const ability of ['CON', 'INT', 'WIS', 'CHA'] as const) {
        it(`${cond} bearer's ${ability} save derivation has hasAutoFail = false (not in RAW set)`, () => {
          const character = buildVictim(cond);
          const r = computeSavingThrow({
            character,
            itemInstances: {},
            content: CONTENT,
            ability,
          });
          expect(r.hasAutoFail).toBe(false);
        });
      }
    }

    it('a healthy character has hasAutoFail = false', () => {
      const character = CharacterSchema.parse({
        id: newCharacterId(),
        name: 'Healthy',
        speciesId: 'human',
        backgroundId: 'soldier',
        classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        hp: { current: 10, max: 10, temp: 0 },
      });
      for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const) {
        expect(computeSavingThrow({
          character,
          itemInstances: {},
          content: CONTENT,
          ability,
        }).hasAutoFail).toBe(false);
      }
    });
  });

  describe('save planner forces failure on hasAutoFail', () => {
    it('Stunned STR save with high ability and low DC still fails', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const victim = buildVictim('stunned');
      let campaign = engine.createCampaign({ name: 'stunned-save-fail' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
      ]);
      // STR 20 (+5), L5 prof +3 = +8 base bonus. DC 5 should be auto-pass
      // for a healthy character; with Stunned, RAW auto-fails STR.
      const { events } = engine.plan.save(campaign.state, {
        characterId: victim.id,
        ability: 'STR',
        dc: 5,
      });
      const save = events.find((e): e is SaveRolledEvent =>
        (e as { type: string }).type === 'SaveRolled');
      expect(save).toBeDefined();
      expect(save!.success).toBe(false);
      // Breakdown surfaces the reason.
      expect(save!.breakdown?.some((b) => b.source === 'auto-fail')).toBe(true);
    });

    it('Paralyzed DEX save auto-fails', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
      const victim = buildVictim('paralyzed');
      let campaign = engine.createCampaign({ name: 'paralyzed-dex' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.save(campaign.state, {
        characterId: victim.id,
        ability: 'DEX',
        dc: 5,
      });
      const save = events.find((e): e is SaveRolledEvent =>
        (e as { type: string }).type === 'SaveRolled');
      expect(save!.success).toBe(false);
    });

    it('Petrified STR save auto-fails (composes Paralyzed in RAW)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
      const victim = buildVictim('petrified');
      let campaign = engine.createCampaign({ name: 'petrified-str' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.save(campaign.state, {
        characterId: victim.id,
        ability: 'STR',
        dc: 5,
      });
      const save = events.find((e): e is SaveRolledEvent =>
        (e as { type: string }).type === 'SaveRolled');
      expect(save!.success).toBe(false);
    });

    it('Unconscious STR save auto-fails', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
      const victim = buildVictim('unconscious');
      let campaign = engine.createCampaign({ name: 'unconscious-str' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.save(campaign.state, {
        characterId: victim.id,
        ability: 'STR',
        dc: 5,
      });
      const save = events.find((e): e is SaveRolledEvent =>
        (e as { type: string }).type === 'SaveRolled');
      expect(save!.success).toBe(false);
    });
  });

  describe('CON / INT / WIS / CHA saves on incapacitated targets resolve normally', () => {
    it('Stunned target succeeds at a CON save when total >= DC (RAW: only STR + DEX auto-fail)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const victim = buildVictim('stunned');
      let campaign = engine.createCampaign({ name: 'stunned-con-pass' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
      ]);
      // CON +5 mod, no proficiency on Fighter for CON at L5 (only STR + CON proficient).
      // Actually Fighter has STR + CON proficiency; CON +5 +3 = +8. DC 5 should pass easily.
      const { events } = engine.plan.save(campaign.state, {
        characterId: victim.id,
        ability: 'CON',
        dc: 5,
      });
      const save = events.find((e): e is SaveRolledEvent =>
        (e as { type: string }).type === 'SaveRolled');
      // The d20 + bonus should sail past DC 5; success should be true.
      // (Worst case d20 = 1 plus +8 = 9 >= 5).
      expect(save!.success).toBe(true);
    });
  });
});
