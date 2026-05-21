// Slice 358 - College of Lore L14 Peerless Skill.
//
// RAW 2024: when you make an ability check or attack roll and fail, you
// can expend one Bardic Inspiration die, roll it, and add it to the d20,
// potentially turning a failure into a success. On a failure (it still
// doesn't meet the threshold), the Bardic Inspiration isn't expended.
// planPeerlessSkill is the self-targeted mirror of Cutting Words: it rolls
// the BI die, reports whether the boost turns the roll into a success, and
// emits ResourceSpent only when it does.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildBard = (level: number, subclass: string | null, biCurrent = 4): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Lyric',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'bard', level, hitDiceRemaining: level, ...(subclass !== null ? { subclassId: subclass } : {}) }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 12, WIS: 12, CHA: 18 },
    hp: { current: 40, max: 40, temp: 0 },
    resources: [{ resourceId: 'bardic-inspiration', current: biCurrent, max: 4 }],
  });

const seed = (bard: Character): { engine: ReturnType<typeof createEngine>; campaign: Campaign; bardId: string } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign: Campaign = engine.createCampaign({ name: 'peerless-skill' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bard } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign, bardId: bard.id };
};

describe('slice 358: Peerless Skill', () => {
  it('rolls a d12 at L14 and turns a near-miss into a success, spending the die', () => {
    const s = seed(buildBard(14, 'college-of-lore'));
    // Failed by 1: original 14 vs threshold 15. Any d12 roll (>=1) succeeds.
    const out = s.engine.plan.peerlessSkill(s.campaign.state, {
      bardId: s.bardId,
      originalRollTotal: 14,
      threshold: 15,
    });
    expect(out.dieRoll).toBeGreaterThanOrEqual(1);
    expect(out.dieRoll).toBeLessThanOrEqual(12);
    expect(out.turnedSuccess).toBe(true);
    expect(out.events.some((e) => e.type === 'ResourceSpent' && e.resourceId === 'bardic-inspiration')).toBe(true);
  });

  it('does not expend the die when the boost still fails to meet the threshold', () => {
    const s = seed(buildBard(14, 'college-of-lore'));
    // Failed badly: original 2 vs threshold 30. Max d12 (12) -> 14 < 30.
    const out = s.engine.plan.peerlessSkill(s.campaign.state, {
      bardId: s.bardId,
      originalRollTotal: 2,
      threshold: 30,
    });
    expect(out.turnedSuccess).toBe(false);
    expect(out.events).toHaveLength(0);
  });

  it('rejects a bard without College of Lore, one under level 14, and one with no Bardic Inspiration', () => {
    const noSub = seed(buildBard(14, null));
    expect(() => noSub.engine.plan.peerlessSkill(noSub.campaign.state, { bardId: noSub.bardId, originalRollTotal: 10, threshold: 15 })).toThrow(/Peerless Skill/);
    const tooLow = seed(buildBard(13, 'college-of-lore'));
    expect(() => tooLow.engine.plan.peerlessSkill(tooLow.campaign.state, { bardId: tooLow.bardId, originalRollTotal: 10, threshold: 15 })).toThrow(/Peerless Skill/);
    const noBI = seed(buildBard(14, 'college-of-lore', 0));
    expect(() => noBI.engine.plan.peerlessSkill(noBI.campaign.state, { bardId: noBI.bardId, originalRollTotal: 10, threshold: 15 })).toThrow(/Bardic Inspiration/);
  });
});
