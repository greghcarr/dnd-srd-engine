// Slice 350 - Path of the Berserker L14 Intimidating Presence.
//
// RAW 2024: As a Bonus Action, each creature of your choice in a 30-ft
// emanation makes a Wisdom save (DC 8 + STR mod + Proficiency Bonus); on
// a failure it has the Frightened condition. Wired as a dedicated
// combat planner reusing the shared `rollSaveAgainstDC` helper + the
// bare `frightened` condition. The end-of-turn repeat save (needs a
// feature-DC recurring-save path), the 1-minute duration, and the
// once-per-Long-Rest use (rage-restorable) are deferred / consumer-side.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { ActionEconomyConsumedEvent } from '../../../src/schemas/events/action-economy.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
// STR 18 (mod +4) + Proficiency Bonus 5 (level 14) + 8 = DC 17.
const EXPECTED_DC = 17;

const buildBarbarian = (level: number, subclass: string | null): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Grok',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'barbarian', level, hitDiceRemaining: level, ...(subclass !== null ? { subclassId: subclass } : {}) }],
    abilityScores: { STR: 18, DEX: 14, CON: 16, INT: 8, WIS: 10, CHA: 8 },
    hp: { current: 140, max: 140, temp: 0 },
  });

const buildFoe = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 8, CHA: 10 },
    hp: { current: 20, max: 20, temp: 0 },
  });

interface Scene {
  engine: ReturnType<typeof createEngine>;
  campaign: Campaign;
  barbarianId: string;
  foeIds: string[];
}

const seedScene = (seed = 1, barbarian = buildBarbarian(14, 'path-of-the-berserker')): Scene => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  const foeA = buildFoe('Foe A');
  const foeB = buildFoe('Foe B');
  let campaign: Campaign = engine.createCampaign({ name: `intimidate-${seed}` });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: barbarian } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: foeA } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: foeB } satisfies CharacterCreatedEvent,
  ]);
  const created = engine.plan.createEncounter(campaign.state, { combatantIds: [barbarian.id, foeA.id, foeB.id] });
  campaign = commit(campaign, created.events);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: created.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: created.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: created.encounterId }).events);
  for (let i = 0; i < 4; i++) {
    const enc = campaign.state.encounters[created.encounterId]!;
    if (enc.combatants[enc.activeIndex]?.combatantId === barbarian.id) break;
    campaign = commit(campaign, engine.plan.advanceTurn(campaign.state, { encounterId: created.encounterId }).events);
  }
  return { engine, campaign, barbarianId: barbarian.id, foeIds: [foeA.id, foeB.id] };
};

describe('slice 350: Intimidating Presence', () => {
  it('consumes a bonus action and rolls a WIS save (DC 8 + STR + PB) per target; failures are Frightened', () => {
    const s = seedScene(1);
    const { events } = s.engine.plan.intimidatingPresence(s.campaign.state, {
      barbarianId: s.barbarianId,
      targetIds: s.foeIds,
    });
    expect(events.some((e): e is ActionEconomyConsumedEvent => e.type === 'ActionEconomyConsumed' && e.kind === 'bonusAction')).toBe(true);
    const saves = events.filter((e): e is SaveRolledEvent => e.type === 'SaveRolled');
    expect(saves).toHaveLength(2);
    const frightenedTargets = new Set(
      events
        .filter((e): e is ConditionAppliedEvent => e.type === 'ConditionApplied' && e.conditionId === 'frightened')
        .map((e) => e.targetId),
    );
    for (const save of saves) {
      expect(save.ability).toBe('WIS');
      expect(save.dc).toBe(EXPECTED_DC);
      // A failed save applies Frightened to that target; a success does not.
      expect(frightenedTargets.has(save.targetId)).toBe(!save.success);
    }
  });

  it('rejects a barbarian without Path of the Berserker at level 14', () => {
    const s = seedScene(1, buildBarbarian(13, 'path-of-the-berserker'));
    expect(() =>
      s.engine.plan.intimidatingPresence(s.campaign.state, { barbarianId: s.barbarianId, targetIds: s.foeIds }),
    ).toThrow(/Intimidating Presence/);
  });
});
