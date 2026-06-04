// Slice 492: Web Walker (Giant Spider / Drider / Ettercap) +
// source-tagged `restrained-by-web` condition.
//
// RAW (SRD 5.2.1 Web Walker): "The spider ignores movement restrictions
// caused by webs, and the spider knows the location of any other
// creature in contact with the same web." Three SRD users: Giant
// Spider, Drider, Ettercap.
//
// Engine: no engine change. The existing `conditionImmunities` array
// on MonsterStatblock auto-projects to GrantConditionImmunity effects
// (effect-stack.ts), and the existing isImmuneToCondition gate on the
// ConditionApplied reducer enforces immunity. The slice introduces a
// new source-tagged condition + retargets the Web spell at it; the
// three Web Walker monsters add the new id to their conditionImmunities
// array.
//
// Content additions:
//   - `restrained-by-web` condition: a direct copy of Restrained's
//     effects, with a distinct id so Web Walker creatures can carry an
//     immunity to it without being immune to Restrained from other
//     sources (Entangle, grapple, Ensnaring Strike).
//   - Web spell: conditionOnFail changed from `restrained` to
//     `restrained-by-web`.
//   - Giant Spider / Drider / Ettercap statblocks: conditionImmunities
//     gain `restrained-by-web`.
//
// The "knows the location of any other creature in contact with the
// same web" arm is deferred: the engine has no web-occupancy tracker
// and no per-creature web-membership graph. Documented as
// consumer-managed (the consumer can surface web positions via its own
// scene model; the engine isn't the source of truth for web maps).

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { isImmuneToCondition } from '../../../src/derive/condition-immunity.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildSpider = (statblockId: 'giant-spider' | 'drider' | 'ettercap'): Character => {
  const ability = statblockId === 'giant-spider'
    ? { STR: 14, DEX: 16, CON: 12, INT: 2, WIS: 11, CHA: 4 }
    : statblockId === 'drider'
      ? { STR: 16, DEX: 19, CON: 18, INT: 13, WIS: 16, CHA: 12 }
      : { STR: 14, DEX: 15, CON: 13, INT: 7, WIS: 12, CHA: 8 };
  return CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: statblockId,
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId,
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: ability,
    hp: { current: 26, max: 26, temp: 0 },
  });
};

const buildHero = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 8, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

describe('Web Walker + restrained-by-web (slice 492)', () => {
  it('restrained-by-web condition carries Restrained\'s effects (a direct copy)', () => {
    const c = PACK.conditions.find((cc) => cc.id === 'restrained-by-web');
    expect(c).toBeDefined();
    const restrained = PACK.conditions.find((cc) => cc.id === 'restrained');
    expect(c?.effects).toEqual(restrained?.effects);
  });

  it('Web spell points conditionOnFail at restrained-by-web (not generic restrained)', () => {
    const web = PACK.spells.find((s) => s.id === 'web');
    expect(web?.mechanicalEffects).toEqual([
      { kind: 'save', ability: 'DEX', conditionOnFail: 'restrained-by-web' },
    ]);
  });

  it.each(['giant-spider', 'drider', 'ettercap'] as const)(
    '%s statblock carries the Web Walker trait (GrantConditionImmunity restrained-by-web)',
    (statblockId) => {
      const m = PACK.monsters.find((mm) => mm.id === statblockId);
      expect(m?.traits).toContainEqual({ kind: 'GrantConditionImmunity', conditionId: 'restrained-by-web' });
    },
  );

  it.each(['giant-spider', 'drider', 'ettercap'] as const)(
    '%s is immune to restrained-by-web via isImmuneToCondition',
    (statblockId) => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const spider = buildSpider(statblockId);
      let campaign: Campaign = engine.createCampaign({ name: `imm-${statblockId}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: spider } satisfies CharacterCreatedEvent,
      ]);
      expect(isImmuneToCondition({
        state: campaign.state,
        content: CONTENT,
        targetId: spider.id,
        conditionId: 'restrained-by-web',
      })).toBe(true);
      // Sibling sanity: the same monster is NOT immune to generic Restrained
      // (which would block Entangle, grapples, Ensnaring Strike).
      expect(isImmuneToCondition({
        state: campaign.state,
        content: CONTENT,
        targetId: spider.id,
        conditionId: 'restrained',
      })).toBe(false);
    },
  );

  it('a hero (not a Web Walker) is NOT immune to restrained-by-web', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const hero = buildHero();
    let campaign: Campaign = engine.createCampaign({ name: 'hero-not-immune' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
    ]);
    expect(isImmuneToCondition({
      state: campaign.state,
      content: CONTENT,
      targetId: hero.id,
      conditionId: 'restrained-by-web',
    })).toBe(false);
  });
});
