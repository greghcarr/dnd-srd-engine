// Slice 453: Orc Adrenaline Rush species trait.
//
// RAW (SRD 5.2.1 Orc): "Adrenaline Rush. You can take the Dash action
// as a Bonus Action. When you do so, you gain a number of Temporary
// Hit Points equal to your Proficiency Bonus."
//
// New `planAdrenalineRush` planner emits: ActionEconomyConsumed
// (bonus action), Dashed, TempHPGranted (amount = wielder's PB).
// At-will per RAW (no per-rest cap). Requires the orc to be the
// active combatant in an active encounter (mirrors planDash /
// planStepOfTheWind).
//
// Test cases:
//   - Orc L1 (PB 2): succeeds; emits 3 events; TempHP = 2.
//   - Orc L5 (PB 3): TempHP = 3 (PB scales).
//   - Human: rejected ("does not have Adrenaline Rush").
//   - Bonus action already used: rejected.
//   - Already dashed this turn: rejected.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { TempHPGrantedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();

const buildOrc = (level: number, adrenalineRemaining?: number): Character => {
  // PB for fighter level 1-4 is 2; 5-8 is 3. Default the resource to
  // a "full pool" (= PB) so tests that don't care about depletion
  // start with what slice 459's GrantResource would refund on rest.
  const pb = level >= 5 ? 3 : 2;
  return CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Grug',
    speciesId: 'orc',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level, hitDiceRemaining: level }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 8 },
    hp: { current: 12, max: 12, temp: 0 },
    resources: [
      { resourceId: 'adrenaline-rush', current: adrenalineRemaining ?? pb, max: pb },
      { resourceId: 'relentless-endurance', current: 1, max: 1 },
    ],
  });
};

const buildHuman = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Alex',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
  });

const startEncounter = (engine: ReturnType<typeof createEngine>, characters: Character[]) => {
  let campaign = engine.createCampaign({ name: 'adren-rush' });
  campaign = commit(
    campaign,
    characters.map(
      (c) =>
        ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c }) satisfies CharacterCreatedEvent,
    ),
  );
  const enc = engine.plan.createEncounter(campaign.state, { combatantIds: characters.map((c) => c.id) });
  campaign = commit(campaign, enc.events);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  return campaign;
};

describe('Orc Adrenaline Rush (slice 453 + slice 459 PB-uses correction)', () => {
  it('Orc L1 uses Adrenaline Rush: emits bonus-action, ResourceSpent, Dashed, TempHP = PB 2', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const orc = buildOrc(1);
    const campaign = startEncounter(engine, [orc]);
    const events = engine.plan.adrenalineRush(campaign.state, { orcId: orc.id }).events;
    expect(events.length).toBe(4);
    expect(events[0]!.type).toBe('ActionEconomyConsumed');
    expect(events[1]!.type).toBe('ResourceSpent');
    expect(events[2]!.type).toBe('Dashed');
    expect(events[3]!.type).toBe('TempHPGranted');
    expect((events[3] as TempHPGrantedEvent).amount).toBe(2);
    expect((events[3] as TempHPGrantedEvent).targetId).toBe(orc.id);
  });

  it('Orc L5 (PB 3) gains 3 Temporary HP', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const orc = buildOrc(5);
    const campaign = startEncounter(engine, [orc]);
    const events = engine.plan.adrenalineRush(campaign.state, { orcId: orc.id }).events;
    const tempHP = events.find((e) => e.type === 'TempHPGranted') as TempHPGrantedEvent | undefined;
    expect(tempHP?.amount).toBe(3);
  });

  it('Orc with depleted adrenaline-rush resource: rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
    const orc = buildOrc(1, 0); // resource current = 0
    const campaign = startEncounter(engine, [orc]);
    expect(() => engine.plan.adrenalineRush(campaign.state, { orcId: orc.id }))
      .toThrow(/no Adrenaline Rush uses remaining/);
  });

  it('non-Orc is rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const human = buildHuman();
    const campaign = startEncounter(engine, [human]);
    expect(() => engine.plan.adrenalineRush(campaign.state, { orcId: human.id }))
      .toThrow(/does not have Adrenaline Rush/);
  });

  it('rejects when bonus action already used', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
    const orc = buildOrc(1);
    let campaign = startEncounter(engine, [orc]);
    const first = engine.plan.adrenalineRush(campaign.state, { orcId: orc.id }).events;
    campaign = commit(campaign, first);
    expect(() => engine.plan.adrenalineRush(campaign.state, { orcId: orc.id }))
      .toThrow(/already used their bonus action|already dashed/);
  });
});
