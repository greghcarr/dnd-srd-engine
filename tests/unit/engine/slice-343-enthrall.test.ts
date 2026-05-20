// Slice 343 - Enthrall wired (content-only). RAW 2024: WIS save; on a
// failed save the target takes a -10 penalty to Wisdom (Perception)
// checks until the (concentration) spell ends. Wired as a save mechanic
// with conditionOnFail -> enthralled-active, which carries an
// AddModifier of -10 on Perception checks.
import { describe, expect, it } from 'vitest';
import { computeAbilityCheck } from '../../../src/derive/ability-check.js';
import { buildFighter } from '../../fixtures/index.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { Event } from '../../../src/schemas/events/index.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);
const ENTHRALL_PERCEPTION_PENALTY = 10;

const withEnthralled = (base: Character): Character => ({
  ...base,
  appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'enthralled-active' }],
});

describe('slice 343: Enthrall', () => {
  it('enthralled-active imposes a -10 penalty on Perception checks', () => {
    const base = buildFighter({ WIS: 14 });
    const plain = computeAbilityCheck({ character: base, itemInstances: {}, content: CONTENT, ability: 'WIS', skill: 'perception' });
    const enthralled = computeAbilityCheck({ character: withEnthralled(base), itemInstances: {}, content: CONTENT, ability: 'WIS', skill: 'perception' });
    expect(plain.total - enthralled.total).toBe(ENTHRALL_PERCEPTION_PENALTY);
  });

  it('does not affect non-Perception WIS skills (e.g. Insight)', () => {
    const base = buildFighter({ WIS: 14 });
    const plain = computeAbilityCheck({ character: base, itemInstances: {}, content: CONTENT, ability: 'WIS', skill: 'insight' });
    const enthralled = computeAbilityCheck({ character: withEnthralled(base), itemInstances: {}, content: CONTENT, ability: 'WIS', skill: 'insight' });
    expect(enthralled.total).toBe(plain.total);
  });

  it('casting emits a WIS save; a failed save applies enthralled-active', () => {
    const caster = CharacterSchema.parse({
      id: newCharacterId(), name: 'Bard', speciesId: 'human', backgroundId: 'entertainer',
      classes: [{ classId: 'bard', level: 5, hitDiceRemaining: 5 }],
      abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 18 },
      hp: { current: 33, max: 33, temp: 0 }, preparedSpells: ['enthrall'],
    });
    const target = CharacterSchema.parse({
      id: newCharacterId(), name: 'Foe', speciesId: 'human', backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 8, CHA: 10 },
      hp: { current: 20, max: 20, temp: 0 },
    });

    let sawSave = false;
    let sawApply = false;
    for (let seed = 1; seed < 60 && !sawApply; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      let campaign = engine.createCampaign({ name: `enthrall-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.castSpell(campaign.state, {
        characterId: caster.id, spellId: 'enthrall', slotLevel: 2, targetIds: [target.id],
      }).events as ReadonlyArray<Event>;
      const save = events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
      if (save !== undefined) {
        sawSave = true;
        expect(save.ability).toBe('WIS');
      }
      const applied = events.find(
        (e): e is ConditionAppliedEvent => e.type === 'ConditionApplied' && e.conditionId === 'enthralled-active',
      );
      if (save !== undefined && !save.success) {
        expect(applied, 'a failed save should apply enthralled-active').toBeDefined();
        sawApply = true;
      } else if (save?.success === true) {
        expect(applied, 'a successful save should not apply enthralled-active').toBeUndefined();
      }
    }
    expect(sawSave).toBe(true);
    expect(sawApply).toBe(true);
  });
});
