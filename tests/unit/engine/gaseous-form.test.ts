// Slice 287 — Gaseous Form spell wired through existing primitives.
//
// RAW (SRD 5.2.1): "A willing creature you touch shape-shifts...
// into a misty cloud for the duration. While in this form, the
// target's only method of movement is a Fly Speed of 10 feet, and
// it can hover. The target can enter and occupy the space of
// another creature. The target has Resistance to Bludgeoning,
// Piercing, and Slashing damage; it has Immunity to the Prone
// condition; and it has Advantage on Strength, Dexterity, and
// Constitution saving throws. The target can pass through narrow
// openings, but it treats liquids as though they were solid
// surfaces."
//
// Pre-287 the spell shipped `mechanicalEffects: []`. This slice
// adds the `gaseous-form-active` condition wired through existing
// primitives (OverrideACFormula, GrantResistance, GrantConditionImmunity,
// SetAdvantage) and routes the spell through the slice-73 buff
// mechanic. RAW deviations carried forward: fly speed is
// declarative (slice 263's finding: 0 consumers read non-walk
// ModifySpeed); can't-speak / can't-cast / can't-attack /
// can't-manipulate clauses are consumer-managed; "spell ends on
// 0 HP" is consumer-managed.
//
// Alter Self (the gap row's sibling deferral) stays deferred: its
// Aquatic Adaptation arm needs non-walk speed derives; Natural
// Weapons needs unarmed-strike attack replacement; Change
// Appearance is pure narrative.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import { isImmuneToCondition } from '../../../src/derive/condition-immunity.js';
import { computeAC } from '../../../src/derive/ac.js';
import { computeSavingThrow } from '../../../src/derive/save.js';
import { mitigateDamage } from '../../../src/derive/damage-mitigation.js';
import { collectEffectsFromCharacter } from '../../../src/derive/effect-stack.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { SpellCastDeclaredEvent } from '../../../src/schemas/events/spellcasting.js';
import type { ConcentrationStartedEvent } from '../../../src/schemas/events/concentration.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Caster',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 12, CON: 14, INT: 16, WIS: 12, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
    preparedSpells: ['gaseous-form'],
    spellSlots: { 1: { used: 0, max: 4 }, 2: { used: 0, max: 3 }, 3: { used: 0, max: 2 } },
  });

const buildPaladin = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Paladin',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'paladin', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 14 },
    hp: { current: 44, max: 44, temp: 0 },
  });

const applyGaseousForm = (targetId: string): ConditionAppliedEvent => ({
  id: eventId(),
  at: isoTimestamp(),
  type: 'ConditionApplied',
  targetId: targetId as never,
  conditionId: 'gaseous-form-active',
  appliedConditionId: newAppliedConditionId(),
});

describe('slice 287: Gaseous Form spell wired', () => {
  it('casting Gaseous Form on a touched ally emits SpellCastDeclared + ConcentrationStarted + ConditionApplied', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(287) });
    const caster = buildWizard();
    const ally = buildPaladin();
    let campaign: Campaign = engine.createCampaign({ name: 'gaseous-form-cast' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.castSpell(campaign.state, {
      characterId: caster.id,
      spellId: 'gaseous-form',
      slotLevel: 3,
      targetIds: [ally.id],
    });
    const declared = events.find((e) => e.type === 'SpellCastDeclared') as SpellCastDeclaredEvent | undefined;
    const concentration = events.find((e) => e.type === 'ConcentrationStarted') as ConcentrationStartedEvent | undefined;
    const condApplied = events.find(
      (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'gaseous-form-active',
    ) as ConditionAppliedEvent | undefined;
    expect(declared).toBeDefined();
    expect(declared!.spellId).toBe('gaseous-form');
    expect(concentration).toBeDefined();
    expect(condApplied).toBeDefined();
    expect(condApplied!.targetId).toBe(ally.id);
    expect(condApplied!.sourceCharacterId).toBe(caster.id);
  });

  describe('effects on a creature in gaseous form', () => {
    const seed = (paladin: Character) => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(287) });
      let campaign: Campaign = engine.createCampaign({ name: 'gaseous-effects' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: paladin } satisfies CharacterCreatedEvent,
        applyGaseousForm(paladin.id),
      ]);
      return campaign.state.characters[paladin.id]!;
    };

    it('AC becomes 11 regardless of armor', () => {
      const paladin = buildPaladin();
      const bearer = seed(paladin);
      const ac = computeAC({
        character: bearer,
        itemInstances: {},
        content: CONTENT,
      });
      expect(ac.total).toBe(11);
    });

    it('resistant to bludgeoning, piercing, and slashing damage', () => {
      const paladin = buildPaladin();
      const bearer = seed(paladin);
      for (const type of ['bludgeoning', 'piercing', 'slashing'] as const) {
        const mitigated = mitigateDamage({
          character: bearer,
          itemInstances: {},
          content: CONTENT,
          rawComponents: [{ amount: 20, type }],
        });
        const total = mitigated.reduce((sum, c) => sum + c.amount, 0);
        expect(total).toBe(10);
      }
    });

    it('NOT resistant to other damage types (fire / cold / poison etc.)', () => {
      const paladin = buildPaladin();
      const bearer = seed(paladin);
      for (const type of ['fire', 'cold', 'poison', 'lightning', 'force', 'radiant'] as const) {
        const mitigated = mitigateDamage({
          character: bearer,
          itemInstances: {},
          content: CONTENT,
          rawComponents: [{ amount: 20, type }],
        });
        const total = mitigated.reduce((sum, c) => sum + c.amount, 0);
        expect(total).toBe(20);
      }
    });

    it('immune to the prone condition', () => {
      const paladin = buildPaladin();
      const bearer = seed(paladin);
      const immune = isImmuneToCondition({
        state: {
          characters: { [bearer.id]: bearer },
          itemInstances: {},
        } as never,
        content: CONTENT,
        targetId: bearer.id,
        conditionId: 'prone',
      });
      expect(immune).toBe(true);
    });

    it('advantage on STR, DEX, and CON saves', () => {
      const paladin = buildPaladin();
      const bearer = seed(paladin);
      for (const ability of ['STR', 'DEX', 'CON'] as const) {
        const result = computeSavingThrow({
          character: bearer,
          itemInstances: {},
          content: CONTENT,
          ability,
        });
        expect(result.hasAdvantage).toBe(true);
      }
    });

    it('no advantage on INT, WIS, or CHA saves', () => {
      const paladin = buildPaladin();
      const bearer = seed(paladin);
      for (const ability of ['INT', 'WIS', 'CHA'] as const) {
        const result = computeSavingThrow({
          character: bearer,
          itemInstances: {},
          content: CONTENT,
          ability,
        });
        expect(result.hasAdvantage).toBe(false);
      }
    });

    it('fly speed entry projects to the raw effect stack (declarative; non-walk speeds aren\'t yet derived)', () => {
      // Slice 263's bonus pattern-check finding: 0 consumers read
      // non-walk ModifySpeed entries today. The wire is RAW-discoverable
      // annotation that consumers (UI, encounter manager) can surface;
      // the engine doesn't currently project it into movement planning.
      // Pin the raw-effects visibility so a future non-walk derive
      // slice can flip the assertion from "in stack" to "in derived
      // speed".
      const paladin = buildPaladin();
      const bearer = seed(paladin);
      const effects = collectEffectsFromCharacter({
        character: bearer,
        itemInstances: {},
        content: CONTENT,
      });
      const flySpeed = effects.find(
        (e) =>
          e.kind === 'ModifySpeed' &&
          e.mode === 'fly' &&
          e.op === 'set' &&
          e.value === 10,
      );
      expect(flySpeed).toBeDefined();
    });
  });
});
