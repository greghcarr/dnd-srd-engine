// Slice 554: Goliath Giant Ancestry — Cloud's Jaunt (Cloud Giant).
//
// RAW (SRD 5.2.1 Goliath): "As a Bonus Action, you magically teleport
// up to 30 feet to an unoccupied space you can see."
//
// First of the 6-arm Giant Ancestry cohort (slices 554-559). All six
// share the `giant-ancestry` resource (already wired on the species)
// and pull the Goliath's resolved ancestry choice via a shared
// helper in `src/engine/plan/_giant-ancestry.ts`.

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

const buildHuman = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Alyx',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
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
  ancestryChoice: string | undefined,
  goliathPos: { x: number; y: number } = { x: 0, y: 0 },
) => {
  let campaign = engine.createCampaign({ name: 'cj' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: goliath } satisfies CharacterCreatedEvent,
    ...(ancestryChoice !== undefined ? seedAncestry(goliath.id, ancestryChoice) : []),
  ]);
  const enc = engine.plan.createEncounter(campaign.state, { combatantIds: [goliath.id] });
  campaign = commit(campaign, enc.events);
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CombatantMoved', encounterId: enc.encounterId,
      combatantId: goliath.id, fromPosition: { x: 0, y: 0 }, toPosition: goliathPos, feetTraveled: 0 } satisfies CombatantMovedEvent,
  ]);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  return campaign;
};

describe("Goliath Cloud's Jaunt (slice 554)", () => {
  it('happy path: emits BA + ResourceSpent + CombatantMoved (teleport)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const goliath = buildGoliath();
    const campaign = setup(engine, goliath, 'clouds-jaunt');
    const { events } = engine.plan.cloudsJaunt(campaign.state, { goliathId: goliath.id, to: { x: 30, y: 0 } });
    expect(events.length).toBe(3);
    expect(events[0]!.type).toBe('ActionEconomyConsumed');
    expect(events[1]!.type).toBe('ResourceSpent');
    expect(events[2]!.type).toBe('CombatantMoved');
    expect((events[2] as CombatantMovedEvent).feetTraveled).toBe(0);
    expect((events[2] as CombatantMovedEvent).toPosition).toEqual({ x: 30, y: 0 });
  });

  it('non-Goliath rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const human = buildHuman();
    let campaign = engine.createCampaign({ name: 'cj-h' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: human } satisfies CharacterCreatedEvent,
    ]);
    const enc = engine.plan.createEncounter(campaign.state, { combatantIds: [human.id] });
    campaign = commit(campaign, enc.events);
    expect(() => engine.plan.cloudsJaunt(campaign.state, { goliathId: human.id, to: { x: 10, y: 0 } }))
      .toThrow(/not a Goliath/);
  });

  it('Goliath without Cloud\'s Jaunt ancestry choice rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const goliath = buildGoliath();
    const campaign = setup(engine, goliath, 'fires-burn'); // wrong choice
    expect(() => engine.plan.cloudsJaunt(campaign.state, { goliathId: goliath.id, to: { x: 10, y: 0 } }))
      .toThrow(/did not choose Cloud's Jaunt/);
  });

  it('depleted Giant Ancestry uses: rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
    const goliath = buildGoliath({ resourceCurrent: 0 });
    const campaign = setup(engine, goliath, 'clouds-jaunt');
    expect(() => engine.plan.cloudsJaunt(campaign.state, { goliathId: goliath.id, to: { x: 10, y: 0 } }))
      .toThrow(/no Giant Ancestry uses remaining/);
  });

  it('destination > 30 ft: rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
    const goliath = buildGoliath();
    const campaign = setup(engine, goliath, 'clouds-jaunt');
    expect(() => engine.plan.cloudsJaunt(campaign.state, { goliathId: goliath.id, to: { x: 35, y: 0 } }))
      .toThrow(/35ft away \(max 30ft\)/);
  });

  it('BA already used: rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(6) });
    const goliath = buildGoliath();
    let campaign = setup(engine, goliath, 'clouds-jaunt');
    const first = engine.plan.cloudsJaunt(campaign.state, { goliathId: goliath.id, to: { x: 10, y: 0 } }).events;
    campaign = commit(campaign, first);
    expect(() => engine.plan.cloudsJaunt(campaign.state, { goliathId: goliath.id, to: { x: 20, y: 0 } }))
      .toThrow(/already used their bonus action/);
  });

  it('replay equivalence: position updates + resource decrements', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
    const goliath = buildGoliath();
    let campaign = setup(engine, goliath, 'clouds-jaunt');
    const events = engine.plan.cloudsJaunt(campaign.state, { goliathId: goliath.id, to: { x: 25, y: 5 } }).events;
    campaign = commit(campaign, events);
    const after = campaign.state.characters[goliath.id]!;
    expect(after.resources.find((r) => r.resourceId === 'giant-ancestry')?.current).toBe(1);
    const enc = campaign.state.encounters[campaign.state.activeEncounterId!]!;
    const cb = enc.combatants.find((c) => c.combatantId === goliath.id)!;
    expect(cb.position).toEqual({ x: 25, y: 5 });
  });
});
