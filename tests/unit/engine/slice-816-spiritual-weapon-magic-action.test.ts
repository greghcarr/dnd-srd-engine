// Slice 816: fix `spiritual-weapon-immediate-attack-action-cost`.
//
// cast-spell.ts charges a Bonus-Action spell BOTH a Bonus Action AND an
// Action when you cast it at a target — modeling a spell whose ATTACK is a
// separate Magic action (RAW Produce Flame "take a Magic action to hurl
// fire"; Flame Blade "As a Magic action, you can make a melee spell
// attack"). Slice 603 keyed that on a `duration !== instantaneous`
// heuristic, which also caught Spiritual Weapon — but RAW Spiritual Weapon
// makes its attack IMMEDIATELY as part of the Bonus-Action cast, so it must
// cost no extra Action.
//
// The fix replaces the heuristic with an explicit per-attack
// `requiresMagicAction` flag (set on Produce Flame + Flame Blade, unset on
// Spiritual Weapon). This pins the resulting economy for both branches —
// and that it's class-agnostic (a PLAYER cleric, not just the monster the
// divergence was surfaced on).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ActionEconomyConsumedEvent } from '../../../src/schemas/events/action-economy.js';

const PACK = loadStarterPack();

const buildCaster = (classId: string, level: number, spells: string[]): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: `${classId}-${level}`,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId, level, hitDiceRemaining: level }],
    abilityScores: { STR: 10, DEX: 12, CON: 12, INT: 10, WIS: 16, CHA: 16 },
    hp: { current: 60, max: 60, temp: 0 },
    knownSpells: spells,
    preparedSpells: spells,
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Target',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 },
  });

// Seed an encounter with the caster active on its turn (mirrors slice 603).
const seedCasterVsTarget = (caster: Character, seed: number) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  const target = buildTarget();
  let campaign: Campaign = engine.createCampaign({ name: 'magic-action-econ' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  const enc = engine.plan.createEncounter(campaign.state, { combatantIds: [caster.id, target.id], name: 'arena' });
  campaign = commit(campaign, enc.events);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  while (
    campaign.state.encounters[enc.encounterId]!.combatants[
      campaign.state.encounters[enc.encounterId]!.activeIndex
    ]?.combatantId !== caster.id
  ) {
    campaign = commit(campaign, engine.plan.advanceTurn(campaign.state, { encounterId: enc.encounterId }).events);
  }
  return { engine, campaign, casterId: caster.id, targetId: target.id };
};

const economyKinds = (events: ReadonlyArray<{ type: string }>): string[] =>
  (events.filter((e) => e.type === 'ActionEconomyConsumed') as ActionEconomyConsumedEvent[])
    .map((e) => e.kind)
    .sort();

describe('slice 816: requiresMagicAction gates the implicit Action cost', () => {
  it('Spiritual Weapon (immediate attack) costs ONLY the Bonus Action — even for a player cleric', () => {
    const cleric = buildCaster('cleric', 5, ['spiritual-weapon']);
    const { engine, campaign, casterId, targetId } = seedCasterVsTarget(cleric, 8160);
    const { events } = engine.plan.castSpell(campaign.state, {
      characterId: casterId, spellId: 'spiritual-weapon', slotLevel: 2, targetIds: [targetId],
    });
    expect(economyKinds(events)).toEqual(['bonusAction']);
  });

  it('Flame Blade (separate Magic-action attack) still costs the Bonus Action AND the Action', () => {
    const druid = buildCaster('druid', 5, ['flame-blade']);
    const { engine, campaign, casterId, targetId } = seedCasterVsTarget(druid, 8161);
    const { events } = engine.plan.castSpell(campaign.state, {
      characterId: casterId, spellId: 'flame-blade', slotLevel: 2, targetIds: [targetId],
    });
    expect(economyKinds(events)).toEqual(['action', 'bonusAction']);
  });

  // The flag's inputs. Produce Flame / Flame Blade hurl via a separate
  // Magic action; Spiritual Weapon attacks immediately on cast.
  it('the requiresMagicAction flag is authored correctly', () => {
    const flag = (id: string): boolean | undefined => {
      const s = PACK.spells.find((x) => x.id === id);
      const atk = s?.mechanicalEffects.find((m) => m.kind === 'attack') as { requiresMagicAction?: boolean } | undefined;
      return atk?.requiresMagicAction;
    };
    expect(flag('produce-flame')).toBe(true);
    expect(flag('flame-blade')).toBe(true);
    expect(flag('spiritual-weapon')).toBeUndefined();
  });

  // Guard the heuristic -> flag switch: a future BA spell whose attack is a
  // separate Magic action must set the flag (the old `duration !==
  // instantaneous` heuristic would have caught it automatically). Any
  // BA-cast attack spell with a non-instantaneous duration that is NOT a
  // known immediate-attack-on-cast spell must carry requiresMagicAction.
  it('no BA-cast persistent attack spell silently lost the implicit-Action cost', () => {
    const immediateAttackOnCast = new Set(['spiritual-weapon']);
    const offenders = PACK.spells
      .filter((s) => s.castingTime.trim().toLowerCase() === 'bonus action')
      .filter((s) => s.duration.trim().toLowerCase() !== 'instantaneous')
      .filter((s) => s.mechanicalEffects.some((m) => m.kind === 'attack'))
      .filter((s) => !immediateAttackOnCast.has(s.id))
      .filter(
        (s) =>
          !s.mechanicalEffects.some(
            (m) => m.kind === 'attack' && (m as { requiresMagicAction?: boolean }).requiresMagicAction === true,
          ),
      )
      .map((s) => s.id);
    expect(offenders, `${offenders.join(', ')} need requiresMagicAction (or the immediate-attack allowlist)`).toEqual([]);
  });
});
