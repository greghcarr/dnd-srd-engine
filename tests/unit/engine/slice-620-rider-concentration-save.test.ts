// Slice 620: OnEvent AddDamage riders (Hex, Hunter's Mark, Divine
// Smite, Searing Smite, etc.) emit their own DamageApplied via the
// trigger-dispatch path. Slice 601 wired concentration saves to the
// MAIN damage-emission sites (cast-spell, attack, etc.) but missed
// the rider path in `fireAddDamage`. The L1 fuzz review found this:
// a Hex rider hitting a concentrating creature didn't trigger the
// per-damage-source CON save RAW requires.
//
// RAW (PHB 2024 Concentration): "If you take damage from multiple
// sources, such as an arrow and a dragon's breath, you make a
// separate saving throw for each source of damage." Each rider is a
// separate source.

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
import {
  newAppliedConditionId,
  newEffectInstanceId,
} from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConcentrationStartedEvent } from '../../../src/schemas/events/concentration.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';

const STARTER = loadStarterPack();

describe('slice 620: trigger-dispatched rider damage triggers concentration save on a concentrating target', () => {
  it('Hex rider DamageApplied on a concentrating target emits a CON save', () => {
    // Sweep seeds to find one where a warlock with Hex on a
    // concentrating fighter hits with Eldritch Blast. The rider
    // damage should trigger a separate CON save on top of the main
    // damage's CON save.
    for (let seed = 0; seed < 200; seed += 1) {
      const rng = seededRNG(seed);
      const engine = createEngine({ contentPacks: [STARTER], rng });
      const warlock = {
        ...buildFighter({ name: 'Warlock' }),
        knownSpells: ['eldritch-blast', 'hex'],
        preparedSpells: ['eldritch-blast', 'hex'],
        classes: [{ classId: 'warlock', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 10, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 16 },
      };
      const target = buildFighter({ name: 'Concentrator', hpMax: 200, hpCurrent: 200 });
      let campaign = engine.createCampaign({ name: 'rider-conc' });
      const concEffectId = newEffectInstanceId();
      campaign = commit(campaign, [
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: warlock,
        } satisfies CharacterCreatedEvent,
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: target,
        } satisfies CharacterCreatedEvent,
        // Target is concentrating on Bless (an unrelated spell — Hex is on the
        // warlock's side as the rider source, Bless is what the target
        // is concentrating on so any damage triggers a CON save).
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'ConcentrationStarted',
          effectInstanceId: concEffectId,
          casterId: target.id,
          spellId: 'bless',
          targetIds: [target.id],
          conditionsApplied: [
            {
              targetId: target.id,
              conditionId: 'blessed',
              appliedConditionId: newAppliedConditionId(),
            },
          ],
        } satisfies ConcentrationStartedEvent,
      ]);

      // Warlock casts Hex (BA), then Eldritch Blast (Action).
      let hexResult;
      try {
        hexResult = engine.plan.castSpell(campaign.state, {
          characterId: warlock.id,
          spellId: 'hex',
          slotLevel: 1,
          targetIds: [target.id],
          casterChoice: { kind: 'variant', value: 'STR' },
        });
      } catch {
        continue;
      }
      campaign = commit(campaign, hexResult.events);

      const ebResult = engine.plan.castSpell(campaign.state, {
        characterId: warlock.id,
        spellId: 'eldritch-blast',
        slotLevel: 0,
        targetIds: [target.id],
      });
      // Need at least one DamageApplied (the EB hit) and the rider's
      // DamageApplied. Each should trigger its own CON save.
      const damageApplieds = ebResult.events.filter(
        (e): e is DamageAppliedEvent => e.type === 'DamageApplied',
      );
      if (damageApplieds.length < 2) continue; // hit didn't land, or rider didn't trigger
      const conSaves = ebResult.events.filter(
        (e): e is SaveRolledEvent => e.type === 'SaveRolled' && e.ability === 'CON',
      );
      // EXPECTATION: rider damage triggers a CON save. Pre-slice-620
      // it didn't. Slice 621 also gates the main-damage save on
      // concentration still being active, so if the rider's save
      // already broke conc the main damage no longer rolls a redundant
      // save. We want at least one save (proving the rider wired the
      // helper), with the upper bound at damageApplieds.length (one
      // per source). Find a seed where the rider's save SUCCEEDED so
      // the main damage's save still fires too, confirming both paths
      // wire the helper.
      if (conSaves.length !== damageApplieds.length) continue;
      expect(conSaves.length).toBe(damageApplieds.length);
      return;
    }
    throw new Error('No seed produced a Hex-on-concentrating-target chain in 200 tries');
  });
});
