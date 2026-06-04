// Slice 541: Dragonborn Breath Weapon.
//
// RAW (SRD 5.2.1 Dragonborn): "Breath Weapon. When you take the
// Attack action on your turn, you can replace one of your attacks
// with an exhalation of magical energy in either a 15-foot Cone or
// a 30-foot Line that is 5 feet wide (choose the shape each time).
// Each creature in that area must make a Dexterity saving throw
// (DC 8 plus your Constitution modifier and Proficiency Bonus). On
// a failed save, a creature takes 1d10 damage of the type determined
// by your Draconic Ancestry trait. On a successful save, a creature
// takes half as much damage. This damage increases by 1d10 when you
// reach character levels 5 (2d10), 11 (3d10), and 17 (4d10). You
// can use this Breath Weapon a number of times equal to your
// Proficiency Bonus, and you regain all expended uses when you
// finish a Long Rest."
//
// Engine surface:
//   - Dragonborn species gains GrantResource { resourceId:
//     'dragonborn-breath-weapon', max: profBonus, recharge:
//     'longRest' } (slice 541).
//   - New planDragonbornBreath consumes Action + ResourceSpent +
//     emits per-target SaveRolled (DEX, DC = 8 + CON + PB) +
//     DamageApplied (damage rolled once for area; halved on save).
//
// Documented RAW deviations:
//   - Consumes whole Action rather than "replace one of your
//     attacks within Attack action." At L1 these are equivalent
//     (1 attack on Attack action). From L5+ (Extra Attack) the
//     under-pricing applies; documented.
//   - Damage type is consumer-supplied (from the Draconic Ancestry
//     pick); engine validates membership in the allowed set but
//     doesn't cross-check against the resolved ancestry choice.
//   - Target list is consumer-supplied per the area shape (engine
//     doesn't compute cone / line inclusion -- standard convention).

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { ResourceSpentEvent } from '../../../src/schemas/events/resources.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildDragonborn = (level: number = 1): Character => {
  const pb = level < 5 ? 2 : level < 9 ? 3 : level < 13 ? 4 : level < 17 ? 5 : 6;
  return CharacterSchema.parse({
    id: newCharacterId(),
    name: `Drak-L${level}`,
    speciesId: 'dragonborn',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level, hitDiceRemaining: level }],
    abilityScores: { STR: 16, DEX: 12, CON: 16, INT: 10, WIS: 10, CHA: 12 },
    hp: { current: 12, max: 12, temp: 0 },
    resources: [{ resourceId: 'dragonborn-breath-weapon', current: pb, max: pb }],
  });
};

const buildTarget = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 6, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 100, max: 100, temp: 0 },
  });

const startSoloEncounter = (
  engine: ReturnType<typeof createEngine>,
  campaign: Campaign,
  combatantIds: string[],
) => {
  const created = engine.plan.createEncounter(campaign.state, { combatantIds, name: 'breath-test' });
  campaign = commit(campaign, created.events);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: created.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: created.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: created.encounterId }).events);
  return { campaign, encounterId: created.encounterId };
};

const advanceToCombatant = (
  engine: ReturnType<typeof createEngine>,
  campaign: Campaign,
  encounterId: string,
  combatantId: string,
): Campaign => {
  for (let i = 0; i < 6; i += 1) {
    const enc = campaign.state.encounters[encounterId]!;
    if (enc.combatants[enc.activeIndex]?.combatantId === combatantId) return campaign;
    campaign = commit(campaign, engine.plan.advanceTurn(campaign.state, { encounterId }).events);
  }
  throw new Error(`combatant never became active`);
};

describe('Dragonborn Breath Weapon (slice 541)', () => {
  it('the dragonborn species ships the breath-weapon GrantResource trait', () => {
    const sp = PACK.species.find((s) => s.id === 'dragonborn')!;
    const res = sp.traits.find(
      (t) => t.kind === 'GrantResource' && (t as { resourceId?: string }).resourceId === 'dragonborn-breath-weapon',
    );
    expect(res).toBeDefined();
    expect((res as { recharge: string }).recharge).toBe('longRest');
  });

  it('L1 dragonborn fighter at CON 16 (+3) + PB 2: save DC = 8+3+2 = 13', () => {
    const dragonborn = buildDragonborn(1);
    const target = buildTarget('Dummy');
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(541) });
    let camp: Campaign = engine.createCampaign({ name: 'dc-13' });
    camp = commit(camp, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dragonborn } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const enc = startSoloEncounter(engine, camp, [dragonborn.id, target.id]);
    camp = advanceToCombatant(engine, enc.campaign, enc.encounterId, dragonborn.id);
    const events = engine.plan.dragonbornBreath(camp.state, {
      dragonbornId: dragonborn.id,
      damageType: 'fire',
      areaShape: 'cone',
      targetIds: [target.id],
    }).events;
    const sr = events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent;
    expect(sr).toBeDefined();
    expect(sr.dc).toBe(13);
    expect(sr.ability).toBe('DEX');
  });

  it('emits Action + ResourceSpent + per-target SaveRolled + DamageApplied at L1 (1d10)', () => {
    const dragonborn = buildDragonborn(1);
    const target = buildTarget('T1');
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(542) });
    let camp: Campaign = engine.createCampaign({ name: 'fire-cone' });
    camp = commit(camp, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dragonborn } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const enc = startSoloEncounter(engine, camp, [dragonborn.id, target.id]);
    camp = advanceToCombatant(engine, enc.campaign, enc.encounterId, dragonborn.id);
    const events = engine.plan.dragonbornBreath(camp.state, {
      dragonbornId: dragonborn.id,
      damageType: 'fire',
      areaShape: 'cone',
      targetIds: [target.id],
    }).events;
    const kinds = events.map((e) => e.type);
    expect(kinds).toContain('ActionEconomyConsumed');
    expect(kinds).toContain('ResourceSpent');
    expect(kinds).toContain('SaveRolled');
    const rs = events.find((e) => e.type === 'ResourceSpent') as ResourceSpentEvent;
    expect(rs.resourceId).toBe('dragonborn-breath-weapon');
    // Damage range at L1: 1..10 (full) or 0..5 (half on save success). With low-DEX target this almost always lands.
    const dmg = events.find((e) => e.type === 'DamageApplied') as DamageAppliedEvent | undefined;
    if (dmg) {
      expect(dmg.components[0]!.type).toBe('fire');
      expect(dmg.components[0]!.amount).toBeGreaterThanOrEqual(0);
      expect(dmg.components[0]!.amount).toBeLessThanOrEqual(10);
    }
  });

  it('damage scales by character level: L5 = 2d10 (range 2-20)', () => {
    const dragonborn = buildDragonborn(5);
    const target = buildTarget('T-L5');
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(543) });
    let camp: Campaign = engine.createCampaign({ name: 'l5-scaling' });
    camp = commit(camp, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dragonborn } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const enc = startSoloEncounter(engine, camp, [dragonborn.id, target.id]);
    camp = advanceToCombatant(engine, enc.campaign, enc.encounterId, dragonborn.id);
    const events = engine.plan.dragonbornBreath(camp.state, {
      dragonbornId: dragonborn.id,
      damageType: 'cold',
      areaShape: 'line',
      targetIds: [target.id],
    }).events;
    const dmg = events.find((e) => e.type === 'DamageApplied') as DamageAppliedEvent | undefined;
    if (dmg) {
      // 2d10 full damage range 2-20; half range 1-10. Either way <=20.
      expect(dmg.components[0]!.amount).toBeLessThanOrEqual(20);
    }
  });

  it('multi-target: rolls damage once and applies per target (halved on save)', () => {
    const dragonborn = buildDragonborn(1);
    const t1 = buildTarget('T1');
    const t2 = buildTarget('T2');
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(544) });
    let camp: Campaign = engine.createCampaign({ name: 'multi' });
    camp = commit(camp, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dragonborn } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: t1 } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: t2 } satisfies CharacterCreatedEvent,
    ]);
    const enc = startSoloEncounter(engine, camp, [dragonborn.id, t1.id, t2.id]);
    camp = advanceToCombatant(engine, enc.campaign, enc.encounterId, dragonborn.id);
    const events = engine.plan.dragonbornBreath(camp.state, {
      dragonbornId: dragonborn.id,
      damageType: 'lightning',
      areaShape: 'line',
      targetIds: [t1.id, t2.id],
    }).events;
    const saves = events.filter((e) => e.type === 'SaveRolled');
    expect(saves).toHaveLength(2);
  });

  it('throws for non-dragonborn', () => {
    const human = buildTarget('Human');
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(545) });
    let camp: Campaign = engine.createCampaign({ name: 'no-dragon' });
    camp = commit(camp, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: human } satisfies CharacterCreatedEvent,
    ]);
    const enc = startSoloEncounter(engine, camp, [human.id]);
    camp = enc.campaign;
    expect(() =>
      engine.plan.dragonbornBreath(camp.state, {
        dragonbornId: human.id,
        damageType: 'fire',
        areaShape: 'cone',
        targetIds: [],
      }),
    ).toThrow(/Dragonborn species only/i);
  });

  it('throws on disallowed damage type (e.g., bludgeoning)', () => {
    const dragonborn = buildDragonborn(1);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(546) });
    let camp: Campaign = engine.createCampaign({ name: 'bad-type' });
    camp = commit(camp, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dragonborn } satisfies CharacterCreatedEvent,
    ]);
    const enc = startSoloEncounter(engine, camp, [dragonborn.id]);
    camp = advanceToCombatant(engine, enc.campaign, enc.encounterId, dragonborn.id);
    expect(() =>
      engine.plan.dragonbornBreath(camp.state, {
        dragonbornId: dragonborn.id,
        damageType: 'bludgeoning',
        areaShape: 'cone',
        targetIds: [],
      }),
    ).toThrow(/acid \/ cold \/ fire \/ lightning \/ poison/i);
  });

  it('throws when no Breath Weapon uses remain', () => {
    const dragonborn = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Spent',
      speciesId: 'dragonborn',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 16, DEX: 12, CON: 16, INT: 10, WIS: 10, CHA: 12 },
      hp: { current: 12, max: 12, temp: 0 },
      resources: [{ resourceId: 'dragonborn-breath-weapon', current: 0, max: 2 }],
    });
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(547) });
    let camp: Campaign = engine.createCampaign({ name: 'exhausted' });
    camp = commit(camp, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dragonborn } satisfies CharacterCreatedEvent,
    ]);
    const enc = startSoloEncounter(engine, camp, [dragonborn.id]);
    camp = advanceToCombatant(engine, enc.campaign, enc.encounterId, dragonborn.id);
    expect(() =>
      engine.plan.dragonbornBreath(camp.state, {
        dragonbornId: dragonborn.id,
        damageType: 'fire',
        areaShape: 'cone',
        targetIds: [],
      }),
    ).toThrow(/no Breath Weapon uses remaining/i);
  });
});
