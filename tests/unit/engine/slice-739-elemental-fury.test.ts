// Slice 739: Druid L7 Elemental Fury (+ Cleric L7 Potent Spellcasting closure).
//
// SRD 5.2.1 Elemental Fury — choose one:
//   Potent Spellcasting: add your WIS modifier to the damage of any Druid
//     cantrip.
//   Primal Strike: once per turn, a weapon / Wild Shape attack hit deals
//     +1d8 Cold/Fire/Lightning/Thunder (element chosen at selection here).
//
// Potent Spellcasting is wired via an `AddModifier { target: 'damage' }`
// gated on the new `event.spellLevel == 0` fact; the same primitive closes
// the previously-stubbed Cleric Blessed Strikes Potent Spellcasting arm.
// Primal Strike reuses the Divine Strike OnEvent rider shape.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent } from '../../../src/schemas/events/level-up.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { Event } from '../../../src/schemas/events/index.js';

const PACK = loadStarterPack();
const WIS_MOD = 3; // WIS 16

const buildDruid = (level: number, knownSpells: string[]): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Thornwise',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'druid', level, hitDiceRemaining: level }],
    abilityScores: { STR: 10, DEX: 14, CON: 14, INT: 10, WIS: 16, CHA: 10 },
    hp: { current: 45, max: 45, temp: 0 },
    knownSpells,
    preparedSpells: [],
  });

const buildCleric = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Theia',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level, hitDiceRemaining: level }],
    abilityScores: { STR: 14, DEX: 10, CON: 14, INT: 10, WIS: 16, CHA: 12 },
    hp: { current: 48, max: 48, temp: 0 },
    knownSpells: ['sacred-flame'],
    preparedSpells: [],
  });

const buildDummy = (dex: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Dummy',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: dex, CON: 10, INT: 8, WIS: 8, CHA: 8 },
    hp: { current: 200, max: 200, temp: 0 },
  });

const damageTo = (events: ReadonlyArray<Event>, targetId: string): number =>
  events
    .filter((e): e is DamageAppliedEvent => e.type === 'DamageApplied' && e.targetId === targetId)
    .flatMap((e) => e.components)
    .reduce((s, c) => s + c.amount, 0);

// Level a freshly-built L6 caster to L7 and (optionally) resolve its L7
// Elemental Fury / Blessed Strikes choice to the given option.
const levelAndChoose = (
  engine: ReturnType<typeof createEngine>,
  campaign: Campaign,
  characterId: string,
  classId: string,
  promptKey: string,
  optionId: string | undefined,
): Campaign => {
  const lvl = engine.plan.levelUp(campaign.state, { characterId, classId, hpStrategy: 'average' }).events;
  let camp = commit(campaign, lvl);
  if (optionId !== undefined) {
    const cr = lvl.find((e): e is ChoiceRequiredEvent => e.type === 'ChoiceRequired' && (e as ChoiceRequiredEvent).promptKey === promptKey)!;
    camp = commit(camp, engine.plan.resolveChoice(camp.state, { choiceId: cr.choiceId, characterId, selectedOptionIds: [optionId] }).events);
  }
  return camp;
};

describe('slice 739: Elemental Fury (Druid L7)', () => {
  it('Potent Spellcasting adds WIS to a Druid cantrip\'s damage (attack cantrip)', () => {
    const seed = 12;
    const cast = (option: string | undefined): number | null => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const druid = buildDruid(6, ['produce-flame']);
      const dummy = buildDummy(10);
      let camp = engine.createCampaign({ name: 'potent' });
      camp = commit(camp, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: druid } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dummy } satisfies CharacterCreatedEvent,
      ]);
      camp = levelAndChoose(engine, camp, druid.id, 'druid', 'druid-elemental-fury', option);
      const ev = engine.plan.castSpell(camp.state, { characterId: druid.id, spellId: 'produce-flame', slotLevel: 0, targetIds: [dummy.id] }).events as ReadonlyArray<Event>;
      const rolled = ev.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      if (rolled?.hit !== true) return null;
      return damageTo(ev, dummy.id);
    };
    const potent = cast('potent-spellcasting');
    const plain = cast(undefined); // choice left unresolved → no benefit
    expect(potent, 'produce-flame missed at the chosen seed').not.toBeNull();
    expect(plain).not.toBeNull();
    expect(potent! - plain!).toBe(WIS_MOD);
  });

  it('Primal Strike fires +1d8 of the chosen element on a weapon hit, once per turn', () => {
    let proven = false;
    for (let seed = 1; seed < 100 && !proven; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const club = makeItemInstance('club');
      const druid = buildDruid(6, []);
      const dummy = buildDummy(10);
      let camp = engine.createCampaign({ name: 'primal' });
      camp = commit(camp, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: club },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: druid } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dummy } satisfies CharacterCreatedEvent,
      ]);
      camp = levelAndChoose(engine, camp, druid.id, 'druid', 'druid-elemental-fury', 'primal-strike-fire');
      const attack = engine.plan.attack(camp.state, { attackerId: druid.id, targetId: dummy.id, weaponInstanceId: club.id }).events;
      if ((attack.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined)?.hit !== true) continue;
      const fired = attack.find((e) => e.type === 'TriggerFired' && (e as { triggerId: string }).triggerId.endsWith('elemental-fury-primal-strike'));
      expect(fired, 'Primal Strike rider did not fire on a hit').toBeDefined();
      // Once per turn: a second attack the same turn does not re-fire.
      camp = commit(camp, attack);
      const second = engine.plan.attack(camp.state, { attackerId: druid.id, targetId: dummy.id, weaponInstanceId: club.id }).events;
      if ((second.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined)?.hit === true) {
        expect(second.find((e) => e.type === 'TriggerFired' && (e as { triggerId: string }).triggerId.endsWith('elemental-fury-primal-strike'))).toBeUndefined();
      }
      proven = true;
    }
    expect(proven, 'no Primal Strike hit landed in 100 seeds').toBe(true);
  });
});

describe('slice 739: Cleric Blessed Strikes — Potent Spellcasting closure', () => {
  it('Potent Spellcasting adds WIS to a Cleric cantrip\'s damage (Sacred Flame, save)', () => {
    const seed = 5;
    const cast = (option: string | undefined): number => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const cleric = buildCleric(6);
      const dummy = buildDummy(1); // DEX 1 → always fails the DEX save → full damage
      let camp = engine.createCampaign({ name: 'cleric-potent' });
      camp = commit(camp, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dummy } satisfies CharacterCreatedEvent,
      ]);
      camp = levelAndChoose(engine, camp, cleric.id, 'cleric', 'cleric-blessed-strikes', option);
      const ev = engine.plan.castSpell(camp.state, { characterId: cleric.id, spellId: 'sacred-flame', slotLevel: 0, targetIds: [dummy.id] }).events as ReadonlyArray<Event>;
      return damageTo(ev, dummy.id);
    };
    const potent = cast('potent-spellcasting');
    const plain = cast(undefined);
    expect(potent - plain).toBe(WIS_MOD);
  });
});
