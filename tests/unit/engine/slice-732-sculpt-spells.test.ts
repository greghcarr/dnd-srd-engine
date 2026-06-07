// Slice 732: Wizard Evoker L6 — Sculpt Spells.
//
// SRD 5.2.1: "When you cast an Evocation spell that affects other
// creatures that you can see, you can choose a number of them equal to 1
// plus the spell's level. The chosen creatures automatically succeed on
// their saving throws against the spell, and they take no damage if they
// would normally take half damage on a successful save."
//
// Modeled as full exclusion: a chosen target gets no save event, no
// damage, and no forced movement. Opt-in via `intent.sculptedTargetIds`.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { Event } from '../../../src/schemas/events/index.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();

const buildWizard = (level: number, subclass: string | null): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Evoker',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level, hitDiceRemaining: level, ...(subclass !== null ? { subclassId: subclass } : {}) }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 20, WIS: 10, CHA: 10 },
    hp: { current: 60, max: 60, temp: 0 },
    preparedSpells: ['fireball', 'thunderwave', 'blight'],
  });

// Saves of -5 against a DC of 16 (8 + INT +5 + prof +3 at L6) can roll at
// most 15, so an unsculpted foe always fails and takes full damage.
const buildFoe = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 },
    hp: { current: 400, max: 400, temp: 0 },
  });

const setup = (characters: Character[]): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
  let campaign = engine.createCampaign({ name: 'sculpt' });
  campaign = commit(campaign, characters.map(
    (c) => ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c }) satisfies CharacterCreatedEvent,
  ));
  return { engine, campaign };
};

const damageTo = (events: ReadonlyArray<Event>, targetId: string): number =>
  events
    .filter((e): e is DamageAppliedEvent => e.type === 'DamageApplied' && (e as DamageAppliedEvent).targetId === targetId)
    .flatMap((e) => e.components)
    .reduce((s, c) => s + c.amount, 0);

const hasEventFor = (events: ReadonlyArray<Event>, type: string, targetId: string): boolean =>
  events.some((e) => e.type === type && (e as { targetId?: string }).targetId === targetId);

describe('slice 732: Sculpt Spells (Evoker L6)', () => {
  it('a sculpted creature takes no damage, no save, no push; the other still takes full damage', () => {
    const evoker = buildWizard(6, 'evoker');
    const spared = buildFoe('Spared');
    const burned = buildFoe('Burned');
    const { engine, campaign } = setup([evoker, spared, burned]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: evoker.id,
      spellId: 'thunderwave',
      slotLevel: 1,
      targetIds: [spared.id, burned.id],
      sculptedTargetIds: [spared.id],
    }).events;

    expect(damageTo(events, spared.id)).toBe(0);
    expect(hasEventFor(events, 'SaveRolled', spared.id)).toBe(false);
    expect(hasEventFor(events, 'CreaturePushed', spared.id)).toBe(false);

    expect(damageTo(events, burned.id)).toBeGreaterThan(0);
    expect(hasEventFor(events, 'SaveRolled', burned.id)).toBe(true);
  });

  it('without sculpting, both targets take damage (control)', () => {
    const evoker = buildWizard(6, 'evoker');
    const a = buildFoe('A');
    const b = buildFoe('B');
    const { engine, campaign } = setup([evoker, a, b]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: evoker.id,
      spellId: 'thunderwave',
      slotLevel: 1,
      targetIds: [a.id, b.id],
    }).events;
    expect(damageTo(events, a.id)).toBeGreaterThan(0);
    expect(damageTo(events, b.id)).toBeGreaterThan(0);
  });

  it('throws when excluding more creatures than 1 + slot level', () => {
    const evoker = buildWizard(6, 'evoker');
    const a = buildFoe('A');
    const b = buildFoe('B');
    const c = buildFoe('C');
    const { engine, campaign } = setup([evoker, a, b, c]);
    expect(() =>
      engine.plan.castSpell(campaign.state, {
        characterId: evoker.id,
        spellId: 'thunderwave',
        slotLevel: 1, // cap = 1 + 1 = 2
        targetIds: [a.id, b.id, c.id],
        sculptedTargetIds: [a.id, b.id, c.id],
      }),
    ).toThrow(/at most 2/);
  });

  it('throws when sculpting a non-Evocation spell (Blight, necromancy)', () => {
    const evoker = buildWizard(7, 'evoker'); // L7 wizard has a 4th-level slot for Blight
    const foe = buildFoe('Foe');
    const { engine, campaign } = setup([evoker, foe]);
    expect(() =>
      engine.plan.castSpell(campaign.state, {
        characterId: evoker.id,
        spellId: 'blight',
        slotLevel: 4,
        targetIds: [foe.id],
        sculptedTargetIds: [foe.id],
      }),
    ).toThrow(/only to Evocation/);
  });

  it('throws when a chosen target is not among the spell targets', () => {
    const evoker = buildWizard(6, 'evoker');
    const inArea = buildFoe('InArea');
    const outside = buildFoe('Outside');
    const { engine, campaign } = setup([evoker, inArea, outside]);
    expect(() =>
      engine.plan.castSpell(campaign.state, {
        characterId: evoker.id,
        spellId: 'fireball',
        slotLevel: 3,
        targetIds: [inArea.id],
        sculptedTargetIds: [outside.id],
      }),
    ).toThrow(/not among the spell's targets/);
  });

  it('a L5 Evoker cannot sculpt yet (feature is L6)', () => {
    const evoker = buildWizard(5, 'evoker');
    const a = buildFoe('A');
    const b = buildFoe('B');
    const { engine, campaign } = setup([evoker, a, b]);
    expect(() =>
      engine.plan.castSpell(campaign.state, {
        characterId: evoker.id,
        spellId: 'thunderwave',
        slotLevel: 1,
        targetIds: [a.id, b.id],
        sculptedTargetIds: [a.id],
      }),
    ).toThrow(/cannot sculpt spells/);
  });
});
