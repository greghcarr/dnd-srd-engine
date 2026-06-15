// Slice 871 — Aura of Life (L4) + the `recurringHeal` primitive. Closes the
// L7 audit Area-2 row `l4-aura-of-life` ("30-ft emanation: necrotic resistance
// + 0-HP allies regain 1 HP; no aura").
//
// RAW (SRD 5.2.1 Aura of Life, Cleric/Paladin): "An aura radiates from you in
// a 30-foot Emanation for the duration. While in the aura, you and your allies
// have Resistance to Necrotic damage, and your Hit Point maximums can't be
// reduced. If an ally with 0 Hit Points starts its turn in the aura, that ally
// regains 1 Hit Point." (Concentration, up to 10 minutes.)
//
// Wiring: a `buff` mechanic applies the new `aura-of-life-active` condition
// (concentration-bound, so it clears when the caster's Concentration ends);
// the consumer manages aura membership (the positional emanation). The
// condition carries `GrantResistance{necrotic}` + the new `recurringHeal`
// primitive ({ amount: 1, turnStart, onlyAtZeroHp }), the heal mirror of
// `recurringDamage`, ticked by `engine.plan.tickRecurringHeal`. Deferred: the
// "Hit Point maximum can't be reduced" arm (no prevent-max-HP-reduction effect
// yet).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { mitigateDamage } from '../../../src/derive/damage-mitigation.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent, HealedEvent } from '../../../src/schemas/events/combat.js';
import type { ConcentrationStartedEvent } from '../../../src/schemas/events/concentration.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildCleric = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Cleric',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level: 7, hitDiceRemaining: 7 }],
    abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 18, CHA: 10 },
    hp: { current: 45, max: 45, temp: 0 },
    preparedSpells: ['aura-of-life'],
  });

// An ally carrying the aura-of-life-active condition. `hpCurrent` lets a test
// stage a downed (0 HP) bearer for the revive arm.
const buildAlly = (name: string, hpCurrent: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: hpCurrent, max: 28, temp: 0 },
    appliedConditions: [
      { id: newAppliedConditionId(), conditionId: 'aura-of-life-active', appliedAt: isoTimestamp() },
    ],
  });

const seedParty = (engine: ReturnType<typeof createEngine>, name: string, ...party: Character[]): Campaign => {
  let campaign = engine.createCampaign({ name });
  campaign = commit(
    campaign,
    party.map((c) => ({
      id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c,
    }) satisfies CharacterCreatedEvent),
  );
  return campaign;
};

describe('Aura of Life + recurringHeal (slice 871)', () => {
  it('wires a buff applying aura-of-life-active; the condition carries necrotic resistance + the revive', () => {
    const mech = PACK.spells.find((s) => s.id === 'aura-of-life')?.mechanicalEffects?.[0] as
      | { kind: string; conditionId?: string }
      | undefined;
    expect(mech?.kind).toBe('buff');
    expect(mech?.conditionId).toBe('aura-of-life-active');
    const cond = CONTENT.conditions.get('aura-of-life-active');
    expect(cond?.effects).toContainEqual({ kind: 'GrantResistance', damageType: 'necrotic' });
    expect(cond?.recurringHeal).toEqual({ amount: 1, trigger: 'turnStart', onlyAtZeroHp: true });
  });

  it('a cast applies aura-of-life-active to the chosen creatures, concentration-bound', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const cleric = buildCleric();
    const ally = buildAlly('Ally', 28);
    const campaign = seedParty(engine, 'aol-cast', cleric, ally);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: cleric.id,
      spellId: 'aura-of-life',
      slotLevel: 4,
      targetIds: [cleric.id, ally.id],
    }).events;
    const applied = events.filter(
      (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'aura-of-life-active',
    ) as ConditionAppliedEvent[];
    expect(applied.map((a) => a.targetId).sort()).toEqual([cleric.id, ally.id].sort());
    // Concentration binding: the buff conditions are tracked on the
    // ConcentrationStarted event's conditionsApplied, so they clear when the
    // caster's Concentration ends (clearConcentrationEffect sweeps that list).
    const conc = events.find((e) => e.type === 'ConcentrationStarted') as ConcentrationStartedEvent | undefined;
    expect(conc, 'aura-of-life is a concentration spell').toBeDefined();
    expect(
      conc!.conditionsApplied.filter((c) => c.conditionId === 'aura-of-life-active').length,
    ).toBe(2);
  });

  it('the aura grants Necrotic Resistance (a necrotic hit on a bearer is halved)', () => {
    const bearer = buildAlly('Bearer', 28);
    const mitigated = mitigateDamage({
      character: bearer,
      itemInstances: {},
      content: CONTENT,
      rawComponents: [{ amount: 10, type: 'necrotic' }],
      characters: { [bearer.id]: bearer },
      sourceIsMagical: true,
    });
    expect(mitigated.find((c) => c.type === 'necrotic')?.amount).toBe(5);
    // A non-necrotic type is unaffected by the aura.
    const fire = mitigateDamage({
      character: bearer,
      itemInstances: {},
      content: CONTENT,
      rawComponents: [{ amount: 10, type: 'fire' }],
      characters: { [bearer.id]: bearer },
      sourceIsMagical: true,
    });
    expect(fire.find((c) => c.type === 'fire')?.amount).toBe(10);
  });

  it('tickRecurringHeal revives a 0-HP bearer by 1 HP; a conscious bearer is a no-op', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const downed = buildAlly('Downed', 0);
    const standing = buildAlly('Standing', 12);
    let campaign = seedParty(engine, 'aol-heal', downed, standing);

    const tickDowned = engine.plan.tickRecurringHeal(campaign.state, {
      targetId: downed.id,
      conditionId: 'aura-of-life-active',
    }).events;
    const healed = tickDowned.find((e) => e.type === 'Healed') as HealedEvent | undefined;
    expect(healed, 'a downed bearer is revived').toBeDefined();
    expect(healed?.amount).toBe(1);
    campaign = commit(campaign, tickDowned);
    expect(campaign.state.characters[downed.id]!.hp.current).toBe(1);

    // A bearer above 0 HP gets nothing (the onlyAtZeroHp gate).
    const tickStanding = engine.plan.tickRecurringHeal(campaign.state, {
      targetId: standing.id,
      conditionId: 'aura-of-life-active',
    }).events;
    expect(tickStanding.length).toBe(0);
  });
});
