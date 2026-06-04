// Slice 603: a BA-cast spell with an attack mechanic and non-
// instantaneous duration (Produce Flame canonical, future Spiritual
// Weapon) now consumes BOTH a Bonus Action AND an Action when the
// caster targets a creature. Pre-slice the engine collapsed cast+hurl
// into the BA, giving casters a free spell-attack alongside their
// full Action.
//
// RAW (SRD 5.2.1 Produce Flame): castingTime: Bonus Action; "Until the
// spell ends, you can take a Magic action to hurl fire at a creature."
// The hurl is a separate Action; the engine simulates "cast + hurl in
// one turn" so both economy slots are consumed.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/starter-pack.js';
import {
  buildFighter,
  eventId,
  isoTimestamp,
} from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  ActionEconomyConsumedEvent,
} from '../../../src/schemas/events/action-economy.js';

const STARTER = loadStarterPack();

const seedDruidVsTarget = (opts: { seed: number; targetActionUsed?: boolean }) => {
  const rng = seededRNG(opts.seed);
  const engine = createEngine({ contentPacks: [STARTER], rng });
  const caster = buildFighter({ name: 'Caster' });
  const casterWithSpell = {
    ...caster,
    knownSpells: ['produce-flame'],
    preparedSpells: ['produce-flame'],
    classes: [{ classId: 'druid', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { ...caster.abilityScores, WIS: 16 },
  };
  const target = buildFighter({ name: 'Target', hpMax: 200, hpCurrent: 200 });
  let campaign = engine.createCampaign({ name: 'pf-econ' });
  campaign = commit(campaign, [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: casterWithSpell,
    } satisfies CharacterCreatedEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: target,
    } satisfies CharacterCreatedEvent,
  ]);
  // Push into an active encounter so action economy is enforced.
  const enc = engine.plan.createEncounter(campaign.state, {
    combatantIds: [casterWithSpell.id, target.id],
    name: 'arena',
  });
  campaign = commit(campaign, enc.events);
  campaign = commit(
    campaign,
    engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events,
  );
  campaign = commit(
    campaign,
    engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events,
  );
  campaign = commit(
    campaign,
    engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events,
  );
  // Make the caster the active combatant so they can cast on their turn.
  const enc1 = campaign.state.encounters[enc.encounterId]!;
  const activeId = enc1.combatants[enc1.activeIndex]?.combatantId;
  if (activeId !== casterWithSpell.id) {
    // Advance turns until the caster is up.
    while (campaign.state.encounters[enc.encounterId]?.combatants[
      campaign.state.encounters[enc.encounterId]!.activeIndex
    ]?.combatantId !== casterWithSpell.id) {
      campaign = commit(
        campaign,
        engine.plan.advanceTurn(campaign.state, { encounterId: enc.encounterId }).events,
      );
    }
  }
  // Optionally pre-mark the caster's Action as used to test the
  // rejection path.
  if (opts.targetActionUsed) {
    campaign = commit(campaign, [
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'ActionEconomyConsumed',
        encounterId: enc.encounterId,
        combatantId: casterWithSpell.id,
        kind: 'action',
      } satisfies ActionEconomyConsumedEvent,
    ]);
  }
  return {
    engine,
    campaign,
    casterId: casterWithSpell.id,
    targetId: target.id,
    encounterId: enc.encounterId,
  };
};

describe('slice 603: Produce Flame cast+hurl consumes BA + Action', () => {
  it('emits BOTH ActionEconomyConsumed{bonusAction} AND {action} when hurling on cast', () => {
    const { engine, campaign, casterId, targetId } = seedDruidVsTarget({ seed: 7 });
    const { events } = engine.plan.castSpell(campaign.state, {
      characterId: casterId,
      spellId: 'produce-flame',
      slotLevel: 0,
      targetIds: [targetId],
    });
    const economy = events.filter(
      (e): e is ActionEconomyConsumedEvent => e.type === 'ActionEconomyConsumed',
    );
    expect(economy.length).toBe(2);
    const kinds = economy.map((e) => e.kind).sort();
    expect(kinds).toEqual(['action', 'bonusAction']);
  });

  it('rejects the cast when the caster has already used their Action this turn', () => {
    const { engine, campaign, casterId, targetId } = seedDruidVsTarget({
      seed: 11,
      targetActionUsed: true,
    });
    expect(() =>
      engine.plan.castSpell(campaign.state, {
        characterId: casterId,
        spellId: 'produce-flame',
        slotLevel: 0,
        targetIds: [targetId],
      }),
    ).toThrow(/action already used/i);
  });

  it('consumes ONLY the BA when cast without targets (light-only cast)', () => {
    const { engine, campaign, casterId } = seedDruidVsTarget({ seed: 13 });
    const { events } = engine.plan.castSpell(campaign.state, {
      characterId: casterId,
      spellId: 'produce-flame',
      slotLevel: 0,
      targetIds: [],
    });
    const economy = events.filter(
      (e): e is ActionEconomyConsumedEvent => e.type === 'ActionEconomyConsumed',
    );
    expect(economy.length).toBe(1);
    expect(economy[0]?.kind).toBe('bonusAction');
  });
});
