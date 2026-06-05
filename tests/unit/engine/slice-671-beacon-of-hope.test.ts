// Slice 671: Beacon of Hope wiring.
//
// Composition: existing `buff` mechanic applies the composite
// condition. The condition projects SetAdvantage on WIS saves +
// GrantMaxHealingDice (the existing healing-max primitive).
//
// What this audit pins:
//   1. Cast applies beacon-of-hope-active on each named target.
//   2. The condition's effects array carries SetAdvantage on WIS
//      saves + GrantMaxHealingDice.
//   3. Concentration drop sweeps the condition off all targets.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConcentrationBrokenEvent } from '../../../src/schemas/events/concentration.js';

const PACK = loadStarterPack();

const buildCleric = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Sera',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level: 5, hitDiceRemaining: 5, subclassId: 'life-domain' }],
    abilityScores: { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 18, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
  });

const buildAlly = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Ally',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
  });

const seed = (
  caster: Character,
  allies: Character[],
): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'beacon-of-hope' });
  campaign = commit(campaign, [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: caster,
    } satisfies CharacterCreatedEvent,
    ...allies.map(
      (a) =>
        ({
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: a,
        } satisfies CharacterCreatedEvent),
    ),
  ]);
  return { engine, campaign };
};

describe('slice 671: Beacon of Hope (composite-buff)', () => {
  it('cast applies beacon-of-hope-active to all named targets', () => {
    const cleric = buildCleric();
    const a1 = buildAlly();
    const a2 = buildAlly();
    const s = seed(cleric, [a1, a2]);
    const cast = s.engine.plan.castSpell(s.campaign.state, {
      characterId: cleric.id,
      spellId: 'beacon-of-hope',
      slotLevel: 3,
      targetIds: [a1.id, a2.id],
      ignorePreparation: true,
    });
    const campaign = commit(s.campaign, cast.events);
    expect(
      campaign.state.characters[a1.id]!.appliedConditions.some((c) => c.conditionId === 'beacon-of-hope-active'),
    ).toBe(true);
    expect(
      campaign.state.characters[a2.id]!.appliedConditions.some((c) => c.conditionId === 'beacon-of-hope-active'),
    ).toBe(true);
  });

  it('beacon-of-hope-active condition projects SetAdvantage on WIS saves + GrantMaxHealingDice', () => {
    const condition = PACK.conditions!.find((c) => c.id === 'beacon-of-hope-active');
    expect(condition).toBeDefined();
    const setAdv = condition!.effects.find(
      (e) =>
        e.kind === 'SetAdvantage' &&
        typeof (e as { on: unknown }).on === 'object' &&
        ((e as { on: { kind: string; ability: string } }).on.kind === 'save') &&
        ((e as { on: { kind: string; ability: string } }).on.ability === 'WIS'),
    );
    expect(setAdv).toBeDefined();
    expect(condition!.effects.some((e) => e.kind === 'GrantMaxHealingDice')).toBe(true);
  });

  it('concentration drop sweeps beacon-of-hope-active off all targets', () => {
    const cleric = buildCleric();
    const a1 = buildAlly();
    const a2 = buildAlly();
    const s = seed(cleric, [a1, a2]);
    const cast = s.engine.plan.castSpell(s.campaign.state, {
      characterId: cleric.id,
      spellId: 'beacon-of-hope',
      slotLevel: 3,
      targetIds: [a1.id, a2.id],
      ignorePreparation: true,
    });
    let campaign = commit(s.campaign, cast.events);
    const concId = campaign.state.characters[cleric.id]!.concentrationEffectId!;
    const broken: ConcentrationBrokenEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ConcentrationBroken',
      effectInstanceId: concId,
      casterId: cleric.id,
      reason: 'voluntary',
    };
    campaign = commit(campaign, [broken]);
    expect(
      campaign.state.characters[a1.id]!.appliedConditions.some((c) => c.conditionId === 'beacon-of-hope-active'),
    ).toBe(false);
    expect(
      campaign.state.characters[a2.id]!.appliedConditions.some((c) => c.conditionId === 'beacon-of-hope-active'),
    ).toBe(false);
  });
});
