// Slice 657: partialShortFullLong recharge primitive.
//
// RAW for several "rest" resources (Cleric/Paladin Channel Divinity,
// Druid Wild Shape) is partial: "regain one expended use when you
// finish a Short Rest, and you regain all expended uses when you
// finish a Long Rest." Before this slice, the engine had two gaps:
//   1. The Recharge enum didn't have a value expressing partial
//      recharge — content used 'shortRest' as an over-permissive
//      approximation (documented in slice 640 + 650).
//   2. applyShortRestEnded didn't honor the recharge field at all
//      — it only reset pact slots, leaving every short-rest
//      resource effectively long-rest-only.
//
// Slice 657 fixes both. New enum value 'partialShortFullLong' +
// reducer logic that:
//   - 'shortRest': fully restore the resource on short rest
//   - 'partialShortFullLong': restore +1 (capped at max) on short rest
//   - other cadences: no-op on short rest
//
// Long rest behavior unchanged (still restores all resources).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const PACK = loadStarterPack();

const seed = (character: Character): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'partial-recharge' });
  campaign = commit(campaign, [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: character,
    } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

const runShortRest = (
  s: { engine: ReturnType<typeof createEngine>; campaign: Campaign },
  participantId: string,
): Campaign => {
  const out = s.engine.plan.shortRest(s.campaign.state, { participantIds: [participantId] });
  return commit(s.campaign, out.events);
};

describe('slice 657: partialShortFullLong recharge primitive', () => {
  it('partialShortFullLong: short rest restores +1 (capped at max)', () => {
    // L2 Cleric with channel-divinity spent down to 0/2. After one
    // short rest, current should be 1/2 (gained 1).
    const cleric = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Mira',
      speciesId: 'human',
      backgroundId: 'acolyte',
      classes: [{ classId: 'cleric', level: 2, hitDiceRemaining: 2, subclassId: 'life-domain' }],
      abilityScores: { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 16, CHA: 12 },
      hp: { current: 16, max: 16, temp: 0 },
      resources: [
        { resourceId: 'channel-divinity', current: 0, max: 2, recharge: 'partialShortFullLong' },
      ],
    });
    const s = seed(cleric);
    const after = runShortRest(s, cleric.id);
    const r = after.state.characters[cleric.id]!.resources.find((x) => x.resourceId === 'channel-divinity');
    expect(r?.current).toBe(1);
  });

  it('partialShortFullLong: a second short rest gives another +1, reaching max', () => {
    const cleric = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Mira',
      speciesId: 'human',
      backgroundId: 'acolyte',
      classes: [{ classId: 'cleric', level: 2, hitDiceRemaining: 2, subclassId: 'life-domain' }],
      abilityScores: { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 16, CHA: 12 },
      hp: { current: 16, max: 16, temp: 0 },
      resources: [
        { resourceId: 'channel-divinity', current: 0, max: 2, recharge: 'partialShortFullLong' },
      ],
    });
    const s1 = seed(cleric);
    const after1 = runShortRest(s1, cleric.id);
    const after2 = runShortRest({ engine: s1.engine, campaign: after1 }, cleric.id);
    const r = after2.state.characters[cleric.id]!.resources.find((x) => x.resourceId === 'channel-divinity');
    expect(r?.current).toBe(2);
  });

  it('partialShortFullLong: short rest does NOT exceed max', () => {
    // Start at 2/2 (max). Short rest should NOT push it to 3.
    const cleric = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Mira',
      speciesId: 'human',
      backgroundId: 'acolyte',
      classes: [{ classId: 'cleric', level: 2, hitDiceRemaining: 2, subclassId: 'life-domain' }],
      abilityScores: { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 16, CHA: 12 },
      hp: { current: 16, max: 16, temp: 0 },
      resources: [
        { resourceId: 'channel-divinity', current: 2, max: 2, recharge: 'partialShortFullLong' },
      ],
    });
    const s = seed(cleric);
    const after = runShortRest(s, cleric.id);
    const r = after.state.characters[cleric.id]!.resources.find((x) => x.resourceId === 'channel-divinity');
    expect(r?.current).toBe(2);
  });

  it('shortRest: short rest fully restores (e.g. Action Surge 0/1 -> 1/1)', () => {
    // L2 Fighter with action-surge spent (0/1). Short rest should
    // restore to 1/1 (full recharge per RAW Fighter L2).
    const fighter = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Pell',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 2, hitDiceRemaining: 2 }],
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 20, max: 20, temp: 0 },
      resources: [
        { resourceId: 'action-surge', current: 0, max: 1, recharge: 'shortRest' },
      ],
    });
    const s = seed(fighter);
    const after = runShortRest(s, fighter.id);
    const r = after.state.characters[fighter.id]!.resources.find((x) => x.resourceId === 'action-surge');
    expect(r?.current).toBe(1);
  });

  it('longRest (no recharge field, back-compat default): short rest does NOT restore', () => {
    // A resource WITHOUT the recharge field defaults to undefined
    // (which the reducer treats as no-op on short rest, matching
    // pre-657 behavior). A consumer with old test fixtures keeps
    // their long-rest-only semantics until they opt into shortRest /
    // partialShortFullLong.
    const druid = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Wren',
      speciesId: 'elf',
      backgroundId: 'sage',
      classes: [{ classId: 'druid', level: 2, hitDiceRemaining: 2 }],
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 12, WIS: 16, CHA: 10 },
      hp: { current: 16, max: 16, temp: 0 },
      resources: [
        // No recharge field — defaults to undefined.
        { resourceId: 'wild-shape', current: 0, max: 2 },
      ],
    });
    const s = seed(druid);
    const after = runShortRest(s, druid.id);
    const r = after.state.characters[druid.id]!.resources.find((x) => x.resourceId === 'wild-shape');
    expect(r?.current).toBe(0);
  });

  it('long rest still fully restores partialShortFullLong resources (regression check)', () => {
    const cleric = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Mira',
      speciesId: 'human',
      backgroundId: 'acolyte',
      classes: [{ classId: 'cleric', level: 2, hitDiceRemaining: 2, subclassId: 'life-domain' }],
      abilityScores: { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 16, CHA: 12 },
      hp: { current: 16, max: 16, temp: 0 },
      resources: [
        { resourceId: 'channel-divinity', current: 0, max: 2, recharge: 'partialShortFullLong' },
      ],
    });
    const s = seed(cleric);
    const longRestOut = s.engine.plan.longRest(s.campaign.state, { participantIds: [cleric.id] });
    const after = commit(s.campaign, longRestOut.events);
    const r = after.state.characters[cleric.id]!.resources.find((x) => x.resourceId === 'channel-divinity');
    expect(r?.current).toBe(2);
  });
});
