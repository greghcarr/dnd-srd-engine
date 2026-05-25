// Slice 447: Halfling Brave + Elf Fey Ancestry + Elf Keen Senses.
//
// RAW (SRD 5.2.1 character-origins.md):
//   Halfling Brave — "Advantage on saving throws to avoid or end the
//     Frightened condition."
//   Elf Fey Ancestry — "Advantage on saving throws to avoid or end the
//     Charmed condition."
//   Elf Keen Senses — "proficiency in the Insight, Perception, or
//     Survival skill" (player picks one; modeled as `OfferChoice`).
//
// The save arms use the slice-291 `event.savePreventsCondition`
// predicate fact (populated by `castSpell`'s save mechanic from
// `mechanic.conditionOnFail`, and by the recurring-save planner from
// `recurringSave.onSuccess === 'removeCondition'`). The fact's
// undefined default means a generic save outside this shape gets no
// species advantage, which is the strict-RAW result.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';

const PACK = loadStarterPack();

const buildHalfling = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Pip',
    speciesId: 'halfling',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 12 },
    hp: { current: 12, max: 12, temp: 0 },
  });

const buildElf = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Arwyn',
    speciesId: 'elf',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 16, WIS: 12, CHA: 10 },
    hp: { current: 8, max: 8, temp: 0 },
  });

const buildHuman = (name: string, classId: 'wizard' | 'fighter' = 'fighter'): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId, level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 12, WIS: 10, CHA: 10 },
    hp: { current: 14, max: 14, temp: 0 },
  });

const buildCaster = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Caster',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 20, max: 20, temp: 0 },
    preparedSpells: ['fear', 'charm-person'],
  });

interface SaveSpellRun {
  attempts: number;
  saveFound: boolean;
  d20Count: number; // 1 = no advantage, 2 = advantage
  used: 'none' | 'advantage' | 'disadvantage' | undefined;
}

const runSaveSpell = (
  spellId: 'fear' | 'charm-person',
  slotLevel: 1 | 3,
  target: Character,
  seedOffset: number,
): SaveSpellRun => {
  let attempt = 0;
  while (attempt < 40) {
    attempt += 1;
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(attempt + seedOffset) });
    const caster = buildCaster();
    let campaign = engine.createCampaign({ name: `${spellId}-vs-${target.name}` });
    campaign = commit(campaign, [
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: caster,
      } satisfies CharacterCreatedEvent,
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: target,
      } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: caster.id,
      spellId,
      slotLevel,
      targetIds: [target.id],
    }).events;
    const saveEvent = events.find(
      (e) => e.type === 'SaveRolled' && (e as SaveRolledEvent).targetId === target.id,
    ) as SaveRolledEvent | undefined;
    if (saveEvent === undefined) continue;
    return {
      attempts: attempt,
      saveFound: true,
      d20Count: saveEvent.d20.length,
      used: saveEvent.used,
    };
  }
  return { attempts: attempt, saveFound: false, d20Count: 0, used: undefined };
};

describe('Species saves: Brave + Fey Ancestry + Keen Senses (slice 447)', () => {
  it('Halfling Brave: WIS save vs Fear (Frightened) rolls with advantage', () => {
    const r = runSaveSpell('fear', 3, buildHalfling(), 0);
    expect(r.saveFound, `no save in ${r.attempts} seeds`).toBe(true);
    expect(r.used).toBe('advantage');
    expect(r.d20Count).toBe(2);
  });

  it('Human (no Brave): WIS save vs Fear rolls normally', () => {
    const r = runSaveSpell('fear', 3, buildHuman('Wilhelm'), 100);
    expect(r.saveFound, `no save in ${r.attempts} seeds`).toBe(true);
    expect(r.used).toBe('none');
    expect(r.d20Count).toBe(1);
  });

  it('Elf Fey Ancestry: WIS save vs Charm Person (Charmed) rolls with advantage', () => {
    const r = runSaveSpell('charm-person', 1, buildElf(), 200);
    expect(r.saveFound, `no save in ${r.attempts} seeds`).toBe(true);
    expect(r.used).toBe('advantage');
    expect(r.d20Count).toBe(2);
  });

  it('Human (no Fey Ancestry): WIS save vs Charm Person rolls normally', () => {
    const r = runSaveSpell('charm-person', 1, buildHuman('Wilhelm'), 300);
    expect(r.saveFound, `no save in ${r.attempts} seeds`).toBe(true);
    expect(r.used).toBe('none');
    expect(r.d20Count).toBe(1);
  });

  it('Halfling Brave does NOT grant advantage on a charmed-targeting save (gate is Frightened-specific)', () => {
    const r = runSaveSpell('charm-person', 1, buildHalfling(), 400);
    expect(r.saveFound, `no save in ${r.attempts} seeds`).toBe(true);
    expect(r.used).toBe('none');
    expect(r.d20Count).toBe(1);
  });

  it('Elf Fey Ancestry does NOT grant advantage on a Frightened-targeting save', () => {
    const r = runSaveSpell('fear', 3, buildElf(), 500);
    expect(r.saveFound, `no save in ${r.attempts} seeds`).toBe(true);
    expect(r.used).toBe('none');
    expect(r.d20Count).toBe(1);
  });
});
