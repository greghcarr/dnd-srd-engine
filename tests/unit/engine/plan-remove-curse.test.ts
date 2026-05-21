// Slice 134: planRemoveCurse strips every condition on the target
// whose content-pack definition has `category: 'curse'`. Used by the
// Remove Curse spell; the 'curse' category currently covers Bestow
// Curse's four `cursed-*-active` variants. Per RAW: "any curse
// affecting that creature or object ends" — no per-curse save or
// ability check.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  ConditionAppliedEvent,
  ConditionRemovedEvent,
} from '../../../src/schemas/events/combat.js';
import type { SpellSlotConsumedEvent } from '../../../src/schemas/events/spellcasting.js';

const PACK = loadStarterPack();

const buildCleric = (preparedSpells: string[] = ['remove-curse']): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Healer',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'cleric', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 18, CHA: 10 },
    hp: { current: 38, max: 38, temp: 0 },
    featsTaken: [],
    preparedSpells,
  });

const buildVictim = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Cursed Soul',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
    featsTaken: [],
  });

const seedCampaign = (
  cleric: Character,
  victim: Character,
  appliedConditions: ConditionAppliedEvent[],
): { campaign: Campaign; engine: ReturnType<typeof createEngine> } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign: Campaign = engine.createCampaign({ name: 'remove-curse' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
  ]);
  if (appliedConditions.length > 0) {
    campaign = commit(campaign, appliedConditions);
  }
  return { campaign, engine };
};

const makeAppliedCurse = (targetId: string, conditionId: string, sourceId: string): ConditionAppliedEvent => ({
  id: eventId(),
  at: isoTimestamp(),
  type: 'ConditionApplied',
  targetId,
  conditionId,
  appliedConditionId: newAppliedConditionId(),
  sourceCharacterId: sourceId,
});

describe('engine.plan.removeCurse', () => {
  it('strips a single curse: emits SpellCastDeclared + slot + ConditionRemoved', () => {
    const cleric = buildCleric();
    const victim = buildVictim();
    const cursed = makeAppliedCurse(victim.id, 'cursed-attacks-active', cleric.id);
    const { campaign, engine } = seedCampaign(cleric, victim, [cursed]);
    const { events } = engine.plan.removeCurse(campaign.state, {
      casterId: cleric.id,
      targetId: victim.id,
    });
    const types = events.map((e) => e.type);
    expect(types).toContain('SpellCastDeclared');
    expect(types).toContain('SpellSlotConsumed');
    expect(types).toContain('ConditionRemoved');
    const removed = events.filter((e): e is ConditionRemovedEvent => e.type === 'ConditionRemoved');
    expect(removed).toHaveLength(1);
    expect(removed[0]!.conditionId).toBe('cursed-attacks-active');
    expect(removed[0]!.targetId).toBe(victim.id);
  });

  it('strips multiple curses in one cast (each cursed-* condition gets its own ConditionRemoved)', () => {
    // RAW: "any curse affecting that creature ends" — plural. The
    // planner walks the bearer's full appliedConditions list, so
    // a target stacked with all four Bestow Curse variants drops
    // all four at once.
    const cleric = buildCleric();
    const victim = buildVictim();
    const curses = [
      makeAppliedCurse(victim.id, 'cursed-ability-str-active', cleric.id),
      makeAppliedCurse(victim.id, 'cursed-attacks-active', cleric.id),
      makeAppliedCurse(victim.id, 'cursed-inert-active', cleric.id),
      makeAppliedCurse(victim.id, 'cursed-vulnerable-active', cleric.id),
    ];
    const { campaign, engine } = seedCampaign(cleric, victim, curses);
    const { events } = engine.plan.removeCurse(campaign.state, {
      casterId: cleric.id,
      targetId: victim.id,
    });
    const removed = events.filter((e): e is ConditionRemovedEvent => e.type === 'ConditionRemoved');
    expect(removed).toHaveLength(4);
    const removedIds = removed.map((e) => e.conditionId).sort();
    expect(removedIds).toEqual([
      'cursed-ability-str-active',
      'cursed-attacks-active',
      'cursed-inert-active',
      'cursed-vulnerable-active',
    ]);
  });

  it('ignores non-curse conditions on the target (e.g. Bless, Prone)', () => {
    // The target has a Bless buff and a Prone condition alongside one
    // curse. Remove Curse strips only the curse; the other two stay.
    const cleric = buildCleric();
    const victim = buildVictim();
    const cursed = makeAppliedCurse(victim.id, 'cursed-attacks-active', cleric.id);
    const blessed: ConditionAppliedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ConditionApplied',
      targetId: victim.id,
      conditionId: 'blessed',
      appliedConditionId: newAppliedConditionId(),
      sourceCharacterId: cleric.id,
    };
    const prone: ConditionAppliedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ConditionApplied',
      targetId: victim.id,
      conditionId: 'prone',
      appliedConditionId: newAppliedConditionId(),
    };
    const { campaign, engine } = seedCampaign(cleric, victim, [cursed, blessed, prone]);
    const { events } = engine.plan.removeCurse(campaign.state, {
      casterId: cleric.id,
      targetId: victim.id,
    });
    const removed = events.filter((e): e is ConditionRemovedEvent => e.type === 'ConditionRemoved');
    expect(removed).toHaveLength(1);
    expect(removed[0]!.conditionId).toBe('cursed-attacks-active');
  });

  it('target with no curses: cast still consumes slot but emits no ConditionRemoved', () => {
    // RAW doesn't forbid casting at a non-cursed creature; the slot
    // is still spent. This matches Lesser Restoration and similar
    // "this might do nothing" utility spells.
    const cleric = buildCleric();
    const victim = buildVictim();
    const { campaign, engine } = seedCampaign(cleric, victim, []);
    const { events } = engine.plan.removeCurse(campaign.state, {
      casterId: cleric.id,
      targetId: victim.id,
    });
    const slot = events.find((e): e is SpellSlotConsumedEvent => e.type === 'SpellSlotConsumed');
    expect(slot).toBeDefined();
    expect(slot!.slotLevel).toBe(3);
    const removed = events.filter((e) => e.type === 'ConditionRemoved');
    expect(removed).toHaveLength(0);
  });

  it('rejects slotLevel < 3', () => {
    const cleric = buildCleric();
    const victim = buildVictim();
    const { campaign, engine } = seedCampaign(cleric, victim, []);
    expect(() =>
      engine.plan.removeCurse(campaign.state, {
        casterId: cleric.id,
        targetId: victim.id,
        slotLevel: 2,
      }),
    ).toThrow(/3rd-level/);
  });

  it('rejects when the caster does not know Remove Curse', () => {
    const cleric = buildCleric([]); // no prepared spells
    const victim = buildVictim();
    const { campaign, engine } = seedCampaign(cleric, victim, []);
    expect(() =>
      engine.plan.removeCurse(campaign.state, {
        casterId: cleric.id,
        targetId: victim.id,
      }),
    ).toThrow(/Remove Curse/);
  });

  it('higher-level slot is honored', () => {
    const cleric = buildCleric();
    const victim = buildVictim();
    const cursed = makeAppliedCurse(victim.id, 'cursed-attacks-active', cleric.id);
    const { campaign, engine } = seedCampaign(cleric, victim, [cursed]);
    const { events } = engine.plan.removeCurse(campaign.state, {
      casterId: cleric.id,
      targetId: victim.id,
      slotLevel: 5,
    });
    const slot = events.find((e): e is SpellSlotConsumedEvent => e.type === 'SpellSlotConsumed');
    expect(slot!.slotLevel).toBe(5);
  });
});
