// Slice 448: Darkvision + Dwarven Resilience + Gnomish Cunning species traits.
//
// RAW (SRD 5.2.1 character-origins.md):
//   Darkvision: 60 ft for Dragonborn, Elf, Gnome, Tiefling; 120 ft for
//     Dwarf and Orc.
//   Dwarven Resilience: "Resistance to Poison damage. You also have
//     Advantage on saving throws you make to avoid or end the Poisoned
//     condition."
//   Gnomish Cunning: "Advantage on Intelligence, Wisdom, and Charisma
//     saving throws."
//
// Pure content slice: all wires use existing primitives (GrantSense,
// GrantResistance, SetAdvantage with the slice-291 savePreventsCondition
// fact, SetAdvantage with per-ability save target).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildPC = (
  speciesId: 'dragonborn' | 'dwarf' | 'elf' | 'gnome' | 'orc' | 'tiefling' | 'halfling' | 'human',
  name: string,
): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId,
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
  });

const senseRange = (character: Character, sense: 'darkvision'): number | undefined => {
  const stack = buildEffectStack({
    character,
    content: CONTENT,
    itemInstances: {},
    pendingChoices: {},
  });
  return stack.senseRange(sense);
};

describe('Darkvision + Dwarven Resilience + Gnomish Cunning (slice 448)', () => {
  it('Darkvision 60 ft for Dragonborn / Elf / Gnome / Tiefling', () => {
    expect(senseRange(buildPC('dragonborn', 'Drak'), 'darkvision')).toBe(60);
    expect(senseRange(buildPC('elf', 'Arwyn'), 'darkvision')).toBe(60);
    expect(senseRange(buildPC('gnome', 'Glim'), 'darkvision')).toBe(60);
    expect(senseRange(buildPC('tiefling', 'Mira'), 'darkvision')).toBe(60);
  });

  it('Darkvision 120 ft for Dwarf and Orc', () => {
    expect(senseRange(buildPC('dwarf', 'Bruni'), 'darkvision')).toBe(120);
    expect(senseRange(buildPC('orc', 'Krak'), 'darkvision')).toBe(120);
  });

  it('Human and Halfling have no Darkvision (sanity / negative control)', () => {
    const humanRange = senseRange(buildPC('human', 'Wil'), 'darkvision');
    const halfRange = senseRange(buildPC('halfling', 'Pip'), 'darkvision');
    expect(humanRange === undefined || humanRange === 0).toBe(true);
    expect(halfRange === undefined || halfRange === 0).toBe(true);
  });
});

const buildCaster = (preparedSpells: ReadonlyArray<string>): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Caster',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 9, hitDiceRemaining: 9 }],
    abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 36, max: 36, temp: 0 },
    preparedSpells: [...preparedSpells],
  });

interface SaveSpellRun {
  attempts: number;
  saveFound: boolean;
  d20Count: number;
  used: 'none' | 'advantage' | 'disadvantage' | undefined;
}

const runSaveSpell = (
  spellId: string,
  slotLevel: number,
  target: Character,
  seedOffset: number,
): SaveSpellRun => {
  let attempt = 0;
  while (attempt < 40) {
    attempt += 1;
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(attempt + seedOffset) });
    const caster = buildCaster([spellId]);
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

describe('Dwarven Resilience (slice 448)', () => {
  it('Dwarf vs Contagion (CON save vs Poisoned) rolls with advantage', () => {
    // contagion L5: CON save, conditionOnFail: 'poisoned'. The
    // savePreventsCondition fact resolves to 'poisoned', triggering
    // the dwarven advantage.
    const r = runSaveSpell('contagion', 5, buildPC('dwarf', 'Bruni'), 0);
    expect(r.saveFound, `no save in ${r.attempts} seeds`).toBe(true);
    expect(r.used).toBe('advantage');
    expect(r.d20Count).toBe(2);
  });

  it('Human vs Contagion rolls the CON save normally (no Dwarven Resilience)', () => {
    const r = runSaveSpell('contagion', 5, buildPC('human', 'Wil'), 100);
    expect(r.saveFound, `no save in ${r.attempts} seeds`).toBe(true);
    expect(r.used).toBe('none');
    expect(r.d20Count).toBe(1);
  });
});

describe('Gnomish Cunning (slice 448)', () => {
  it('Gnome vs Hold Person (WIS save) rolls with advantage', () => {
    const r = runSaveSpell('hold-person', 2, buildPC('gnome', 'Glim'), 300);
    expect(r.saveFound, `no save in ${r.attempts} seeds`).toBe(true);
    expect(r.used).toBe('advantage');
  });

  it('Gnome vs Fear (WIS save) rolls with advantage', () => {
    const r = runSaveSpell('fear', 3, buildPC('gnome', 'Glim'), 400);
    expect(r.saveFound, `no save in ${r.attempts} seeds`).toBe(true);
    expect(r.used).toBe('advantage');
  });

  it('Gnome vs Bane (CHA save) rolls with advantage', () => {
    const r = runSaveSpell('bane', 1, buildPC('gnome', 'Glim'), 500);
    expect(r.saveFound, `no save in ${r.attempts} seeds`).toBe(true);
    expect(r.used).toBe('advantage');
  });

  it('Human (no Cunning) vs Hold Person rolls normally', () => {
    const r = runSaveSpell('hold-person', 2, buildPC('human', 'Wil'), 600);
    expect(r.saveFound, `no save in ${r.attempts} seeds`).toBe(true);
    expect(r.used).toBe('none');
  });
});
