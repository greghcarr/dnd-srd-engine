// Slice 718: wire the RecoverResource effect on a Short Rest.
//
// Two L5 features were content-declared but mechanically inert because
// RecoverResource was a no-op:
//   - Bard Font of Inspiration: regain ALL Bardic Inspiration on a Short
//     Rest (RecoverResource amount 'all').
//   - Sorcerer Sorcerous Restoration: regain floor(level/2) Sorcery Points
//     on a Short Rest, once per Long Rest (RecoverResource with a
//     limitedByResourceId gate + a half-level Formula amount).
// planShortRest now resolves these into resourceDeltas baked on the
// ShortRestEnded event; the reducer applies them (clamped 0..max).

import { describe, expect, it } from 'vitest';
import { createEngine, seedResourcesFromContent } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ResourceSpentEvent } from '../../../src/schemas/events/resources.js';
import type { ULID } from '../../../src/engine/ids-utils.js';

const PACK = loadStarterPack();
const ENGINE = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });

const buildBard = (level: number): Character =>
  seedResourcesFromContent(
    CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Bard',
      speciesId: 'human',
      backgroundId: 'sage',
      classes: [{ classId: 'bard', level, hitDiceRemaining: level }],
      abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 16 },
      hp: { current: 20, max: 20, temp: 0 },
    }),
    ENGINE.content,
  );

const buildSorcerer = (level: number): Character =>
  seedResourcesFromContent(
    CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Sorc',
      speciesId: 'human',
      backgroundId: 'sage',
      classes: [{ classId: 'sorcerer', level, hitDiceRemaining: level }],
      abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 16 },
      hp: { current: 20, max: 20, temp: 0 },
    }),
    ENGINE.content,
  );

const seed = (character: Character): Campaign => {
  let campaign = ENGINE.createCampaign({ name: 'recover' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: character } satisfies CharacterCreatedEvent,
  ]);
  return campaign;
};

const spend = (campaign: Campaign, characterId: string, resourceId: string, amount: number): Campaign =>
  commit(campaign, [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ResourceSpent',
      characterId: characterId as ULID,
      resourceId,
      amount,
    } satisfies ResourceSpentEvent,
  ]);

const shortRest = (campaign: Campaign, characterId: string): Campaign =>
  commit(campaign, ENGINE.plan.shortRest(campaign.state, { participantIds: [characterId] }).events);

const longRest = (campaign: Campaign, characterId: string): Campaign =>
  commit(campaign, ENGINE.plan.longRest(campaign.state, { participantIds: [characterId] }).events);

const resourceCurrent = (campaign: Campaign, characterId: string, resourceId: string): number =>
  campaign.state.characters[characterId]!.resources.find((r) => r.resourceId === resourceId)?.current ?? -1;

describe('slice 718: Font of Inspiration (Bard L5)', () => {
  it('regains all Bardic Inspiration on a Short Rest at L5', () => {
    const bard = buildBard(5);
    let campaign = seed(bard);
    const max = resourceCurrent(campaign, bard.id, 'bardic-inspiration');
    expect(max).toBeGreaterThan(0); // 1 + CHA mod (+3) = 4
    campaign = spend(campaign, bard.id, 'bardic-inspiration', 2);
    expect(resourceCurrent(campaign, bard.id, 'bardic-inspiration')).toBe(max - 2);
    campaign = shortRest(campaign, bard.id);
    expect(resourceCurrent(campaign, bard.id, 'bardic-inspiration')).toBe(max);
  });

  it('does NOT regain Bardic Inspiration on a Short Rest before L5', () => {
    const bard = buildBard(4);
    let campaign = seed(bard);
    const max = resourceCurrent(campaign, bard.id, 'bardic-inspiration');
    campaign = spend(campaign, bard.id, 'bardic-inspiration', 1);
    campaign = shortRest(campaign, bard.id);
    expect(resourceCurrent(campaign, bard.id, 'bardic-inspiration')).toBe(max - 1);
  });
});

describe('slice 718: Sorcerous Restoration (Sorcerer L5)', () => {
  it('regains floor(level/2) Sorcery Points on a Short Rest, once per Long Rest', () => {
    const sorc = buildSorcerer(5);
    let campaign = seed(sorc);
    const max = resourceCurrent(campaign, sorc.id, 'sorcery-points');
    expect(max).toBe(5); // sorcery points = sorcerer level
    expect(resourceCurrent(campaign, sorc.id, 'sorcerous-restoration')).toBe(1); // the once-per-LR gate

    campaign = spend(campaign, sorc.id, 'sorcery-points', 5); // 0 left
    campaign = shortRest(campaign, sorc.id);
    expect(resourceCurrent(campaign, sorc.id, 'sorcery-points')).toBe(2); // floor(5/2)
    expect(resourceCurrent(campaign, sorc.id, 'sorcerous-restoration')).toBe(0); // gate spent

    // Second short rest before a long rest: gate is empty, no further regain.
    campaign = spend(campaign, sorc.id, 'sorcery-points', 2); // 0 left
    campaign = shortRest(campaign, sorc.id);
    expect(resourceCurrent(campaign, sorc.id, 'sorcery-points')).toBe(0);

    // Long rest refills everything and resets the gate.
    campaign = longRest(campaign, sorc.id);
    expect(resourceCurrent(campaign, sorc.id, 'sorcery-points')).toBe(5);
    expect(resourceCurrent(campaign, sorc.id, 'sorcerous-restoration')).toBe(1);
  });

  it('does not over-recover past max (capped at headroom)', () => {
    const sorc = buildSorcerer(5);
    let campaign = seed(sorc);
    campaign = spend(campaign, sorc.id, 'sorcery-points', 1); // 4 left, headroom 1
    campaign = shortRest(campaign, sorc.id);
    expect(resourceCurrent(campaign, sorc.id, 'sorcery-points')).toBe(5); // +floor(5/2)=2 but capped to max 5
  });
});
