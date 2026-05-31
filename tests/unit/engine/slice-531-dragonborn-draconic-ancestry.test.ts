// Slice 531: Dragonborn Draconic Ancestry choice + Damage Resistance.
//
// RAW (SRD 5.2.1 Dragonborn): "Draconic Ancestry. Your lineage stems
// from a dragon progenitor. Choose the kind of dragon from the
// Draconic Ancestors table. Your choice affects your Breath Weapon
// and Damage Resistance traits as well as your appearance. ...
// Damage Resistance. You have Resistance to the damage type
// determined by your Draconic Ancestry trait."
//
// Draconic Ancestors table (10 options):
//   Black / Copper -> Acid
//   Blue / Bronze -> Lightning
//   Brass / Gold / Red -> Fire
//   Silver / White -> Cold
//   Green -> Poison
//
// Pure content slice. Reuses OfferChoice + GrantResistance primitives.
// This slice wires the persistent always-on arm (resistance). The
// active arm (Breath Weapon: PB uses/long rest, 1d10+ area save)
// stays deferred to slice 532 -- it needs a character-side breath
// weapon planner since slice 140's BreathWeaponSpec is monster-only.
//
// Documented RAW deviations (deferred):
//   - Breath Weapon: deferred to slice 532 (needs new character-side
//     primitive with per-long-rest PB-uses tracking + level scaling).
//   - Draconic Flight (L5 feature): out of L1 scope.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newChoiceId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent, ChoiceResolvedEvent } from '../../../src/schemas/events/level-up.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { DamageType } from '../../../src/schemas/primitives.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const ANCESTRY_DAMAGE: ReadonlyArray<readonly [string, DamageType]> = [
  ['black', 'acid'],
  ['blue', 'lightning'],
  ['brass', 'fire'],
  ['bronze', 'lightning'],
  ['copper', 'acid'],
  ['gold', 'fire'],
  ['green', 'poison'],
  ['red', 'fire'],
  ['silver', 'cold'],
  ['white', 'cold'],
];

const buildDragonborn = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Drak',
    speciesId: 'dragonborn',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 12 },
    hp: { current: 12, max: 12, temp: 0 },
  });

const seedAncestryPick = (
  characterId: string,
  ancestryId: string,
  damageType: DamageType,
): [ChoiceRequiredEvent, ChoiceResolvedEvent] => {
  const choiceId = newChoiceId();
  return [
    {
      id: eventId(), at: isoTimestamp(), type: 'ChoiceRequired', choiceId,
      characterId, promptKey: 'dragonborn-draconic-ancestry', prompt: 'Pick an ancestor.',
      options: [{ id: ancestryId, label: ancestryId, effects: [{ kind: 'GrantResistance', damageType }] }],
      oneOf: 1,
    },
    {
      id: eventId(), at: isoTimestamp(), type: 'ChoiceResolved', choiceId,
      characterId, selectedOptionIds: [ancestryId],
    },
  ];
};

describe('Dragonborn Draconic Ancestry (slice 531)', () => {
  it('the dragonborn species ships Darkvision + the new OfferChoice trait', () => {
    const sp = PACK.species.find((s) => s.id === 'dragonborn')!;
    const kinds = sp.traits.map((t) => t.kind);
    expect(kinds).toContain('GrantSense');
    expect(kinds).toContain('OfferChoice');
    const offer = sp.traits.find((t) => t.kind === 'OfferChoice' && (t as { choiceId?: string }).choiceId === 'dragonborn-draconic-ancestry');
    expect(offer).toBeDefined();
  });

  it('the draconic-ancestry OfferChoice exposes all 10 dragon ancestries', () => {
    const sp = PACK.species.find((s) => s.id === 'dragonborn')!;
    const offer = sp.traits.find((t) => t.kind === 'OfferChoice' && (t as { choiceId?: string }).choiceId === 'dragonborn-draconic-ancestry')!;
    const ids = ((offer as { options: ReadonlyArray<{ id: string }> }).options).map((o) => o.id).sort();
    expect(ids).toEqual(['black', 'blue', 'brass', 'bronze', 'copper', 'gold', 'green', 'red', 'silver', 'white']);
  });

  it.each(ANCESTRY_DAMAGE)('ancestry %s grants Resistance to %s via the effect stack', (ancestryId, damageType) => {
    const dragonborn = buildDragonborn();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(531) });
    let campaign: Campaign = engine.createCampaign({ name: `ancestry-${ancestryId}` });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dragonborn } satisfies CharacterCreatedEvent,
      ...seedAncestryPick(dragonborn.id, ancestryId, damageType),
    ]);
    const acc = buildEffectStack({
      character: campaign.state.characters[dragonborn.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(acc.hasResistance(damageType)).toBe(true);
  });
});
