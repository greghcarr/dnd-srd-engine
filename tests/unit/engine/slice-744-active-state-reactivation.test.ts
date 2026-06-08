// Slice 744: pattern fix — activators that apply a persistent self
// "active-state" condition (and spend a limited resource) must not be
// re-activated while that state is already active. Found by the slice-743
// pattern hunt (Rage was the reported case). Each planner now throws when
// its active condition is already present, preventing a double resource
// spend. Byte-identical for the fuzz (each buff is taken at most once per
// battle).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { ULID } from '../../../src/engine/ids-utils.js';

const PACK = loadStarterPack();

const build = (overrides: Partial<Character>): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'PC',
    speciesId: 'human',
    backgroundId: 'soldier',
    abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 12, WIS: 14, CHA: 16 },
    hp: { current: 40, max: 40, temp: 0 },
    ...overrides,
  });

const seed = (c: Character, conditionId?: string): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(744) });
  let campaign = engine.createCampaign({ name: 'reactivation' });
  const events: (CharacterCreatedEvent | ConditionAppliedEvent)[] = [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c },
  ];
  if (conditionId !== undefined) {
    events.push({
      id: eventId(), at: isoTimestamp(), type: 'ConditionApplied',
      targetId: c.id as ULID, conditionId, appliedConditionId: newAppliedConditionId(),
    });
  }
  campaign = commit(campaign, events);
  return { engine, campaign };
};

describe('slice 744: no re-activation while active', () => {
  it('Innate Sorcery: throws when innate-sorcery-active; activates otherwise', () => {
    const sorc = build({ classes: [{ classId: 'sorcerer', level: 1, hitDiceRemaining: 1 }], resources: [{ resourceId: 'innate-sorcery', current: 2, max: 2 }] });
    const ok = seed(sorc);
    expect(ok.engine.plan.innateSorcery(ok.campaign.state, { characterId: sorc.id }).events
      .some((e) => e.type === 'ConditionApplied')).toBe(true);
    const active = seed(sorc, 'innate-sorcery-active');
    expect(() => active.engine.plan.innateSorcery(active.campaign.state, { characterId: sorc.id })).toThrow(/already has Innate Sorcery/i);
  });

  it('Superior Defense: throws when superior-defense-active; activates otherwise', () => {
    const monk = build({ classes: [{ classId: 'monk', level: 18, hitDiceRemaining: 18 }], resources: [{ resourceId: 'ki', current: 5, max: 5 }] });
    const ok = seed(monk);
    expect(ok.engine.plan.superiorDefense(ok.campaign.state, { monkId: monk.id }).events
      .some((e) => e.type === 'ConditionApplied')).toBe(true);
    const active = seed(monk, 'superior-defense-active');
    expect(() => active.engine.plan.superiorDefense(active.campaign.state, { monkId: monk.id })).toThrow(/already has Superior Defense/i);
  });

  it('Sacred Weapon: throws when sacred-weapon-active; activates otherwise', () => {
    const pal = build({ classes: [{ classId: 'paladin', level: 3, hitDiceRemaining: 3, subclassId: 'oath-of-devotion' }], resources: [{ resourceId: 'channel-divinity', current: 2, max: 2 }] });
    const ok = seed(pal);
    expect(ok.engine.plan.sacredWeapon(ok.campaign.state, { paladinId: pal.id }).events
      .some((e) => e.type === 'ConditionApplied')).toBe(true);
    const active = seed(pal, 'sacred-weapon-active');
    expect(() => active.engine.plan.sacredWeapon(active.campaign.state, { paladinId: pal.id })).toThrow(/already has Sacred Weapon/i);
  });

  it('Frenzy: throws when frenzied; activates otherwise', () => {
    const barb = build({ classes: [{ classId: 'barbarian', level: 3, hitDiceRemaining: 3, subclassId: 'path-of-the-berserker' }], resources: [{ resourceId: 'rage', current: 2, max: 2 }] });
    const ok = seed(barb);
    expect(ok.engine.plan.frenzy(ok.campaign.state, { combatantId: barb.id }).events
      .some((e) => e.type === 'ConditionApplied')).toBe(true);
    const active = seed(barb, 'frenzied');
    expect(() => active.engine.plan.frenzy(active.campaign.state, { combatantId: barb.id })).toThrow(/already frenzied/i);
  });

  it('Dragon Wings: throws when dragon-wings-active; activates otherwise', () => {
    const sorc = build({ classes: [{ classId: 'sorcerer', level: 14, hitDiceRemaining: 14, subclassId: 'draconic-sorcery' }] });
    const ok = seed(sorc);
    expect(ok.engine.plan.dragonWings(ok.campaign.state, { sorcererId: sorc.id }).events
      .some((e) => e.type === 'ConditionApplied')).toBe(true);
    const active = seed(sorc, 'dragon-wings-active');
    expect(() => active.engine.plan.dragonWings(active.campaign.state, { sorcererId: sorc.id })).toThrow(/already has Dragon Wings/i);
  });

  it('Stonecunning: throws already-active when stonecunning-active (guard precedes other gates)', () => {
    const dwarf = build({ speciesId: 'dwarf', classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }], resources: [{ resourceId: 'stonecunning', current: 2, max: 2 }] });
    // Without the condition, the planner rejects for a DIFFERENT reason
    // (no active encounter) — proving the already-active guard is gated on
    // the condition, not unconditional.
    const notActive = seed(dwarf);
    expect(() => notActive.engine.plan.stonecunning(notActive.campaign.state, { dwarfId: dwarf.id, onStoneSurface: true })).toThrow(/active encounter/i);
    const active = seed(dwarf, 'stonecunning-active');
    expect(() => active.engine.plan.stonecunning(active.campaign.state, { dwarfId: dwarf.id, onStoneSurface: true })).toThrow(/already has Stonecunning/i);
  });
});
