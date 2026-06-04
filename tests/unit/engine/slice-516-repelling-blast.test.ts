// Slice 516: Repelling Blast invocation + `PushTarget` TriggerAction +
// `event.source` DamageApplied fact.
//
// RAW (Repelling Blast invocation): "When you hit a creature with
// Eldritch Blast, you can push that creature up to 10 feet away from
// you in a straight line."
//
// Engine extensions:
//   - New `PushTarget { distanceFeet }` TriggerAction (effects.ts) +
//     dispatcher branch (triggers/dispatch.ts) that emits
//     `CreaturePushed targetId: <event.targetId> distanceFeet`. The
//     engine doesn't model positions; the event is informational for
//     consumers to apply the position change.
//   - `event.source` fact added to DamageApplied trigger facts (already
//     set on the event by cast-spell for spell damage). Surfaces the
//     spell id so per-spell predicates can gate on it. Canonical user
//     here: Repelling Blast's `eq event.source 'eldritch-blast'`.
//
// The OnEvent fires on DamageApplied (not AttackRolled) so we can reuse
// the existing event.sourceIsSelf + event.source facts; firing post-
// damage instead of post-hit is RAW-equivalent for the push outcome
// (RAW doesn't specify damage-vs-push ordering).

import { describe, expect, it } from 'vitest';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newChoiceId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent, ChoiceResolvedEvent } from '../../../src/schemas/events/level-up.js';
import type { CreaturePushedEvent } from '../../../src/schemas/events/combat.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildWarlock = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Vex',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'warlock', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 18 },
    hp: { current: 8, max: 8, temp: 0 },
    knownSpells: ['eldritch-blast'],
    preparedSpells: ['eldritch-blast'],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Dummy',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 100, max: 100, temp: 0 },
    armorClass: 5,
  });

const seedInvocationPick = (characterId: string, featId: string): [ChoiceRequiredEvent, ChoiceResolvedEvent] => {
  const choiceId = newChoiceId();
  return [
    {
      id: eventId(), at: isoTimestamp(), type: 'ChoiceRequired', choiceId,
      characterId, promptKey: 'eldritch-invocations-l1', prompt: 'Pick an invocation.',
      options: [{ id: featId, label: featId, effects: [{ kind: 'GrantFeat', featId }] }],
      oneOf: 1,
    },
    {
      id: eventId(), at: isoTimestamp(), type: 'ChoiceResolved', choiceId,
      characterId, selectedOptionIds: [featId],
    },
  ];
};

describe('Repelling Blast invocation (slice 516)', () => {
  it('ships the repelling-blast invocation with the OnEvent DamageApplied trigger gated on Eldritch Blast', () => {
    const feat = PACK.feats.find((f) => f.id === 'repelling-blast');
    expect(feat).toBeDefined();
    expect(feat!.category).toBe('invocation');
    const onEvent = feat!.effects[0] as { kind: string; trigger: { eventType: string; filter: unknown }; actions: ReadonlyArray<{ kind: string; distanceFeet?: number }> };
    expect(onEvent.kind).toBe('OnEvent');
    expect(onEvent.trigger.eventType).toBe('DamageApplied');
    expect(onEvent.actions).toEqual([{ kind: 'PushTarget', distanceFeet: 10 }]);
  });

  it('a Warlock with Repelling Blast: hitting a target with Eldritch Blast emits CreaturePushed (10 ft)', () => {
    // Loop seeds to find a hit (similar to slice-510's pattern).
    const warlock = buildWarlock();
    for (let seed = 1; seed < 40; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const target = buildTarget();
      let campaign: Campaign = engine.createCampaign({ name: `rb-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
        ...seedInvocationPick(warlock.id, 'repelling-blast'),
      ]);
      const events = engine.plan.castSpell(campaign.state, {
        characterId: warlock.id,
        spellId: 'eldritch-blast',
        slotLevel: 0,
        targetIds: [target.id],
      }).events;
      const pushed = events.find((e) => e.type === 'CreaturePushed') as CreaturePushedEvent | undefined;
      const damaged = events.find((e) => e.type === 'DamageApplied');
      if (damaged === undefined) continue; // attack missed; no DamageApplied
      expect(pushed).toBeDefined();
      expect(pushed!.targetId).toBe(target.id);
      expect(pushed!.distanceFeet).toBe(10);
      expect(pushed!.sourceCharacterId).toBe(warlock.id);
      return;
    }
    throw new Error('no hit across 40 seeds');
  });

  it('a Warlock WITHOUT Repelling Blast does NOT push on Eldritch Blast hits', () => {
    const warlock = buildWarlock();
    for (let seed = 1; seed < 40; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const target = buildTarget();
      let campaign: Campaign = engine.createCampaign({ name: `no-rb-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
        // No invocation picked.
      ]);
      const events = engine.plan.castSpell(campaign.state, {
        characterId: warlock.id,
        spellId: 'eldritch-blast',
        slotLevel: 0,
        targetIds: [target.id],
      }).events;
      if (!events.some((e) => e.type === 'DamageApplied')) continue;
      expect(events.some((e) => e.type === 'CreaturePushed')).toBe(false);
      return;
    }
    throw new Error('no hit across 40 seeds');
  });

  it('Repelling Blast does NOT fire for other damage cantrips (gated on event.source == eldritch-blast)', () => {
    // A warlock with Repelling Blast casting fire-bolt should NOT push.
    const warlock = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Vex', speciesId: 'human', backgroundId: 'sage',
      classes: [{ classId: 'warlock', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 18 },
      hp: { current: 8, max: 8, temp: 0 },
      knownSpells: ['fire-bolt'],
      preparedSpells: ['fire-bolt'],
    });
    for (let seed = 1; seed < 40; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const target = buildTarget();
      let campaign: Campaign = engine.createCampaign({ name: `rb-fb-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
        ...seedInvocationPick(warlock.id, 'repelling-blast'),
      ]);
      const events = engine.plan.castSpell(campaign.state, {
        characterId: warlock.id,
        spellId: 'fire-bolt',
        slotLevel: 0,
        targetIds: [target.id],
      }).events;
      if (!events.some((e) => e.type === 'DamageApplied')) continue;
      // Hit happened, but the source is fire-bolt, not eldritch-blast.
      expect(events.some((e) => e.type === 'CreaturePushed')).toBe(false);
      return;
    }
    throw new Error('no hit across 40 seeds');
  });
});
