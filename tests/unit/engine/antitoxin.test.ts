// Slice 291 — Antitoxin + `event.savePreventsCondition` fact.
//
// RAW (SRD 5.2.1): "If you drink this vial of liquid, you have
// Advantage on saving throws to avoid or end the Poisoned
// condition for 1 hour."
//
// Pre-291 Antitoxin shipped `onConsume: []` — the engine had no
// way to gate save advantage on the specific condition the save
// would prevent or end. Slice 291 ships the new predicate fact
// (populated by cast-spell save mechanics with `conditionOnFail`
// and recurring-save planners with `onSuccess: 'removeCondition'`)
// + `antitoxin-active` condition with a slice-266 save wildcard
// gated on `event.savePreventsCondition === 'poisoned'`.

import { describe, expect, it } from 'vitest';
import { computeSavingThrow } from '../../../src/derive/save.js';
import { commit } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newAppliedConditionId, newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  ConditionAppliedEvent,
  TempHPGrantedEvent,
} from '../../../src/schemas/events/combat.js';
import type { ItemConsumedEvent } from '../../../src/schemas/events/inventory.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildHero = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
  });

const applyAntitoxin = (targetId: string): ConditionAppliedEvent => ({
  id: eventId(),
  at: isoTimestamp(),
  type: 'ConditionApplied',
  targetId: targetId as never,
  conditionId: 'antitoxin-active',
  appliedConditionId: newAppliedConditionId(),
});

describe('slice 291: Antitoxin + event.savePreventsCondition fact', () => {
  it('drinking Antitoxin emits ConditionApplied(antitoxin-active) + ItemConsumed', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(291) });
    const antitoxin = makeItemInstance('antitoxin');
    const baseHero = buildHero();
    const hero: Character = { ...baseHero, inventory: [antitoxin.id] };
    let campaign = engine.createCampaign({ name: 'antitoxin-consume' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: antitoxin },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.consumeItem(campaign.state, {
      characterId: hero.id,
      instanceId: antitoxin.id,
    });
    const condApplied = events.find(
      (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'antitoxin-active',
    ) as ConditionAppliedEvent | undefined;
    const consumed = events.find((e) => e.type === 'ItemConsumed') as ItemConsumedEvent | undefined;
    expect(condApplied).toBeDefined();
    expect(condApplied!.sourceCharacterId).toBe(hero.id);
    expect(consumed).toBeDefined();
  });

  describe('save advantage gated on savePreventsCondition', () => {
    const seedWithAntitoxin = () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(291) });
      const hero = buildHero();
      let campaign = engine.createCampaign({ name: 'antitoxin-save' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
        applyAntitoxin(hero.id),
      ]);
      return campaign.state.characters[hero.id]!;
    };

    it('save with savePreventsCondition="poisoned" gets advantage', () => {
      const bearer = seedWithAntitoxin();
      const result = computeSavingThrow({
        character: bearer,
        itemInstances: {},
        content: CONTENT,
        ability: 'CON',
        savePreventsCondition: 'poisoned',
      });
      expect(result.hasAdvantage).toBe(true);
    });

    it('save with savePreventsCondition="frightened" does NOT get advantage (different condition)', () => {
      const bearer = seedWithAntitoxin();
      const result = computeSavingThrow({
        character: bearer,
        itemInstances: {},
        content: CONTENT,
        ability: 'WIS',
        savePreventsCondition: 'frightened',
      });
      expect(result.hasAdvantage).toBe(false);
    });

    it('save with savePreventsCondition undefined (generic save) does NOT get advantage', () => {
      const bearer = seedWithAntitoxin();
      const result = computeSavingThrow({
        character: bearer,
        itemInstances: {},
        content: CONTENT,
        ability: 'CON',
      });
      expect(result.hasAdvantage).toBe(false);
    });

    it('every ability score (STR/DEX/CON/INT/WIS/CHA) gets advantage on a poisoned-gating save (slice-266 wildcard)', () => {
      const bearer = seedWithAntitoxin();
      for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const) {
        const result = computeSavingThrow({
          character: bearer,
          itemInstances: {},
          content: CONTENT,
          ability,
          savePreventsCondition: 'poisoned',
        });
        expect(result.hasAdvantage).toBe(true);
      }
    });

    it('a creature WITHOUT antitoxin-active gets NO advantage on a poisoned-gating save', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(291) });
      const hero = buildHero();
      let campaign = engine.createCampaign({ name: 'antitoxin-baseline' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
      ]);
      const result = computeSavingThrow({
        character: campaign.state.characters[hero.id]!,
        itemInstances: {},
        content: CONTENT,
        ability: 'CON',
        savePreventsCondition: 'poisoned',
      });
      expect(result.hasAdvantage).toBe(false);
    });
  });
});
