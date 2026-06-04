// Slice 559: Goliath Giant Ancestry — Storm's Thunder (Storm Giant).
//
// RAW (SRD 5.2.1 Goliath): "_Storm's Thunder (Storm Giant)._ When
// you take damage from a creature within 60 feet of you, you can
// take a Reaction to deal 1d8 Thunder damage to that creature."
//
// Sixth and FINAL arm of the Giant Ancestry cohort. Reaction-style
// planner that emits a DamageRolled → DamageApplied chain at the
// attacker (mirror of cast-spell damage emission). The within-60-ft
// gate is consumer-side per the established convention.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newChoiceId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { CombatantMovedEvent } from '../../../src/schemas/events/movement.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { DamageRolledEvent } from '../../../src/schemas/events/attack.js';
import type { ChoiceRequiredEvent, ChoiceResolvedEvent } from '../../../src/schemas/events/level-up.js';

const PACK = loadStarterPack();

const buildGoliath = (opts: { resourceCurrent?: number } = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Grog',
    speciesId: 'goliath',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 8 },
    hp: { current: 14, max: 14, temp: 0 },
    resources: [{ resourceId: 'giant-ancestry', current: opts.resourceCurrent ?? 2, max: 2 }],
  });

const buildAttacker = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Bandit',
    speciesId: 'human',
    backgroundId: 'criminal',
    classes: [{ classId: 'rogue', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 16, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 20, max: 20, temp: 0 },
  });

const seedAncestry = (characterId: string, selected: string): [ChoiceRequiredEvent, ChoiceResolvedEvent] => {
  const choiceId = newChoiceId();
  const options = [
    { id: 'clouds-jaunt', label: "Cloud's Jaunt", effects: [] },
    { id: 'fires-burn', label: "Fire's Burn", effects: [] },
    { id: 'frosts-chill', label: "Frost's Chill", effects: [] },
    { id: 'hills-tumble', label: "Hill's Tumble", effects: [] },
    { id: 'stones-endurance', label: "Stone's Endurance", effects: [] },
    { id: 'storms-thunder', label: "Storm's Thunder", effects: [] },
  ];
  return [
    { id: eventId(), at: isoTimestamp(), type: 'ChoiceRequired', choiceId, characterId,
      promptKey: 'goliath-giant-ancestry', prompt: 'Choose a Giant Ancestry.', options, oneOf: 1 },
    { id: eventId(), at: isoTimestamp(), type: 'ChoiceResolved', choiceId, characterId,
      selectedOptionIds: [selected] },
  ];
};

const setup = (
  engine: ReturnType<typeof createEngine>,
  goliath: Character,
  attacker: Character,
  ancestry: string,
) => {
  let campaign = engine.createCampaign({ name: 'st' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: goliath } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
    ...seedAncestry(goliath.id, ancestry),
  ]);
  const enc = engine.plan.createEncounter(campaign.state, { combatantIds: [goliath.id, attacker.id] });
  campaign = commit(campaign, enc.events);
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CombatantMoved', encounterId: enc.encounterId,
      combatantId: goliath.id, fromPosition: { x: 0, y: 0 }, toPosition: { x: 0, y: 0 }, feetTraveled: 0 } satisfies CombatantMovedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CombatantMoved', encounterId: enc.encounterId,
      combatantId: attacker.id, fromPosition: { x: 0, y: 0 }, toPosition: { x: 10, y: 0 }, feetTraveled: 0 } satisfies CombatantMovedEvent,
  ]);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  return campaign;
};

describe("Goliath Storm's Thunder (slice 559)", () => {
  it('happy path: emits DamageRolled + DamageApplied (1d8 thunder) + ResourceSpent + reaction', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const goliath = buildGoliath();
    const attacker = buildAttacker();
    const campaign = setup(engine, goliath, attacker, 'storms-thunder');
    const outcome = engine.plan.stormsThunder(campaign.state, {
      goliathId: goliath.id, attackerId: attacker.id,
    });
    expect(outcome.damageDealt).toBeGreaterThanOrEqual(1);
    expect(outcome.damageDealt).toBeLessThanOrEqual(8);
    const damageRolled = outcome.events.find((e): e is DamageRolledEvent =>
      (e as { type: string }).type === 'DamageRolled');
    expect(damageRolled).toBeDefined();
    expect(damageRolled!.rolls[0]!.type).toBe('thunder');
    expect(damageRolled!.rolls[0]!.expression).toBe('1d8');
    const damageApplied = outcome.events.find((e): e is DamageAppliedEvent =>
      (e as { type: string }).type === 'DamageApplied');
    expect(damageApplied?.targetId).toBe(attacker.id);
    expect(damageApplied?.sourceCharacterId).toBe(goliath.id);
    expect(damageApplied?.source).toBe('storms-thunder');
    const resourceSpent = outcome.events.find((e) => (e as { type: string }).type === 'ResourceSpent') as { resourceId: string } | undefined;
    expect(resourceSpent?.resourceId).toBe('giant-ancestry');
    expect(outcome.events.some(
      (e) => (e as { type: string }).type === 'ActionEconomyConsumed'
        && (e as { kind?: string }).kind === 'reaction',
    )).toBe(true);
  });

  it('Storm\'s Thunder applies damage to attacker, not goliath', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const goliath = buildGoliath();
    const attacker = buildAttacker();
    let campaign = setup(engine, goliath, attacker, 'storms-thunder');
    const outcome = engine.plan.stormsThunder(campaign.state, {
      goliathId: goliath.id, attackerId: attacker.id,
    });
    campaign = commit(campaign, outcome.events);
    const attackerAfter = campaign.state.characters[attacker.id]!;
    expect(attackerAfter.hp.current).toBeLessThan(20);
    const goliathAfter = campaign.state.characters[goliath.id]!;
    expect(goliathAfter.hp.current).toBe(14); // unchanged
  });

  it('Storm\'s Thunder targeting self: rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const goliath = buildGoliath();
    const attacker = buildAttacker();
    const campaign = setup(engine, goliath, attacker, 'storms-thunder');
    expect(() => engine.plan.stormsThunder(campaign.state, {
      goliathId: goliath.id, attackerId: goliath.id,
    })).toThrow(/targets the creature that dealt damage/);
  });

  it('non-Goliath: rejected via shared helper', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
    const human = CharacterSchema.parse({
      id: newCharacterId(), name: 'H', speciesId: 'human', backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 14, max: 14, temp: 0 },
    });
    const attacker = buildAttacker();
    let campaign = engine.createCampaign({ name: 'st-h' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: human },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker },
    ] as never[]);
    expect(() => engine.plan.stormsThunder(campaign.state, {
      goliathId: human.id, attackerId: attacker.id,
    })).toThrow(/not a Goliath/);
  });

  it('wrong ancestry chosen: rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
    const goliath = buildGoliath();
    const attacker = buildAttacker();
    const campaign = setup(engine, goliath, attacker, 'stones-endurance');
    expect(() => engine.plan.stormsThunder(campaign.state, {
      goliathId: goliath.id, attackerId: attacker.id,
    })).toThrow(/did not choose Storm's Thunder/);
  });

  it('depleted Giant Ancestry: rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(6) });
    const goliath = buildGoliath({ resourceCurrent: 0 });
    const attacker = buildAttacker();
    const campaign = setup(engine, goliath, attacker, 'storms-thunder');
    expect(() => engine.plan.stormsThunder(campaign.state, {
      goliathId: goliath.id, attackerId: attacker.id,
    })).toThrow(/no Giant Ancestry uses remaining/);
  });

  it('reaction already used: rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
    const goliath = buildGoliath();
    const attacker = buildAttacker();
    let campaign = setup(engine, goliath, attacker, 'storms-thunder');
    const first = engine.plan.stormsThunder(campaign.state, { goliathId: goliath.id, attackerId: attacker.id });
    campaign = commit(campaign, first.events);
    expect(() => engine.plan.stormsThunder(campaign.state, {
      goliathId: goliath.id, attackerId: attacker.id,
    })).toThrow(/reaction/i);
  });
});
