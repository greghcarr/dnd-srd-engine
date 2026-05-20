// Slice 292 — Perfume + `perfumed-active` condition.
//
// RAW (SRD 5.2.1 Equipment 'Perfume'): "For 1 hour after applying
// Perfume to yourself, you have Advantage on Charisma (Persuasion)
// checks made to influence an Indifferent Humanoid within 5 feet
// of yourself."
//
// Pre-292 Perfume shipped `onConsume: []`. This slice ships a pure
// content wire on top of the existing primitives: slice-236
// ApplyCondition + a new perfumed-active condition with
// `SetAdvantage on:{kind:'skill', skill:'persuasion'} mode:'advantage'`.
// The skill-discriminated SetAdvantage target has been in the
// schema since slice 263 / 274 (Eyes of the Eagle, Gloves of
// Swimming); this slice is the canonical Persuasion user. The
// target-attitude / range / duration gates stay consumer-managed.

import { describe, expect, it } from 'vitest';
import { computeAbilityCheck } from '../../../src/derive/ability-check.js';
import { commit } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newAppliedConditionId, newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { ItemConsumedEvent } from '../../../src/schemas/events/inventory.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildBard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Tally',
    speciesId: 'human',
    backgroundId: 'entertainer',
    classes: [{ classId: 'bard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 12, CHA: 18 },
    hp: { current: 30, max: 30, temp: 0 },
  });

const applyPerfume = (targetId: string): ConditionAppliedEvent => ({
  id: eventId(),
  at: isoTimestamp(),
  type: 'ConditionApplied',
  targetId: targetId as never,
  conditionId: 'perfumed-active',
  appliedConditionId: newAppliedConditionId(),
});

describe('slice 292: Perfume + perfumed-active condition', () => {
  it('applying Perfume emits ConditionApplied(perfumed-active) + ItemConsumed', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(292) });
    const perfume = makeItemInstance('perfume');
    const baseBard = buildBard();
    const bard: Character = { ...baseBard, inventory: [perfume.id] };
    let campaign = engine.createCampaign({ name: 'perfume-apply' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: perfume },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bard } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.consumeItem(campaign.state, {
      characterId: bard.id,
      instanceId: perfume.id,
    });
    const condApplied = events.find(
      (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'perfumed-active',
    ) as ConditionAppliedEvent | undefined;
    const consumed = events.find((e) => e.type === 'ItemConsumed') as ItemConsumedEvent | undefined;
    expect(condApplied).toBeDefined();
    expect(condApplied!.sourceCharacterId).toBe(bard.id);
    expect(consumed).toBeDefined();
  });

  describe('skill-discriminated advantage on Persuasion only', () => {
    const seedWithPerfume = () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(292) });
      const bard = buildBard();
      let campaign = engine.createCampaign({ name: 'perfumed' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bard } satisfies CharacterCreatedEvent,
        applyPerfume(bard.id),
      ]);
      return campaign.state.characters[bard.id]!;
    };

    it('Charisma (Persuasion) check gets advantage', () => {
      const bearer = seedWithPerfume();
      const r = computeAbilityCheck({
        character: bearer,
        itemInstances: {},
        content: CONTENT,
        ability: 'CHA',
        skill: 'persuasion',
      });
      expect(r.hasAdvantage).toBe(true);
    });

    it('Charisma (Deception) check does NOT get advantage', () => {
      const bearer = seedWithPerfume();
      const r = computeAbilityCheck({
        character: bearer,
        itemInstances: {},
        content: CONTENT,
        ability: 'CHA',
        skill: 'deception',
      });
      expect(r.hasAdvantage).toBe(false);
    });

    it('raw Charisma check (no skill) does NOT get advantage', () => {
      const bearer = seedWithPerfume();
      const r = computeAbilityCheck({
        character: bearer,
        itemInstances: {},
        content: CONTENT,
        ability: 'CHA',
      });
      expect(r.hasAdvantage).toBe(false);
    });

    it('Persuasion checks of other ability scores: still ride the skill match', () => {
      // RAW Persuasion is a CHA skill, but the schema allows any
      // ability mod (a homebrew might roll Persuasion with WIS).
      // Slice 265 inheritance: advantageFor consulted at both skill
      // and underlying ability check targets, OR-merged. Perfume's
      // SetAdvantage is on the skill target, so it fires regardless
      // of which ability the consumer chose to roll under.
      const bearer = seedWithPerfume();
      const r = computeAbilityCheck({
        character: bearer,
        itemInstances: {},
        content: CONTENT,
        ability: 'WIS',
        skill: 'persuasion',
      });
      expect(r.hasAdvantage).toBe(true);
    });

    it('a bard WITHOUT perfumed-active gets NO advantage on Persuasion', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(292) });
      const bard = buildBard();
      let campaign = engine.createCampaign({ name: 'perfume-baseline' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bard } satisfies CharacterCreatedEvent,
      ]);
      const r = computeAbilityCheck({
        character: campaign.state.characters[bard.id]!,
        itemInstances: {},
        content: CONTENT,
        ability: 'CHA',
        skill: 'persuasion',
      });
      expect(r.hasAdvantage).toBe(false);
    });
  });
});
