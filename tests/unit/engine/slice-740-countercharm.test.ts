// Slice 740: Bard L7 Countercharm.
//
// SRD 5.2.1: "If you or a creature within 30 feet of you fails a saving
// throw against an effect that applies the Charmed or Frightened condition,
// you can take a Reaction to cause the save to be rerolled, and the new
// roll has Advantage." Free Reaction.
//
// `engine.plan.countercharm` is an outcome planner (the Peerless Skill /
// Hero Points shape): given the failed creature + the save's DC + bonus, it
// rerolls 2d20 with Advantage, emits the rerolled SaveRolled, and returns
// whether it now succeeds. The 30-ft range, self-or-ally choice, Reaction
// economy, and removing the already-applied condition are consumer-managed.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';

const PACK = loadStarterPack();

const buildBard = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Lyra',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'bard', level, hitDiceRemaining: level }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 18 },
    hp: { current: 45, max: 45, temp: 0 },
  });

const buildAlly = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Ally',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 7, hitDiceRemaining: 7 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 10 },
    hp: { current: 60, max: 60, temp: 0 },
  });

const setup = (chars: Character[]): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(740) });
  let campaign = engine.createCampaign({ name: 'countercharm' });
  campaign = commit(campaign, chars.map(
    (c) => ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c }) satisfies CharacterCreatedEvent,
  ));
  return { engine, campaign };
};

describe('slice 740: Countercharm (Bard L7)', () => {
  it('the feature row carries the planner-backed marker', () => {
    const bard = PACK.classes.find((c) => c.id === 'bard')!;
    const f = bard.levelTable['7']!.features.find((x) => x.id === 'countercharm');
    expect(f, 'bard L7 missing countercharm').toBeDefined();
    expect((f!.effects ?? []).some((e) => e.kind === 'Custom')).toBe(true);
  });

  it('rerolls an ally\'s failed save with Advantage (2d20 take max + bonus vs DC)', () => {
    const bard = buildBard(7);
    const ally = buildAlly();
    const { engine, campaign } = setup([bard, ally]);
    const out = engine.plan.countercharm(campaign.state, {
      bardId: bard.id,
      targetId: ally.id,
      ability: 'WIS',
      dc: 14,
      saveBonus: 1,
    });
    expect(out.d20).toHaveLength(2);
    expect(out.total).toBe(Math.max(out.d20[0]!, out.d20[1]!) + 1);
    expect(out.success).toBe(out.total >= 14);

    const save = out.events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled')!;
    expect(save.targetId).toBe(ally.id);
    expect(save.used).toBe('advantage');
    expect(save.d20).toEqual([...out.d20]);
    expect(save.success).toBe(out.success);
  });

  it('works for the bard itself (self target)', () => {
    const bard = buildBard(7);
    const { engine, campaign } = setup([bard]);
    const out = engine.plan.countercharm(campaign.state, {
      bardId: bard.id,
      targetId: bard.id,
      ability: 'WIS',
      dc: 5, // low DC: advantage reroll all but certainly clears it
      saveBonus: 0,
    });
    expect(out.success).toBe(true);
  });

  it('a L6 bard does not have Countercharm yet (throws)', () => {
    const bard = buildBard(6);
    const ally = buildAlly();
    const { engine, campaign } = setup([bard, ally]);
    expect(() =>
      engine.plan.countercharm(campaign.state, { bardId: bard.id, targetId: ally.id, ability: 'WIS', dc: 12, saveBonus: 0 }),
    ).toThrow(/Countercharm/);
  });
});
