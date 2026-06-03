// Golden scenario: slices 601 + 602 in a multi-turn battle.
//
// Two casters (Druid + Wizard) trade Fire Bolts after the Druid drops
// Faerie Fire on the Wizard. The transcript chain exercises:
//   - slice 602: Druid's Fire Bolt at the Faerie Fire'd Wizard rolls
//     with [advantage] (target-side GrantAdvantageToAttackers via
//     spell-attack path).
//   - slice 601: every DamageApplied to the Druid (still concentrating
//     on Faerie Fire) auto-rolls a CON save vs DC max(10, half).
//   - slice 611: spell attacks now route through resolveAttackRoll;
//     this scenario incidentally pins that the path still produces
//     the right hit/miss/crit semantics in a real chain.
//
// Pre-slice the user-review of 15 fuzz transcripts (slice-600 audit)
// surfaced "spell attacks against Faerie Fire'd targets don't get
// advantage" and "concentrating casters take damage with no CON save"
// as the two highest-impact RAW deviations. This golden test pins
// both behaviors against snapshot drift in one chain.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/index.js';
import { seededRNG } from '../../src/rng/seeded.js';
import { commit } from '../../src/engine/commit.js';
import { loadStarterPack } from '../../src/starter-pack.js';
import {
  buildFighter,
  eventId,
  isoTimestamp,
} from '../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../src/schemas/events/attack.js';
import type { SaveRolledEvent } from '../../src/schemas/events/checks.js';

const STARTER = loadStarterPack();

const buildCaster = (opts: { name: string; classId: 'druid' | 'wizard'; abilityKey: 'WIS' | 'INT' }) => {
  const base = buildFighter({ name: opts.name, hpMax: 80, hpCurrent: 80 });
  return {
    ...base,
    speciesId: 'human',
    knownSpells: ['fire-bolt', 'faerie-fire'],
    preparedSpells: ['fire-bolt', 'faerie-fire'],
    classes: [{ classId: opts.classId, level: 3, hitDiceRemaining: 3 }],
    abilityScores: { ...base.abilityScores, [opts.abilityKey]: 16 },
  };
};

describe('golden: slices 601 + 602 chain in a multi-turn spell battle', () => {
  it('Druid Faerie Fires Wizard → Druid casts Fire Bolt → Wizard fails DEX save → spell attack rolls with [advantage]; Wizard casts Fire Bolt → Druid takes damage → CON save fires', () => {
    // Sweep seeds to find one where:
    //   - Wizard fails the FF DEX save (Faerie Fired condition applied)
    //   - Druid's subsequent Fire Bolt has used='advantage' on the event
    //   - Wizard's Fire Bolt deals damage > 0
    //   - The slice-601 CON save fires after the damage
    for (let seed = 0; seed < 200; seed += 1) {
      const rng = seededRNG(seed);
      const engine = createEngine({ contentPacks: [STARTER], rng });
      const druid = buildCaster({ name: 'Aria', classId: 'druid', abilityKey: 'WIS' });
      const wizard = buildCaster({ name: 'Bran', classId: 'wizard', abilityKey: 'INT' });
      let campaign = engine.createCampaign({ name: 's31' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: druid } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
      ]);

      // T1 — Druid casts Faerie Fire on Wizard (concentration).
      let result;
      try {
        result = engine.plan.castSpell(campaign.state, {
          characterId: druid.id,
          spellId: 'faerie-fire',
          slotLevel: 1,
          targetIds: [wizard.id],
        });
      } catch {
        continue;
      }
      campaign = commit(campaign, result.events);
      const ffSave = result.events.find(
        (e): e is SaveRolledEvent => e.type === 'SaveRolled' && e.ability === 'DEX',
      );
      if (!ffSave || ffSave.success) continue;
      // Wizard now Faerie Fired; Druid concentrating on FF.
      expect(campaign.state.characters[wizard.id]?.appliedConditions.some((c) => c.conditionId === 'faerie-fired')).toBe(true);
      expect(campaign.state.characters[druid.id]?.concentrationEffectId).toBeDefined();

      // T2 — Druid casts Fire Bolt at Wizard (spell attack against FF'd target).
      const druidFB = engine.plan.castSpell(campaign.state, {
        characterId: druid.id,
        spellId: 'fire-bolt',
        slotLevel: 0,
        targetIds: [wizard.id],
      });
      const druidAttack = druidFB.events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      expect(druidAttack).toBeDefined();
      // SLICE 602 ASSERTION: Druid's spell attack against the Faerie-
      // Fire'd Wizard rolls with advantage.
      expect(druidAttack?.used).toBe('advantage');
      expect(druidAttack?.d20.length).toBeGreaterThanOrEqual(2);
      campaign = commit(campaign, druidFB.events);

      // T3 — Wizard retaliates with Fire Bolt at Druid (Druid is
      // concentrating; damage triggers CON save).
      const wizardFB = engine.plan.castSpell(campaign.state, {
        characterId: wizard.id,
        spellId: 'fire-bolt',
        slotLevel: 0,
        targetIds: [druid.id],
      });
      const wizardAttack = wizardFB.events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      if (!wizardAttack || !wizardAttack.hit) continue;
      const conSave = wizardFB.events.find(
        (e): e is SaveRolledEvent => e.type === 'SaveRolled' && e.ability === 'CON',
      );
      // SLICE 601 ASSERTION: damage to the concentrating Druid fires a
      // CON save.
      expect(conSave).toBeDefined();
      // Druid isn't Faerie Fired (only the Wizard is). So this attack
      // should NOT have advantage.
      expect(wizardAttack.used).toBe('none');
      return; // success — both assertions verified in one chain.
    }
    throw new Error('No seed produced both branches (FF save fail + Druid hit + Wizard hit) in 200 tries');
  });
});
