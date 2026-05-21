// Slice 388 - per-instance fixed-DC recurring save (Cunning Strike Poison
// / Knock Out repeat save, full-RAW conversion).
//
// RAW: a creature Poisoned (or Knocked Out) by Cunning Strike repeats the
// save "at the end of each of its turns, ending the effect on a success."
// The save DC is the rogue's fixed DC (8 + DEX + PB), and the rogue is not
// a spellcaster, so the existing recurring-save path (spell DC + a
// spellcasting caster) couldn't drive it. This slice bakes the save
// ability + DC onto the applied condition; `tickRecurringSave` re-rolls it
// with no caster / spell-DC resolution and removes the condition on a
// success.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const FIXED_DC = 15;

// A plain fighter: NOT a spellcaster, so a successful tick proves the
// fixed-DC path needs no spellcasting caster.
const buildFighter = (con: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Brute', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 14, DEX: 12, CON: con, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 60, max: 60, temp: 0 },
  });

const tickPoison = (con: number, seed: number) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  const target = buildFighter(con);
  let campaign: Campaign = engine.createCampaign({ name: 'rs' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    // Poisoned by Cunning Strike: base `poisoned` + the per-instance
    // fixed-DC recurring save baked on (CON vs DC 15). No source character.
    {
      id: eventId(), at: isoTimestamp(), type: 'ConditionApplied',
      targetId: target.id as never, conditionId: 'poisoned', appliedConditionId: newAppliedConditionId(),
      recurringSaveDC: FIXED_DC, recurringSaveAbility: 'CON',
    },
  ]);
  const events = engine.plan.tickRecurringSave(campaign.state, {
    targetId: target.id, conditionId: 'poisoned',
  }).events as ReadonlyArray<Event>;
  return { events, targetId: target.id };
};

describe('slice 388: fixed-DC recurring save (no spellcaster needed)', () => {
  it('ticks a CON save against the baked DC and does not require a caster', () => {
    const { events } = tickPoison(10, 1);
    const save = events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
    expect(save?.ability).toBe('CON');
    expect(save?.dc).toBe(FIXED_DC);
  });

  it('a successful save removes the condition; a failure leaves it', () => {
    // Dump CON so the save almost always fails -> condition stays.
    let sawFail = false;
    for (let seed = 1; seed < 40 && !sawFail; seed += 1) {
      const { events } = tickPoison(1, seed);
      const save = events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled')!;
      if (!save.success) {
        sawFail = true;
        expect(events.some((e) => e.type === 'ConditionRemoved')).toBe(false);
      }
    }
    expect(sawFail).toBe(true);
    // High CON + proficiency-less but loop seeds to find a success -> removed.
    let sawSuccess = false;
    for (let seed = 1; seed < 80 && !sawSuccess; seed += 1) {
      const { events } = tickPoison(20, seed);
      const save = events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled')!;
      if (save.success) {
        sawSuccess = true;
        expect(events.some((e) => e.type === 'ConditionRemoved')).toBe(true);
      }
    }
    expect(sawSuccess).toBe(true);
  });
});

describe('slice 388: Cunning Strike Poison bakes the repeat save', () => {
  it('a Poisoned-by-Cunning-Strike condition carries the fixed-DC recurring save and ticks', () => {
    const rogue = CharacterSchema.parse({
      id: newCharacterId(), name: 'Vex', speciesId: 'human', backgroundId: 'criminal',
      classes: [{ classId: 'rogue', level: 5, hitDiceRemaining: 5, subclassId: 'thief' }],
      abilityScores: { STR: 10, DEX: 18, CON: 12, INT: 12, WIS: 10, CHA: 10 },
      hp: { current: 50, max: 50, temp: 0 },
    });
    const target = buildFighter(1); // dump CON so the initial poison save fails
    for (let seed = 1; seed < 90; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const dagger = makeItemInstance('dagger');
      let campaign: Campaign = engine.createCampaign({ name: 'cs-poison' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: dagger },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: rogue } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const atk = engine.plan.attack(campaign.state, {
        attackerId: rogue.id, targetId: target.id, weaponInstanceId: dagger.id, advantage: 'advantage', cunningStrike: ['poison'],
      }).events as ReadonlyArray<Event>;
      const hit = (atk.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined)?.hit === true;
      if (!hit) continue;
      campaign = commit(campaign, atk);
      const applied = campaign.state.characters[target.id]!.appliedConditions.find((c) => c.conditionId === 'poisoned');
      if (applied === undefined) continue; // initial save succeeded this seed; try next
      // The rogue's DC: 8 + DEX mod (+4) + PB (L5 -> +3) = 15.
      expect(applied.recurringSaveDC).toBe(15);
      expect(applied.recurringSaveAbility).toBe('CON');
      // The consumer can tick it with no caster / spellcasting class.
      const tick = engine.plan.tickRecurringSave(campaign.state, {
        targetId: target.id, conditionId: 'poisoned',
      }).events as ReadonlyArray<Event>;
      expect((tick.find((e): e is SaveRolledEvent => e.type === 'SaveRolled'))?.dc).toBe(15);
      return;
    }
    throw new Error('no seed produced a Cunning Strike poison application');
  });
});
