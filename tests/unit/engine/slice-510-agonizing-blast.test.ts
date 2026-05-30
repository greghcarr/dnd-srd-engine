// Slice 510: Warlock L1 Eldritch Invocations choice mechanism +
// Agonizing Blast as the canonical first invocation.
//
// RAW (SRD 5.2.1 Eldritch Invocations, L1): "You gain one invocation of
// your choice."
// RAW (Agonizing Blast invocation): "Choose one of your known Warlock
// cantrips that deals damage. You can add your Charisma modifier to
// that spell's damage rolls."
//
// Engine surface: the L1 `eldritch-invocations-2` feature ships an
// `OfferChoice oneOf: 1` whose first option is Agonizing Blast, with
// inline effects `AddModifier target:'damage' value:abilityMod-CHA
// condition: eq event.spellId 'eldritch-blast'`. Slice 510 also added
// `event.spellId` to the cast-spell damage facts (both attack and save
// paths) so any per-spell damage rider can gate on it.
//
// Documented RAW deviation (this first ship): the invocation is wired
// statically to Eldritch Blast. RAW lets the warlock pick any known
// Warlock damage cantrip; modeling that would need an inner sub-choice
// inside the invocation option. Deferred. Eldritch Blast is the canonical
// pick (the only Warlock-class-listed damage cantrip in the pack), so
// the deviation rarely matters in practice.

import { describe, expect, it } from 'vitest';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newChoiceId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent, ChoiceResolvedEvent } from '../../../src/schemas/events/level-up.js';
import type { DamageRolledEvent } from '../../../src/schemas/events/attack.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildWarlock = (cha: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Vex',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'warlock', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: cha },
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

const seedAgonizingBlast = (characterId: string): [ChoiceRequiredEvent, ChoiceResolvedEvent] => {
  const choiceId = newChoiceId();
  return [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ChoiceRequired',
      choiceId,
      characterId,
      promptKey: 'eldritch-invocations-l1',
      prompt: 'Pick an invocation.',
      options: [
        {
          id: 'agonizing-blast',
          label: 'Agonizing Blast',
          effects: [
            {
              kind: 'AddModifier',
              target: 'damage',
              value: { kind: 'abilityMod', ability: 'CHA' },
              condition: { kind: 'eq', path: 'event.spellId', value: 'eldritch-blast' },
            },
          ],
        },
      ],
      oneOf: 1,
    },
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ChoiceResolved',
      choiceId,
      characterId,
      selectedOptionIds: ['agonizing-blast'],
    },
  ];
};

describe('Warlock L1 Eldritch Invocations + Agonizing Blast (slice 510)', () => {
  it('the L1 eldritch-invocations feature ships an OfferChoice with Agonizing Blast as the first option', () => {
    const w = PACK.classes.find((c) => c.id === 'warlock')!;
    const feat = w.levelTable['1']!.features.find((f) => f.id === 'eldritch-invocations-2')!;
    expect(feat.effects).toHaveLength(1);
    const oc = feat.effects[0] as { kind: string; oneOf: number; options: ReadonlyArray<{ id: string }> };
    expect(oc.kind).toBe('OfferChoice');
    expect(oc.oneOf).toBe(1);
    expect(oc.options[0]!.id).toBe('agonizing-blast');
  });

  it('a Warlock who picks Agonizing Blast deals +CHA-mod extra damage on each Eldritch Blast beam', () => {
    const warlock = buildWarlock(18); // CHA 18 -> +4
    // Sanity: the effect stack folds in the AddModifier on damage when
    // event.spellId == 'eldritch-blast' (computed independent of seed).
    {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(510) });
      let campaign: Campaign = engine.createCampaign({ name: 'sanity' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
        ...seedAgonizingBlast(warlock.id),
      ]);
      const acc = buildEffectStack({
        character: campaign.state.characters[warlock.id]!,
        content: CONTENT,
        itemInstances: campaign.state.itemInstances,
        pendingChoices: campaign.state.pendingChoices,
      });
      const facts = new Map<string, unknown>([['event.spellId', 'eldritch-blast']]);
      expect(acc.modifierSum('damage', facts)).toBe(4);
      const otherFacts = new Map<string, unknown>([['event.spellId', 'fire-bolt']]);
      expect(acc.modifierSum('damage', otherFacts)).toBe(0);
    }
    // End-to-end: cast Eldritch Blast and find a seed where the attack
    // hits, then assert the DamageRolled modifier reflects the +4 CHA-mod
    // fold. Eldritch Blast has no native ability-mod on damage, so the
    // modifier with Agonizing Blast on is just +CHA-mod (+4).
    for (let seed = 1; seed < 40; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const target = buildTarget();
      let campaign: Campaign = engine.createCampaign({ name: `ab-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
        ...seedAgonizingBlast(warlock.id),
      ]);
      const events = engine.plan.castSpell(campaign.state, {
        characterId: warlock.id,
        spellId: 'eldritch-blast',
        slotLevel: 0,
        targetIds: [target.id],
      }).events;
      const dmg = events.find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
      if (dmg === undefined) continue;
      expect(dmg.rolls[0]!.modifier).toBe(4);
      return;
    }
    throw new Error('no hit across 40 seeds');
  });

  it('a Warlock who has NOT picked Agonizing Blast deals no extra damage on Eldritch Blast', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(511) });
    const warlock = buildWarlock(18);
    const target = buildTarget();
    let campaign: Campaign = engine.createCampaign({ name: 'no-ab' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      // No ChoiceResolved -> the invocation is not picked.
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: warlock.id,
      spellId: 'eldritch-blast',
      slotLevel: 0,
      targetIds: [target.id],
    }).events;
    const dmg = events.find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
    expect(dmg).toBeDefined();
    expect(dmg!.rolls[0]!.modifier).toBe(0);
  });

  it('Agonizing Blast does NOT add CHA-mod to other damage cantrips (gated on spellId)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(512) });
    const warlock = CharacterSchema.parse({
      id: newCharacterId(), name: 'Vex', speciesId: 'human', backgroundId: 'sage',
      classes: [{ classId: 'warlock', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 18 },
      hp: { current: 8, max: 8, temp: 0 },
      knownSpells: ['fire-bolt'],
      preparedSpells: ['fire-bolt'],
    });
    const target = buildTarget();
    let campaign: Campaign = engine.createCampaign({ name: 'fb' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ...seedAgonizingBlast(warlock.id),
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: warlock.id,
      spellId: 'fire-bolt',
      slotLevel: 0,
      targetIds: [target.id],
    }).events;
    const dmg = events.find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
    expect(dmg!.rolls[0]!.modifier).toBe(0); // No +CHA on fire-bolt
  });
});
