// Slice 542: Heroic Inspiration as a first-class resource.
//
// RAW (SRD 5.2.1 "Heroic Inspiration"): "When you have Heroic
// Inspiration, you can expend it to reroll any die immediately
// after rolling it, and you must use the new roll. You can have
// only one Heroic Inspiration at a time."
//
// Engine surface:
//   - Character field `heroicInspiration: boolean` (default false).
//   - New effect kind GrantHeroicInspirationOnLongRest (presence
//     marker); Human Resourceful now carries this rather than
//     the slice-537 narrative Custom marker.
//   - Two events: HeroicInspirationGranted + HeroicInspirationConsumed.
//   - Long-rest planner auto-emits HeroicInspirationGranted for
//     each participant whose effect stack carries the marker.
//   - planConsumeHeroicInspiration emits HeroicInspirationConsumed
//     (the reducer flips the boolean to false).
//
// Documented RAW deferral: the actual reroll integration (spend
// Inspiration, get a new d20) is consumer-managed. The consumer
// either re-plans the triggering roll with new RNG OR substitutes
// the new d20 into the prior event when displaying outcomes. A
// future slice can extend Halfling Luck's reroll helper to also
// check for Heroic Inspiration as a spend-on-natural-1 alternative.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildHuman = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Aria',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 5, max: 12, temp: 0 },
  });

const buildElf = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Aldra',
    speciesId: 'elf',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 16, WIS: 10, CHA: 10 },
    hp: { current: 6, max: 6, temp: 0 },
  });

describe('Heroic Inspiration primitive (slice 542)', () => {
  it("Human's Resourceful trait now uses the GrantHeroicInspirationOnLongRest effect kind", () => {
    const sp = PACK.species.find((s) => s.id === 'human')!;
    const trait = sp.traits.find((t) => t.kind === 'GrantHeroicInspirationOnLongRest');
    expect(trait).toBeDefined();
    // The slice-537 Custom marker should be gone.
    const oldMarker = sp.traits.find(
      (t) => t.kind === 'Custom' && (t as { handlerId?: string }).handlerId === 'human-resourceful',
    );
    expect(oldMarker).toBeUndefined();
  });

  it("a human's effect stack projects hasHeroicInspirationOnLongRest = true", () => {
    const human = buildHuman();
    const acc = buildEffectStack({
      character: human,
      content: CONTENT,
      itemInstances: {},
      pendingChoices: undefined,
    });
    expect(acc.hasHeroicInspirationOnLongRest()).toBe(true);
  });

  it("an elf's effect stack does NOT have the marker (control)", () => {
    const elf = buildElf();
    const acc = buildEffectStack({
      character: elf,
      content: CONTENT,
      itemInstances: {},
      pendingChoices: undefined,
    });
    expect(acc.hasHeroicInspirationOnLongRest()).toBe(false);
  });

  it("planLongRest auto-emits HeroicInspirationGranted for participants with the marker", () => {
    const human = buildHuman();
    const elf = buildElf();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(542) });
    let camp: Campaign = engine.createCampaign({ name: 'rest' });
    camp = commit(camp, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: human } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: elf } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.longRest(camp.state, {
      participantIds: [human.id, elf.id],
    }).events;
    const granted = events.filter((e) => e.type === 'HeroicInspirationGranted');
    expect(granted).toHaveLength(1);
    expect((granted[0] as { characterId: string }).characterId).toBe(human.id);
  });

  it("after committing the long rest, the human's heroicInspiration flag flips to true", () => {
    const human = buildHuman();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(543) });
    let camp: Campaign = engine.createCampaign({ name: 'flip' });
    camp = commit(camp, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: human } satisfies CharacterCreatedEvent,
    ]);
    expect(camp.state.characters[human.id]!.heroicInspiration).toBe(false);
    camp = commit(camp, engine.plan.longRest(camp.state, { participantIds: [human.id] }).events);
    expect(camp.state.characters[human.id]!.heroicInspiration).toBe(true);
  });

  it("planConsumeHeroicInspiration emits HeroicInspirationConsumed and flips the flag back to false", () => {
    const human = buildHuman();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(544) });
    let camp: Campaign = engine.createCampaign({ name: 'consume' });
    camp = commit(camp, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: human } satisfies CharacterCreatedEvent,
    ]);
    camp = commit(camp, engine.plan.longRest(camp.state, { participantIds: [human.id] }).events);
    expect(camp.state.characters[human.id]!.heroicInspiration).toBe(true);
    const consumeEvents = engine.plan.consumeHeroicInspiration(camp.state, {
      characterId: human.id,
      appliedTo: 'attack',
    }).events;
    expect(consumeEvents).toHaveLength(1);
    expect(consumeEvents[0]!.type).toBe('HeroicInspirationConsumed');
    camp = commit(camp, consumeEvents);
    expect(camp.state.characters[human.id]!.heroicInspiration).toBe(false);
  });

  it("throws when consuming Inspiration the character doesn't have", () => {
    const elf = buildElf();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(545) });
    let camp: Campaign = engine.createCampaign({ name: 'no-inspiration' });
    camp = commit(camp, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: elf } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.consumeHeroicInspiration(camp.state, { characterId: elf.id }),
    ).toThrow(/no Heroic Inspiration to spend/i);
  });

  it("re-granting Inspiration while already true is idempotent (RAW: only one at a time)", () => {
    const human = buildHuman();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(546) });
    let camp: Campaign = engine.createCampaign({ name: 'idem' });
    camp = commit(camp, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: human } satisfies CharacterCreatedEvent,
    ]);
    camp = commit(camp, engine.plan.longRest(camp.state, { participantIds: [human.id] }).events);
    expect(camp.state.characters[human.id]!.heroicInspiration).toBe(true);
    // Second long rest: the grant fires again but the flag stays true.
    camp = commit(camp, engine.plan.longRest(camp.state, { participantIds: [human.id] }).events);
    expect(camp.state.characters[human.id]!.heroicInspiration).toBe(true);
  });
});
