// Slice 730: Warlock Fiend Patron L6 — Dark One's Own Luck.
//
// SRD 5.2.1: add 1d10 to an ability check or saving throw (after seeing
// the roll), uses = CHA modifier (min 1), regained on a Long Rest.
// Modeled like Hero Points: the planner spends a use + rolls the d10 and
// returns it in the outcome for the consumer to add to the d20 roll.

import { describe, expect, it } from 'vitest';
import { createEngine, seedResourcesFromContent } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const PACK = loadStarterPack();
const ENGINE = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });

const buildWarlock = (level: number, subclassId?: string): Character =>
  seedResourcesFromContent(
    CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Warlock',
      speciesId: 'human',
      backgroundId: 'sage',
      classes: [{ classId: 'warlock', level, hitDiceRemaining: level, ...(subclassId !== undefined ? { subclassId } : {}) }],
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 16 }, // CHA +3 → 3 uses
      hp: { current: 30, max: 30, temp: 0 },
    }),
    ENGINE.content,
  );

const seed = (character: Character): Campaign =>
  commit(ENGINE.createCampaign({ name: 'dark-ones-own-luck' }), [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: character } satisfies CharacterCreatedEvent,
  ]);

const res = (campaign: Campaign, id: string): number =>
  campaign.state.characters[id]!.resources.find((r) => r.resourceId === 'dark-ones-own-luck')?.current ?? -1;

describe('slice 730: Dark One\'s Own Luck (Fiend Patron L6)', () => {
  it('rolls a 1d10 and spends a use', () => {
    const wl = buildWarlock(6, 'fiend-patron');
    let campaign = seed(wl);
    expect(res(campaign, wl.id)).toBe(3); // max(1, CHA +3)
    const outcome = ENGINE.plan.darkOnesOwnLuck(campaign.state, { warlockId: wl.id });
    expect(outcome.d10).toBeGreaterThanOrEqual(1);
    expect(outcome.d10).toBeLessThanOrEqual(10);
    campaign = commit(campaign, outcome.events);
    expect(res(campaign, wl.id)).toBe(2);
  });

  it('runs out of uses and is then rejected', () => {
    const wl = buildWarlock(6, 'fiend-patron');
    let campaign = seed(wl);
    for (let i = 0; i < 3; i += 1) {
      campaign = commit(campaign, ENGINE.plan.darkOnesOwnLuck(campaign.state, { warlockId: wl.id }).events);
    }
    expect(res(campaign, wl.id)).toBe(0);
    expect(() => ENGINE.plan.darkOnesOwnLuck(campaign.state, { warlockId: wl.id })).toThrow(/no Dark One's Own Luck uses/);
  });

  it('a warlock without the Fiend subclass does not have it', () => {
    const wl = buildWarlock(6); // no subclass
    const campaign = seed(wl);
    expect(() => ENGINE.plan.darkOnesOwnLuck(campaign.state, { warlockId: wl.id })).toThrow(/does not have Dark One's Own Luck/);
  });
});
