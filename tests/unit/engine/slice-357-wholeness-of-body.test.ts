// Slice 357 - Warrior of the Open Hand L6 Wholeness of Body.
//
// RAW 2024: as a Bonus Action, roll your Martial Arts die and regain Hit
// Points equal to the roll plus your Wisdom modifier (minimum 1). Usable a
// number of times equal to your Wisdom modifier (min 1) per Long Rest.
// planWholenessOfBody spends the `wholeness-of-body` resource and emits a
// self Healed of (Martial Arts die roll + WIS mod, min 1).
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { HealedEvent } from '../../../src/schemas/events/combat.js';
import type { ResourceSpentEvent } from '../../../src/schemas/events/resources.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

// Martial Arts die: 1d8 at monk level 6. WIS 16 -> +3 modifier, so the
// heal lands in [1+3, 8+3] = [4, 11].
const buildMonk = (level: number, subclass: string | null, uses = 3, hpCurrent = 10): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Brother Ash',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'monk', level, hitDiceRemaining: level, ...(subclass !== null ? { subclassId: subclass } : {}) }],
    abilityScores: { STR: 12, DEX: 16, CON: 12, INT: 10, WIS: 16, CHA: 10 },
    hp: { current: hpCurrent, max: 40, temp: 0 },
    resources: [{ resourceId: 'wholeness-of-body', current: uses, max: uses, recharge: 'longRest' }],
  });

const seed = (monk: Character): { engine: ReturnType<typeof createEngine>; campaign: Campaign; monkId: string } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign: Campaign = engine.createCampaign({ name: 'wholeness-of-body' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: monk } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign, monkId: monk.id };
};

const healed = (events: ReadonlyArray<Event>) =>
  events.filter((e): e is HealedEvent => e.type === 'Healed');

describe('slice 357: Wholeness of Body', () => {
  it('spends a use and heals the monk for the Martial Arts die + WIS modifier', () => {
    const s = seed(buildMonk(6, 'warrior-of-the-open-hand'));
    const { events } = s.engine.plan.wholenessOfBody(s.campaign.state, { monkId: s.monkId });
    expect(events.some((e): e is ResourceSpentEvent =>
      e.type === 'ResourceSpent' && e.resourceId === 'wholeness-of-body' && e.amount === 1,
    )).toBe(true);
    const heals = healed(events);
    expect(heals).toHaveLength(1);
    expect(heals[0]!.targetId).toBe(s.monkId);
    // 1d8 + WIS mod (+3): in [4, 11].
    expect(heals[0]!.amount).toBeGreaterThanOrEqual(4);
    expect(heals[0]!.amount).toBeLessThanOrEqual(11);
  });

  it('applies the heal to the monk on commit (clamped to HP max)', () => {
    const s = seed(buildMonk(6, 'warrior-of-the-open-hand', 3, 10));
    const result = s.engine.plan.wholenessOfBody(s.campaign.state, { monkId: s.monkId });
    const after = commit(s.campaign, result.events);
    const monk = after.state.characters[s.monkId]!;
    const dealt = healed(result.events)[0]!.amount;
    expect(monk.hp.current).toBe(10 + dealt);
  });

  it('rejects a monk without Warrior of the Open Hand, and one with no uses left', () => {
    const noSub = seed(buildMonk(6, null));
    expect(() => noSub.engine.plan.wholenessOfBody(noSub.campaign.state, { monkId: noSub.monkId })).toThrow(/Wholeness of Body/);
    const tooLow = seed(buildMonk(5, 'warrior-of-the-open-hand'));
    expect(() => tooLow.engine.plan.wholenessOfBody(tooLow.campaign.state, { monkId: tooLow.monkId })).toThrow(/Wholeness of Body/);
    const noUses = seed(buildMonk(6, 'warrior-of-the-open-hand', 0));
    expect(() => noUses.engine.plan.wholenessOfBody(noUses.campaign.state, { monkId: noUses.monkId })).toThrow(/uses/);
  });
});
