// Slice 634 - Fighter L2 Tactical Mind.
//
// RAW 2024 (SRD 5.2.1 Fighter L2): "When you fail an ability check,
// you can expend a use of your Second Wind to push yourself toward
// success. Rather than regaining Hit Points, you roll 1d10 and add
// the number rolled to the ability check, potentially turning it
// into a success. If the check still fails, this use of Second Wind
// isn't expended."
//
// planTacticalMind is the self-targeted mirror of planPeerlessSkill
// (slice 358 — Bard L14): it rolls 1d10, reports whether the boost
// turns the roll into a success, and emits ResourceSpent only when it
// does.
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

const buildFighter = (level: number, secondWindCurrent = 2): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Pell',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level, hitDiceRemaining: level }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 20, max: 20, temp: 0, maxBonus: 0 },
    resources: [{ resourceId: 'second-wind', current: secondWindCurrent, max: 2 }],
  });

const seed = (
  fighter: Character,
): { engine: ReturnType<typeof createEngine>; campaign: Campaign; fighterId: string } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign: Campaign = engine.createCampaign({ name: 'tactical-mind' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign, fighterId: fighter.id };
};

describe('slice 634: Tactical Mind', () => {
  it('rolls 1d10 and turns a near-miss into a success, spending one Second Wind use', () => {
    const s = seed(buildFighter(2));
    // Failed by 1: original 14 vs threshold 15. Any d10 roll (>=1) succeeds.
    const out = s.engine.plan.tacticalMind(s.campaign.state, {
      fighterId: s.fighterId,
      originalRollTotal: 14,
      threshold: 15,
    });
    expect(out.dieRoll).toBeGreaterThanOrEqual(1);
    expect(out.dieRoll).toBeLessThanOrEqual(10);
    expect(out.turnedSuccess).toBe(true);
    expect(
      out.events.some((e) => e.type === 'ResourceSpent' && e.resourceId === 'second-wind'),
    ).toBe(true);
  });

  it('does not expend the use when the boost still fails to meet the threshold', () => {
    const s = seed(buildFighter(2));
    // Failed badly: original 2 vs threshold 30. Max d10 (10) -> 12 < 30.
    const out = s.engine.plan.tacticalMind(s.campaign.state, {
      fighterId: s.fighterId,
      originalRollTotal: 2,
      threshold: 30,
    });
    expect(out.turnedSuccess).toBe(false);
    expect(out.events).toHaveLength(0);
  });

  it('rejects a non-fighter, a fighter under level 2, and a fighter with no Second Wind uses', () => {
    const nonFighter = seed(
      CharacterSchema.parse({
        id: newCharacterId(),
        name: 'Mage',
        speciesId: 'human',
        backgroundId: 'sage',
        classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
        abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 16, WIS: 12, CHA: 10 },
        hp: { current: 28, max: 28, temp: 0, maxBonus: 0 },
      }),
    );
    expect(() =>
      nonFighter.engine.plan.tacticalMind(nonFighter.campaign.state, {
        fighterId: nonFighter.fighterId,
        originalRollTotal: 10,
        threshold: 15,
      }),
    ).toThrow(/Tactical Mind/);

    const tooLow = seed(buildFighter(1));
    expect(() =>
      tooLow.engine.plan.tacticalMind(tooLow.campaign.state, {
        fighterId: tooLow.fighterId,
        originalRollTotal: 10,
        threshold: 15,
      }),
    ).toThrow(/Tactical Mind/);

    const noUses = seed(buildFighter(2, 0));
    expect(() =>
      noUses.engine.plan.tacticalMind(noUses.campaign.state, {
        fighterId: noUses.fighterId,
        originalRollTotal: 10,
        threshold: 15,
      }),
    ).toThrow(/Second Wind/);
  });

  it('does not emit any ActionEconomyConsumed (RAW: not an action / bonus action / reaction)', () => {
    const s = seed(buildFighter(2));
    const out = s.engine.plan.tacticalMind(s.campaign.state, {
      fighterId: s.fighterId,
      originalRollTotal: 14,
      threshold: 15,
    });
    expect(out.events.some((e) => e.type === 'ActionEconomyConsumed')).toBe(false);
  });
});
