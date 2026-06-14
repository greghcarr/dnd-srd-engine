// Slice 852 — `l4-banishment`.
//
// RAW (SRD 5.2.1 Banishment): "One creature that you can see within range must
// succeed on a Charisma saving throw or be transported to a harmless
// demiplane for the duration. While there, the target has the Incapacitated
// condition. When the spell ends, the target reappears in the space it left."
// Concentration, up to 1 minute.
//
// The spell shipped with `mechanicalEffects: []` — a cast did nothing. This
// slice wires it: a `{ kind: 'save', ability: 'CHA', conditionOnFail:
// 'banished-active' }` mechanic, and a new `banished-active` condition. RAW's
// only mechanical hook is the Incapacitated condition, so `banished-active`
// carries `effects: []` and the action-block comes from being added to
// ACTION_BLOCKING_CONDITIONS (the same engine-coded path held-paralyzed-active
// / sleep-drowsy-active use). Because Banishment concentrates, the failed-save
// condition is stamped with the concentration effect id, so it lifts when the
// caster's Concentration ends (the target returns).
//
// Deferred (consumer/positional/narrative): the demiplane removal itself (the
// banished creature can't be targeted — the engine models only the
// Incapacitated), the reappear-placement, the Aberration/Celestial/Elemental/
// Fey/Fiend "doesn't return after 1 minute" arm (no plane model), and the
// upcast "+1 target per slot" (targeting seam).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { findActorBlockingCondition, ACTION_BLOCKING_CONDITIONS } from '../../../src/engine/plan/_actor-state.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const PACK = loadStarterPack();
const spell = () => PACK.spells.find((s) => s.id === 'banishment')!;
const banished = () => PACK.conditions?.find((c) => c.id === 'banished-active')!;

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Gand-alf',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 7, hitDiceRemaining: 7 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
    preparedSpells: ['banishment', 'enlarge-reduce'],
  });

// A Rogue has no CHA-save proficiency. CHA 4 (−3) → 7 vs DC 15 fails on the
// seed-1 d20 (10); CHA 20 (+5) → 15 succeeds.
const buildTarget = (cha: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: `Imp-${cha}`,
    speciesId: 'human',
    backgroundId: 'criminal',
    classes: [{ classId: 'rogue', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 12, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: cha },
    hp: { current: 24, max: 24, temp: 0 },
  });

const seedCampaign = (wizard: Character, target: Character) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'banish-guard' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

describe('slice 852: Banishment — CHA save → Incapacitated (concentration-bound)', () => {
  it('is a concentration CHA save applying banished-active on a failure', () => {
    const save = spell().mechanicalEffects.find((m) => m.kind === 'save') as {
      ability?: string;
      conditionOnFail?: string;
    };
    expect(save.ability).toBe('CHA');
    expect(save.conditionOnFail).toBe('banished-active');
    expect(spell().concentration).toBe(true);
  });

  it('banished-active is action-blocking (effects: [], engine-coded) with a 1-minute cap', () => {
    const c = banished() as { effects: unknown[]; autoExpiry?: { afterRounds: number; trigger: string } };
    // The RAW-stated Incapacitated is engine-coded (ACTION_BLOCKING_CONDITIONS),
    // not in the effects array — the same path sleep-drowsy-active uses.
    expect(c.effects).toEqual([]);
    expect(c.autoExpiry).toEqual({ afterRounds: 10, trigger: 'turnEnd' });
    expect(ACTION_BLOCKING_CONDITIONS.has('banished-active')).toBe(true);
  });

  it('a failed CHA save banishes the target (Incapacitated) and binds it to the caster’s Concentration', () => {
    const wizard = buildWizard();
    const foe = buildTarget(4);
    const { engine, campaign } = seedCampaign(wizard, foe);
    const res = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'banishment',
      slotLevel: 4,
      targetIds: [foe.id],
    });
    const save = res.events.find((e) => e.type === 'SaveRolled');
    expect((save as { ability: string }).ability).toBe('CHA');
    expect((save as { success: boolean }).success).toBe(false);
    const applied = res.events.find((e) => e.type === 'ConditionApplied');
    expect(applied?.conditionId).toBe('banished-active');
    // Concentration-bound (lifts when the spell ends).
    expect((applied as { sourceEffectInstanceId?: string }).sourceEffectInstanceId).toBeDefined();
    expect(res.events.some((e) => e.type === 'ConcentrationStarted')).toBe(true);

    const after = commit(campaign, res.events);
    expect(findActorBlockingCondition(after.state.characters[foe.id]!)).toBe('banished-active');
  });

  it('a successful CHA save leaves the target unaffected', () => {
    const wizard = buildWizard();
    const foe = buildTarget(20);
    const { engine, campaign } = seedCampaign(wizard, foe);
    const res = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'banishment',
      slotLevel: 4,
      targetIds: [foe.id],
    });
    expect((res.events.find((e) => e.type === 'SaveRolled') as { success: boolean }).success).toBe(true);
    expect(res.events.some((e) => e.type === 'ConditionApplied')).toBe(false);
  });

  it('the banishment lifts when the caster’s Concentration ends (the target returns)', () => {
    const wizard = buildWizard();
    const foe = buildTarget(4);
    const { engine, campaign } = seedCampaign(wizard, foe);
    const banishedState = commit(
      campaign,
      engine.plan.castSpell(campaign.state, {
        characterId: wizard.id,
        spellId: 'banishment',
        slotLevel: 4,
        targetIds: [foe.id],
      }).events,
    );
    expect(banishedState.state.characters[foe.id]!.appliedConditions.some((c) => c.conditionId === 'banished-active')).toBe(true);

    // Casting a second Concentration spell drops Banishment → the target returns.
    const returned = commit(
      banishedState,
      engine.plan.castSpell(banishedState.state, {
        characterId: wizard.id,
        spellId: 'enlarge-reduce',
        slotLevel: 2,
        targetIds: [wizard.id],
        casterChoice: { kind: 'variant', value: 'enlarge' },
      }).events,
    );
    expect(returned.state.characters[foe.id]!.appliedConditions.some((c) => c.conditionId === 'banished-active')).toBe(false);
  });
});
