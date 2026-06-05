// Slice 672: Blink wiring.
//
// Engine: new planBlinkTurnEnd planner. Content: buff applies
// blink-active; planBlinkTurnEnd reads it and on d20 11+ applies
// blink-ethereal-active marker.
//
// What this audit pins:
//   1. Cast applies blink-active on the caster.
//   2. planBlinkTurnEnd rolls a d20; outcome depends on seed.
//   3. Without blink-active, the planner throws.
//   4. Consumer-managed: re-emergence ConditionRemoved at next
//      turn-start is the consumer's responsibility; verified by
//      asserting the planner emits a ConditionApplied (never
//      auto-removes).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Pell',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

const buildFighter = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Pell-the-non-wizard',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
  });

const seed = (caster: Character, rngSeed = 1): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(rngSeed) });
  let campaign = engine.createCampaign({ name: 'blink' });
  campaign = commit(campaign, [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: caster,
    } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

describe('slice 672: Blink (cross-plane per-turn toggle)', () => {
  it('cast applies blink-active on the caster (no concentration claim)', () => {
    const wizard = buildWizard();
    const s = seed(wizard);
    const cast = s.engine.plan.castSpell(s.campaign.state, {
      characterId: wizard.id,
      spellId: 'blink',
      slotLevel: 3,
      targetIds: [wizard.id],
      ignorePreparation: true,
    });
    const campaign = commit(s.campaign, cast.events);
    expect(
      campaign.state.characters[wizard.id]!.appliedConditions.some((c) => c.conditionId === 'blink-active'),
    ).toBe(true);
    // Blink is NOT a concentration spell.
    expect(campaign.state.characters[wizard.id]!.concentrationEffectId).toBeUndefined();
  });

  it('planBlinkTurnEnd on 11+ applies blink-ethereal-active; on <11 emits no condition', () => {
    // Iterate seeds: confirm we see BOTH outcomes across many runs.
    const wizard = buildWizard();
    let ethereal = false;
    let nonEthereal = false;
    for (let s = 1; s <= 30 && !(ethereal && nonEthereal); s += 1) {
      const ctx = seed(wizard, s);
      const cast = ctx.engine.plan.castSpell(ctx.campaign.state, {
        characterId: wizard.id,
        spellId: 'blink',
        slotLevel: 3,
        targetIds: [wizard.id],
        ignorePreparation: true,
      });
      let campaign = commit(ctx.campaign, cast.events);
      const turnEnd = ctx.engine.plan.blinkTurnEnd(campaign.state, { characterId: wizard.id });
      const applied = turnEnd.events.find(
        (e): e is ConditionAppliedEvent =>
          e.type === 'ConditionApplied' && e.conditionId === 'blink-ethereal-active',
      );
      if (applied !== undefined) ethereal = true;
      if (applied === undefined) nonEthereal = true;
    }
    expect(ethereal, 'Never observed an ethereal outcome (11+) across 30 seeds').toBe(true);
    expect(nonEthereal, 'Never observed a non-ethereal outcome (<=10) across 30 seeds').toBe(true);
  });

  it('planBlinkTurnEnd throws when blink-active is NOT on the character', () => {
    const fighter = buildFighter();
    const s = seed(fighter);
    expect(() => s.engine.plan.blinkTurnEnd(s.campaign.state, { characterId: fighter.id })).toThrow(/no active Blink/);
  });

  it('planBlinkTurnEnd while already ethereal: re-emits nothing (RAW: the spell fails if already ethereal)', () => {
    const wizard = buildWizard();
    // Find a seed that produces an ethereal outcome, then call again
    // while still ethereal — expect no further ConditionApplied.
    for (let s = 1; s <= 30; s += 1) {
      const ctx = seed(wizard, s);
      const cast = ctx.engine.plan.castSpell(ctx.campaign.state, {
        characterId: wizard.id,
        spellId: 'blink',
        slotLevel: 3,
        targetIds: [wizard.id],
        ignorePreparation: true,
      });
      let campaign = commit(ctx.campaign, cast.events);
      const first = ctx.engine.plan.blinkTurnEnd(campaign.state, { characterId: wizard.id });
      const firstApplied = first.events.find(
        (e): e is ConditionAppliedEvent => e.type === 'ConditionApplied' && e.conditionId === 'blink-ethereal-active',
      );
      if (firstApplied === undefined) continue;
      campaign = commit(campaign, first.events);
      // Call again — still ethereal; planner emits nothing (the RAW
      // "spell fails if already ethereal" arm).
      const second = ctx.engine.plan.blinkTurnEnd(campaign.state, { characterId: wizard.id });
      const secondApplied = second.events.find(
        (e): e is ConditionAppliedEvent => e.type === 'ConditionApplied' && e.conditionId === 'blink-ethereal-active',
      );
      expect(secondApplied).toBeUndefined();
      return;
    }
    throw new Error('No seed produced an ethereal outcome to test the second-call no-op');
  });
});
