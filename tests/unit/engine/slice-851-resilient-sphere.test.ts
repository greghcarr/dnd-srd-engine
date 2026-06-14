// Slice 851 — `l4-resilient-sphere`.
//
// RAW (SRD 5.2.1 Resilient Sphere): "A shimmering sphere encloses a Large or
// smaller creature or object within range. An unwilling creature must succeed
// on a Dexterity saving throw or be enclosed for the duration. ... The sphere
// is immune to all damage, and a creature or object inside can't be damaged by
// attacks or effects originating from outside, nor can a creature inside the
// sphere damage anything outside it." Concentration, up to 1 minute.
//
// The spell shipped with `mechanicalEffects: []` — a cast did nothing. This
// slice wires it as content, reusing two shipped primitives:
//   - the slice-849 unwilling-save-on-buff (a `buff` mechanic with
//     `unwillingSave { ability: 'DEX' }`): a willing target is enclosed with
//     no save; an unwilling target (named by the consumer in
//     `intent.unwillingTargetIds`) rolls a DEX save vs the caster's spell DC
//     and is enclosed only on a failure;
//   - `GrantImmunity { damageType: 'all' }` on the new
//     `resilient-sphere-enclosed` condition — the testable combat arm: the
//     trapped creature takes 0 from any damage source.
// Concentration ties the condition to the caster (the buff mechanic threads it
// onto ConcentrationStarted); autoExpiry { 10 rounds } caps the 1 minute.
//
// Deferred (positional / narrative, consumer-owned): the reciprocal "can't
// damage anything outside" arm, the seal vs incoming non-damage effects, the
// roll-at-half-speed movement, and the Disintegrate special case.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { mitigateDamage } from '../../../src/derive/damage-mitigation.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);
const spell = () => PACK.spells.find((s) => s.id === 'resilient-sphere')!;
const enclosed = () => PACK.conditions?.find((c) => c.id === 'resilient-sphere-enclosed')!;

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Tasha',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 7, hitDiceRemaining: 7 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
    preparedSpells: ['resilient-sphere'],
  });

// A Rogue has DEX-save proficiency (+2 at L3). DEX 4 (−3) → +(−1) → 9 vs DC 15
// fails on the seed-1 d20 (10); DEX 20 (+5) → +7 → 17 succeeds.
const buildTarget = (dex: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: `Foe-${dex}`,
    speciesId: 'human',
    backgroundId: 'criminal',
    classes: [{ classId: 'rogue', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 12, DEX: dex, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 24, max: 24, temp: 0 },
  });

const seedCampaign = (wizard: Character, target: Character) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'sphere-guard' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

describe('slice 851: Resilient Sphere encloses (DEX save if unwilling) + total damage immunity', () => {
  it('the spell is a concentration buff applying resilient-sphere-enclosed with a DEX unwillingSave', () => {
    const buff = spell().mechanicalEffects.find((m) => m.kind === 'buff') as {
      conditionId?: string;
      unwillingSave?: { ability?: string };
    };
    expect(buff.conditionId).toBe('resilient-sphere-enclosed');
    expect(buff.unwillingSave?.ability).toBe('DEX');
    expect(spell().concentration).toBe(true);
  });

  it('the enclosed condition grants immunity to all damage + a 1-minute cap', () => {
    const c = enclosed() as {
      effects: { kind: string; damageType?: string }[];
      autoExpiry?: { afterRounds: number; trigger: string };
    };
    expect(c.effects.some((e) => e.kind === 'GrantImmunity' && e.damageType === 'all')).toBe(true);
    expect(c.autoExpiry).toEqual({ afterRounds: 10, trigger: 'turnEnd' });
  });

  it('a willing target is enclosed with no save, and the caster concentrates', () => {
    const wizard = buildWizard();
    const ally = buildTarget(10);
    const { engine, campaign } = seedCampaign(wizard, ally);
    const res = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'resilient-sphere',
      slotLevel: 4,
      targetIds: [ally.id],
      // no unwillingTargetIds → willing → no save
    });
    expect(res.events.some((e) => e.type === 'SaveRolled')).toBe(false);
    expect(res.events.some((e) => e.type === 'ConditionApplied' && e.conditionId === 'resilient-sphere-enclosed')).toBe(true);
    expect(res.events.some((e) => e.type === 'ConcentrationStarted')).toBe(true);
  });

  it('the enclosed creature takes 0 from every damage type (immune)', () => {
    const wizard = buildWizard();
    const ally = buildTarget(10);
    const { engine, campaign } = seedCampaign(wizard, ally);
    const after = commit(
      campaign,
      engine.plan.castSpell(campaign.state, {
        characterId: wizard.id,
        spellId: 'resilient-sphere',
        slotLevel: 4,
        targetIds: [ally.id],
      }).events,
    );
    const target = after.state.characters[ally.id]!;
    const fire = mitigateDamage({
      character: target,
      itemInstances: after.state.itemInstances,
      content: CONTENT,
      rawComponents: [{ amount: 18, type: 'fire' }],
      sourceIsMagical: true,
    });
    const slashing = mitigateDamage({
      character: target,
      itemInstances: after.state.itemInstances,
      content: CONTENT,
      rawComponents: [{ amount: 12, type: 'slashing' }],
    });
    expect(fire[0]).toMatchObject({ amount: 0, mitigation: 'immune' });
    expect(slashing[0]).toMatchObject({ amount: 0, mitigation: 'immune' });
  });

  it('an unwilling target that FAILS the DEX save is enclosed', () => {
    const wizard = buildWizard();
    const foe = buildTarget(4); // fails the DC 15 save on the seed-1 d20
    const { engine, campaign } = seedCampaign(wizard, foe);
    const res = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'resilient-sphere',
      slotLevel: 4,
      targetIds: [foe.id],
      unwillingTargetIds: [foe.id],
    });
    const save = res.events.find((e) => e.type === 'SaveRolled');
    expect((save as { ability: string }).ability).toBe('DEX');
    expect((save as { success: boolean }).success).toBe(false);
    expect(res.events.some((e) => e.type === 'ConditionApplied' && e.conditionId === 'resilient-sphere-enclosed')).toBe(true);
  });

  it('an unwilling target that SUCCEEDS on the DEX save is not enclosed', () => {
    const wizard = buildWizard();
    const foe = buildTarget(20); // succeeds on the seed-1 d20
    const { engine, campaign } = seedCampaign(wizard, foe);
    const res = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'resilient-sphere',
      slotLevel: 4,
      targetIds: [foe.id],
      unwillingTargetIds: [foe.id],
    });
    expect((res.events.find((e) => e.type === 'SaveRolled') as { success: boolean }).success).toBe(true);
    expect(res.events.some((e) => e.type === 'ConditionApplied')).toBe(false);
  });
});
