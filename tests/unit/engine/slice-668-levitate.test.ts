// Slice 668: Levitate wiring via the existing buff mechanic +
// new levitating-active condition.
//
// Composition (no new engine code): the existing `buff` mechanic
// applies a marker condition on cast. The condition projects
// `ModifySpeed { mode: 'fly', op: 'set', value: 20 }` so the
// derived speed stack reflects the 20-ft vertical fly. Horizontal
// movement requires a fixed surface; engine has no positions so
// the consumer manages the horizontal-block.
//
// What this audit pins:
//   1. Cast of Levitate applies levitating-active to the named target.
//   2. The condition is bound to the caster's concentration EffectInstance.
//   3. Concentration drop sweeps the condition off the target.
//   4. The condition definition projects fly:20 via ModifySpeed.

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

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Pell',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Lift Me',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 20, max: 20, temp: 0 },
  });

const seed = (
  caster: Character,
  target: Character,
): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'levitate' });
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
  return { engine, campaign };
};

describe('slice 668: Levitate (flight/hover via buff + levitating-active)', () => {
  it('cast applies levitating-active on the target', () => {
    const wizard = buildWizard();
    const target = buildTarget();
    const s = seed(wizard, target);
    const cast = s.engine.plan.castSpell(s.campaign.state, {
      characterId: wizard.id,
      spellId: 'levitate',
      slotLevel: 2,
      targetIds: [target.id],
      ignorePreparation: true,
    });
    const campaign = commit(s.campaign, cast.events);
    expect(
      campaign.state.characters[target.id]!.appliedConditions.some((c) => c.conditionId === 'levitating-active'),
    ).toBe(true);
  });

  it('condition is tracked on the caster concentration EffectInstance (via conditionsApplied)', () => {
    // The buff mechanic threads applied conditions into the
    // ConcentrationStarted event's `conditionsApplied` array (not via
    // sourceEffectInstanceId on the condition itself). This is the
    // contract clearConcentrationEffect uses to sweep buff-applied
    // conditions on concentration drop.
    const wizard = buildWizard();
    const target = buildTarget();
    const s = seed(wizard, target);
    const cast = s.engine.plan.castSpell(s.campaign.state, {
      characterId: wizard.id,
      spellId: 'levitate',
      slotLevel: 2,
      targetIds: [target.id],
      ignorePreparation: true,
    });
    const campaign = commit(s.campaign, cast.events);
    const concId = campaign.state.characters[wizard.id]!.concentrationEffectId!;
    const effect = campaign.state.effectInstances[concId];
    expect(effect).toBeDefined();
    const tracked = effect!.conditionsApplied.find(
      (r) => r.targetId === target.id && r.conditionId === 'levitating-active',
    );
    expect(tracked, 'levitating-active not tracked on the EffectInstance').toBeDefined();
  });

  it('concentration drop sweeps levitating-active off the target', () => {
    const wizard = buildWizard();
    const target = buildTarget();
    const s = seed(wizard, target);
    const cast = s.engine.plan.castSpell(s.campaign.state, {
      characterId: wizard.id,
      spellId: 'levitate',
      slotLevel: 2,
      targetIds: [target.id],
      ignorePreparation: true,
    });
    let campaign = commit(s.campaign, cast.events);
    const concId = campaign.state.characters[wizard.id]!.concentrationEffectId!;
    const broken: ConcentrationBrokenEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ConcentrationBroken',
      effectInstanceId: concId,
      casterId: wizard.id,
      reason: 'voluntary',
    };
    campaign = commit(campaign, [broken]);
    expect(
      campaign.state.characters[target.id]!.appliedConditions.some((c) => c.conditionId === 'levitating-active'),
    ).toBe(false);
  });

  it('levitating-active condition definition projects fly:20 via ModifySpeed', () => {
    const condition = PACK.conditions!.find((c) => c.id === 'levitating-active');
    expect(condition).toBeDefined();
    const modifySpeed = condition!.effects.find((e) => e.kind === 'ModifySpeed') as
      | { kind: 'ModifySpeed'; mode: string; op: string; value: number }
      | undefined;
    expect(modifySpeed).toBeDefined();
    expect(modifySpeed!.mode).toBe('fly');
    expect(modifySpeed!.op).toBe('set');
    expect(modifySpeed!.value).toBe(20);
  });
});
