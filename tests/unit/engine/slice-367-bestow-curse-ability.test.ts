// Slice 367 - Bestow Curse "ability disadvantage" arm is now mechanically wired.
//
// Bug (logged in the slice-361 empty-effect-condition sweep): Bestow
// Curse's "choose one ability score; the target has Disadvantage on
// checks and saves made with that ability" arm applied a single
// `cursed-ability-active` condition with empty effects, because the flat
// casterChoosesVariant primitive couldn't carry the chosen ability. Fix:
// the variant fans out to six per-ability keys
// (ability-disadvantage-str ... -cha), each applying a
// `cursed-ability-<ab>-active` condition that imposes Disadvantage on
// that ability's checks AND saves via per-ability SetAdvantage (the same
// shape held-paralyzed-active uses for its auto-fail saves). Verified
// here through the ability-check / saving-throw derivations.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { computeAbilityCheck } from '../../../src/derive/ability-check.js';
import { computeSavingThrow } from '../../../src/derive/save.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildPlain = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 12, WIS: 12, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
  });

// Applies cursed-ability-str-active to the victim via the reducer and
// returns the post-commit state + the derive context.
const cursedWithStr = () => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  const caster = buildPlain('Curser');
  const victim = buildPlain('Victim');
  let campaign: Campaign = engine.createCampaign({ name: 'curse' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
  ]);
  campaign = commit(campaign, [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ConditionApplied',
      targetId: victim.id,
      conditionId: 'cursed-ability-str-active',
      appliedConditionId: newAppliedConditionId(),
      sourceCharacterId: caster.id,
    } satisfies ConditionAppliedEvent,
  ]);
  return { engine, state: campaign.state, victimId: victim.id };
};

describe('slice 367: Bestow Curse ability-disadvantage arm', () => {
  it('imposes Disadvantage on the chosen ability\'s checks and saves only', () => {
    const { state, victimId } = cursedWithStr();
    const victim = state.characters[victimId]!;
    const ctx = { character: victim, itemInstances: state.itemInstances, content: PACK_CONTENT(), characters: state.characters } as const;

    const strCheck = computeAbilityCheck({ ...ctx, ability: 'STR' });
    const strSave = computeSavingThrow({ ...ctx, ability: 'STR' });
    const dexCheck = computeAbilityCheck({ ...ctx, ability: 'DEX' });
    const dexSave = computeSavingThrow({ ...ctx, ability: 'DEX' });

    expect(strCheck.hasDisadvantage).toBe(true);
    expect(strSave.hasDisadvantage).toBe(true);
    // The curse is ability-scoped: other abilities are unaffected.
    expect(dexCheck.hasDisadvantage).toBe(false);
    expect(dexSave.hasDisadvantage).toBe(false);
  });

  it('routes each per-ability variant key to its own condition on a failed save', () => {
    // Cast the spell with the WIS variant and confirm the WIS-specific
    // condition lands (the broader per-variant table lives in
    // plan-cast-spell-bestow-curse.test.ts).
    for (let seed = 1; seed < 200; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const caster = CharacterSchema.parse({
        id: newCharacterId(), name: 'Hexer', speciesId: 'human', backgroundId: 'sage',
        classes: [{ classId: 'wizard', level: 9, hitDiceRemaining: 9 }],
        abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 18, WIS: 12, CHA: 10 },
        hp: { current: 40, max: 40, temp: 0 }, preparedSpells: ['bestow-curse'],
      });
      const victim = buildPlain('Mark');
      let campaign: Campaign = engine.createCampaign({ name: `bc-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.castSpell(campaign.state, {
        characterId: caster.id, spellId: 'bestow-curse', slotLevel: 3, targetIds: [victim.id],
        casterChoice: { kind: 'variant', value: 'ability-disadvantage-wis' },
      }).events;
      const applied = events.find((e) => e.type === 'ConditionApplied') as ConditionAppliedEvent | undefined;
      if (applied === undefined) continue;
      expect(applied.conditionId).toBe('cursed-ability-wis-active');
      return;
    }
    throw new Error('no seed produced a failed WIS save');
  });
});

// PACK is a parsed pack object; the engine resolves it. The derive
// functions need ResolvedContent, which the engine exposes.
function PACK_CONTENT() {
  return createEngine({ contentPacks: [PACK], rng: seededRNG(1) }).content;
}
