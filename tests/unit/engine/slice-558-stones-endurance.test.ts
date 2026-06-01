// Slice 558: Goliath Giant Ancestry — Stone's Endurance (Stone Giant).
//
// RAW (SRD 5.2.1 Goliath): "_Stone's Endurance (Stone Giant)._ When
// you take damage, you can take a Reaction to roll 1d12. Add your
// Constitution modifier to the number rolled and reduce the damage
// by that total."
//
// Fifth of the 6-arm Giant Ancestry cohort. First reaction-style
// arm; modeled after planUncannyDodge (slice 200): consumer invokes
// post-DamageApplied with the damage amount, planner rolls 1d12 +
// CON mod, emits a compensating Healed event (capped at damageAmount)
// + ResourceSpent(giant-ancestry, 1) + reaction-consumed.

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
import type { HealedEvent } from '../../../src/schemas/events/combat.js';
import type { ChoiceRequiredEvent, ChoiceResolvedEvent } from '../../../src/schemas/events/level-up.js';

const PACK = loadStarterPack();

const buildGoliath = (opts: { conScore?: number; resourceCurrent?: number } = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Grog',
    speciesId: 'goliath',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 12, CON: opts.conScore ?? 16, INT: 10, WIS: 10, CHA: 8 },
    hp: { current: 14, max: 14, temp: 0 },
    resources: [{ resourceId: 'giant-ancestry', current: opts.resourceCurrent ?? 2, max: 2 }],
  });

const buildAlly = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Ally',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 14, max: 14, temp: 0 },
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
  ancestry: string,
  inEncounter: boolean = true,
) => {
  let campaign = engine.createCampaign({ name: 'se' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: goliath } satisfies CharacterCreatedEvent,
    ...seedAncestry(goliath.id, ancestry),
  ]);
  if (inEncounter) {
    // Add a second combatant so the goliath isn't the active one — for
    // a reaction the bearer must NOT be the active combatant for some
    // reaction-economy gates to apply, but Stone's Endurance is
    // available regardless of whose turn it is. We use the second
    // character mainly to satisfy createEncounter's requirements.
    const ally = buildAlly();
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
    ]);
    const enc = engine.plan.createEncounter(campaign.state, { combatantIds: [goliath.id, ally.id] });
    campaign = commit(campaign, enc.events);
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CombatantMoved', encounterId: enc.encounterId,
        combatantId: goliath.id, fromPosition: { x: 0, y: 0 }, toPosition: { x: 0, y: 0 }, feetTraveled: 0 } satisfies CombatantMovedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CombatantMoved', encounterId: enc.encounterId,
        combatantId: ally.id, fromPosition: { x: 0, y: 0 }, toPosition: { x: 5, y: 0 }, feetTraveled: 0 } satisfies CombatantMovedEvent,
    ]);
    campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
    campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
    campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  }
  return campaign;
};

describe("Goliath Stone's Endurance (slice 558)", () => {
  it('happy path: rolls 1d12 + CON mod, emits Healed + ResourceSpent + reaction', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const goliath = buildGoliath({ conScore: 16 }); // +3 mod
    const campaign = setup(engine, goliath, 'stones-endurance');
    const outcome = engine.plan.stonesEndurance(campaign.state, {
      goliathId: goliath.id,
      damageAmount: 20,
    });
    expect(outcome.reducedBy).toBeGreaterThanOrEqual(1 + 3); // 1d12 min + CON +3
    expect(outcome.reducedBy).toBeLessThanOrEqual(12 + 3); // 1d12 max + CON +3
    expect(outcome.reducedBy).toBeLessThanOrEqual(20); // capped at damageAmount
    expect(outcome.events.some((e) => (e as { type: string }).type === 'Healed')).toBe(true);
    expect(outcome.events.some((e) => (e as { type: string }).type === 'ResourceSpent')).toBe(true);
    expect(outcome.events.some(
      (e) => (e as { type: string }).type === 'ActionEconomyConsumed'
        && (e as { kind?: string }).kind === 'reaction',
    )).toBe(true);
  });

  it('reduction capped at damageAmount: tiny damage with big roll', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const goliath = buildGoliath({ conScore: 20 }); // +5 mod
    const campaign = setup(engine, goliath, 'stones-endurance');
    const outcome = engine.plan.stonesEndurance(campaign.state, {
      goliathId: goliath.id,
      damageAmount: 3, // RAW: never over-heal
    });
    expect(outcome.reducedBy).toBeLessThanOrEqual(3);
  });

  it('Healed event amount matches reducedBy', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const goliath = buildGoliath();
    const campaign = setup(engine, goliath, 'stones-endurance');
    const outcome = engine.plan.stonesEndurance(campaign.state, {
      goliathId: goliath.id,
      damageAmount: 30,
    });
    const healed = outcome.events.find((e): e is HealedEvent =>
      (e as { type: string }).type === 'Healed');
    expect(healed?.amount).toBe(outcome.reducedBy);
  });

  it('non-Goliath: rejected via shared helper', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
    const human = CharacterSchema.parse({
      id: newCharacterId(), name: 'H', speciesId: 'human', backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 14, max: 14, temp: 0 },
    });
    let campaign = engine.createCampaign({ name: 'se-h' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: human },
    ] as never[]);
    expect(() => engine.plan.stonesEndurance(campaign.state, {
      goliathId: human.id, damageAmount: 10,
    })).toThrow(/not a Goliath/);
  });

  it('wrong ancestry chosen rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
    const goliath = buildGoliath();
    const campaign = setup(engine, goliath, 'fires-burn');
    expect(() => engine.plan.stonesEndurance(campaign.state, {
      goliathId: goliath.id, damageAmount: 10,
    })).toThrow(/did not choose Stone's Endurance/);
  });

  it('depleted giant-ancestry rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(6) });
    const goliath = buildGoliath({ resourceCurrent: 0 });
    const campaign = setup(engine, goliath, 'stones-endurance');
    expect(() => engine.plan.stonesEndurance(campaign.state, {
      goliathId: goliath.id, damageAmount: 10,
    })).toThrow(/no Giant Ancestry uses remaining/);
  });

  it('reaction already used: rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
    const goliath = buildGoliath();
    let campaign = setup(engine, goliath, 'stones-endurance');
    const first = engine.plan.stonesEndurance(campaign.state, { goliathId: goliath.id, damageAmount: 10 });
    campaign = commit(campaign, first.events);
    expect(() => engine.plan.stonesEndurance(campaign.state, {
      goliathId: goliath.id, damageAmount: 10,
    })).toThrow(/reaction/i);
  });

  it('zero damage: reducedBy = 0, no Healed event', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(8) });
    const goliath = buildGoliath();
    const campaign = setup(engine, goliath, 'stones-endurance');
    const outcome = engine.plan.stonesEndurance(campaign.state, {
      goliathId: goliath.id, damageAmount: 0,
    });
    expect(outcome.reducedBy).toBe(0);
    expect(outcome.events.some((e) => (e as { type: string }).type === 'Healed')).toBe(false);
    // Still consumes resource + reaction (consumer-side decision to engage)
    expect(outcome.events.some((e) => (e as { type: string }).type === 'ResourceSpent')).toBe(true);
  });
});
