// Slice 727: Fighter L6 Ability Score Improvement.
//
// SRD 5.2.1: the Fighter gains an Ability Score Improvement at levels 4,
// 6, 8, 12, 14, 16 (more than the every-class 4/8/12/16). The L4 cascade
// (slice 707) was never copied to L6; this adds the same OfferChoice
// (ASI feat or another general feat) to the Fighter's L6 row.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent } from '../../../src/schemas/events/level-up.js';

const PACK = loadStarterPack();

const buildFighter = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Fighter',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level, hitDiceRemaining: level }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
    hp: { current: 44, max: 44, temp: 0, maxBonus: 0 },
  });

describe('slice 727: Fighter L6 Ability Score Improvement', () => {
  it('the fighter L6 row carries the ASI/feat OfferChoice', () => {
    const fighter = PACK.classes.find((c) => c.id === 'fighter')!;
    const feature = fighter.levelTable['6']!.features.find((f) => f.id === 'ability-score-improvement-6');
    expect(feature, 'fighter L6 missing ability-score-improvement-6').toBeDefined();
    expect((feature!.effects ?? []).some((e) => e.kind === 'OfferChoice')).toBe(true);
  });

  it('a Fighter leveling 5→6 receives an ASI/feat ChoiceRequired', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const fighter = buildFighter(5);
    let campaign = engine.createCampaign({ name: 'l6-asi' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.levelUp(campaign.state, {
      characterId: fighter.id,
      classId: 'fighter',
      hpStrategy: 'average',
    });
    const choice = events.find(
      (e): e is ChoiceRequiredEvent =>
        (e as { type?: string }).type === 'ChoiceRequired' &&
        /ability-score|asi|feat/i.test((e as { promptKey?: string }).promptKey ?? ''),
    );
    expect(choice, 'no ASI/feat ChoiceRequired emitted on the 5→6 level-up').toBeDefined();
  });
});
