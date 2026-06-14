// Slice 853 — `topple-save-bypasses-effect-stack`.
//
// Topple's target CON save was hand-rolled in weapon-mastery.ts as
// `abilityModifier(target.abilityScores.CON)` — a raw ability modifier that
// bypassed `computeSavingThrow`. So the save silently skipped CON-save
// PROFICIENCY, Bless/Bane and other save bonus dice, advantage/disadvantage,
// Magic Resistance, and the Paralyzed/Stunned auto-fail. A Fighter (proficient
// in CON saves) defended against Topple with only its raw CON modifier; a
// Bless on the target did nothing.
//
// This slice routes the save through the shared `rollSaveAgainstDC` primitive
// (the same one cast-spell / recurring-save / breath-weapon use), so every
// standard save modifier now applies. `sourceIsMagical` is false (Topple is a
// nonmagical weapon property → Magic Resistance grants no Advantage).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { Event } from '../../../src/schemas/events/index.js';

const PACK = loadStarterPack();

// A L1 Fighter (PB +2) wielding a mastered quarterstaff (Topple). STR 18.
const buildAttacker = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Bruenor',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 18, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
    weaponMasteries: ['quarterstaff'],
  });

// Fighter target: PROFICIENT in CON saves (Fighter save proficiencies are STR + CON).
const buildFighterTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Sturdy',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

// Wizard target: NOT proficient in CON saves (Wizard saves are INT + WIS), same CON 14.
const buildWizardTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Frail',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 14, INT: 16, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

// Topple `target`, optionally pre-applying extra events (e.g. a Bless). Returns
// the SaveRolled event. Seed fixed so the d20 is identical across calls.
const toppleSave = (target: Character, extra: (attackerId: string, targetId: string) => Event[] = () => []) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
  const attacker = buildAttacker();
  const staff = makeItemInstance('quarterstaff');
  let campaign = engine.createCampaign({ name: 'topple-guard' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: staff },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ...extra(attacker.id, target.id),
  ]);
  const events = engine.plan.weaponMastery(campaign.state, {
    mastery: 'Topple',
    attackerId: attacker.id,
    targetId: target.id,
    weaponInstanceId: staff.id,
  }).events;
  return events.find((e) => e.type === 'SaveRolled') as
    | { ability: string; bonus: number; breakdown: { source: string; value: number }[]; d20: number[] }
    | undefined;
};

describe('slice 853: Topple CON save goes through the full save derivation', () => {
  it('the Topple save carries a computeSavingThrow breakdown', () => {
    const save = toppleSave(buildFighterTarget());
    expect(save).toBeDefined();
    expect(save!.ability).toBe('CON');
    // The old hand-rolled event had no breakdown; the derivation always emits one.
    expect(save!.breakdown.length).toBeGreaterThan(0);
  });

  it('a CON-save-proficient target now adds proficiency (was raw CON mod only)', () => {
    const fighter = toppleSave(buildFighterTarget()); // CON +2, prof +2 → +4
    const wizard = toppleSave(buildWizardTarget()); // CON +2, no prof → +2
    expect(fighter!.bonus).toBe(4);
    expect(wizard!.bonus).toBe(2);
    // The pre-853 raw-mod roll would have given both +2.
    expect(fighter!.bonus).toBeGreaterThan(wizard!.bonus);
  });

  it('Bless now adds its 1d4 to the Topple save', () => {
    const plain = toppleSave(buildWizardTarget());
    const blessed = toppleSave(buildWizardTarget(), (attackerId, targetId) => [
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'ConditionApplied',
        targetId,
        conditionId: 'blessed',
        appliedConditionId: newAppliedConditionId(),
        sourceCharacterId: attackerId,
      } as Event,
    ]);
    // Same seed + same target → the d20 matches; Bless adds a 1d4 (≥ 1) bonus die.
    expect(blessed!.d20[0]).toBe(plain!.d20[0]);
    expect(blessed!.bonus).toBeGreaterThan(plain!.bonus);
  });
});
