// Slice 669: Dragon's Breath wiring.
//
// Composition: existing buff mechanic with casterChoosesVariant
// (5 variants — one per damage type) applies a marker condition on
// the touched creature. The buffed creature uses its action via a
// new dedicated planner `planExhaleDragonsBreath` that rolls 3d6
// DEX-save in a 15-ft cone per target (+1d6 per slot above L2).
//
// What this audit pins:
//   1. Cast with the 'fire' caster-choice applies
//      dragons-breath-fire-active on the named target.
//   2. The buffed creature can invoke planExhaleDragonsBreath
//      with damageType='fire' to roll save+damage against targets.
//   3. Each target gets a SaveRolled + (on-fail full / on-success
//      half) DamageApplied for fire damage.
//   4. Trying to exhale a damage type not matching the carried
//      condition throws.
//   5. Concentration drop sweeps the marker.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { ConcentrationBrokenEvent } from '../../../src/schemas/events/concentration.js';

const PACK = loadStarterPack();

const buildSorcerer = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Pell',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'sorcerer', level: 5, hitDiceRemaining: 5, subclassId: 'draconic-sorcery' }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 12, WIS: 12, CHA: 18 },
    hp: { current: 28, max: 28, temp: 0 },
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

const buildVictim = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Victim',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

const seedThree = (
  caster: Character,
  ally: Character,
  victim: Character,
  rngSeed = 1,
): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(rngSeed) });
  let campaign = engine.createCampaign({ name: 'dragons-breath' });
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
      snapshot: ally,
    } satisfies CharacterCreatedEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: victim,
    } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

describe('slice 669: Dragon\'s Breath (buff + on-action exhalation)', () => {
  it('cast with fire caster-choice applies dragons-breath-fire-active on the touched ally', () => {
    const caster = buildSorcerer();
    const ally = buildAlly();
    const victim = buildVictim();
    const s = seedThree(caster, ally, victim);
    const cast = s.engine.plan.castSpell(s.campaign.state, {
      characterId: caster.id,
      spellId: 'dragons-breath',
      slotLevel: 2,
      targetIds: [ally.id],
      ignorePreparation: true,
      casterChoice: { kind: 'variant', value: 'fire' },
    });
    const campaign = commit(s.campaign, cast.events);
    expect(
      campaign.state.characters[ally.id]!.appliedConditions.some(
        (c) => c.conditionId === 'dragons-breath-fire-active',
      ),
    ).toBe(true);
  });

  it('buffed ally exhales fire: each target gets SaveRolled + DamageApplied for fire', () => {
    const caster = buildSorcerer();
    const ally = buildAlly();
    const victim = buildVictim();
    const s = seedThree(caster, ally, victim);
    const cast = s.engine.plan.castSpell(s.campaign.state, {
      characterId: caster.id,
      spellId: 'dragons-breath',
      slotLevel: 2,
      targetIds: [ally.id],
      ignorePreparation: true,
      casterChoice: { kind: 'variant', value: 'fire' },
    });
    let campaign = commit(s.campaign, cast.events);
    const exhale = s.engine.plan.exhaleDragonsBreath(campaign.state, {
      characterId: ally.id,
      damageType: 'fire',
      targetIds: [victim.id],
    });
    expect(exhale.events.some((e) => e.type === 'SaveRolled')).toBe(true);
    const damage = exhale.events.find(
      (e): e is DamageAppliedEvent => e.type === 'DamageApplied' && e.targetId === victim.id,
    );
    expect(damage, 'No DamageApplied to victim').toBeDefined();
    expect(damage!.components[0]!.type).toBe('fire');
    expect(damage!.components[0]!.amount).toBeGreaterThan(0);
  });

  it('exhaling a damage type not matching the carried condition throws', () => {
    const caster = buildSorcerer();
    const ally = buildAlly();
    const victim = buildVictim();
    const s = seedThree(caster, ally, victim);
    const cast = s.engine.plan.castSpell(s.campaign.state, {
      characterId: caster.id,
      spellId: 'dragons-breath',
      slotLevel: 2,
      targetIds: [ally.id],
      ignorePreparation: true,
      casterChoice: { kind: 'variant', value: 'fire' },
    });
    const campaign = commit(s.campaign, cast.events);
    expect(() =>
      s.engine.plan.exhaleDragonsBreath(campaign.state, {
        characterId: ally.id,
        damageType: 'cold',
        targetIds: [victim.id],
      }),
    ).toThrow(/dragons-breath-cold-active/);
  });

  it('concentration drop sweeps the marker condition', () => {
    const caster = buildSorcerer();
    const ally = buildAlly();
    const victim = buildVictim();
    const s = seedThree(caster, ally, victim);
    const cast = s.engine.plan.castSpell(s.campaign.state, {
      characterId: caster.id,
      spellId: 'dragons-breath',
      slotLevel: 2,
      targetIds: [ally.id],
      ignorePreparation: true,
      casterChoice: { kind: 'variant', value: 'fire' },
    });
    let campaign = commit(s.campaign, cast.events);
    const concId = campaign.state.characters[caster.id]!.concentrationEffectId!;
    const broken: ConcentrationBrokenEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ConcentrationBroken',
      effectInstanceId: concId,
      casterId: caster.id,
      reason: 'voluntary',
    };
    campaign = commit(campaign, [broken]);
    expect(
      campaign.state.characters[ally.id]!.appliedConditions.some(
        (c) => c.conditionId === 'dragons-breath-fire-active',
      ),
    ).toBe(false);
  });
});
