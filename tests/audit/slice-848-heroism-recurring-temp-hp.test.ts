// Slice 848 — `heroism-no-recurring-temp-hp` is NOT A BUG (stale L7 finding).
//
// The L7 audit row read: "`heroic-active` grants only Frightened immunity;
// RAW also grants temp HP = spell mod at the start of each of the target's
// turns." That looked only at the CONDITION. The temp HP is in fact fully
// modeled — just not stored on the condition (by design, as the condition's
// own description states). It lives on the spell's `recurring` SpellMechanic
// (`{ effect: 'temp-hp', addCasterAbilityMod: 'CHA' }`) and is driven by
// `planTickRecurring` / `engine.plan.tickRecurring` (the slice-79 primitive):
// at the start of each target's turn the consumer ticks it and the target
// gains the caster's spellcasting-ability (CHA, for Bard/Paladin) modifier as
// temp HP, with RAW max-not-stack semantics.
//
// RAW (SRD 5.2.1 Heroism): "the creature is immune to the Frightened
// condition and gains Temporary Hit Points equal to your spellcasting ability
// modifier at the start of each of its turns." So: condition immunity on the
// condition + recurring temp HP on the spell mechanic — exactly what ships.
//
// This guard pins all three legs so a future audit can't re-flag it and a
// refactor can't silently drop the temp-HP arm. The functional grant is also
// covered by tests/unit/engine/recurring-tick.test.ts (slice 79).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/index.js';
import { seededRNG } from '../../src/rng/seeded.js';
import { commit } from '../../src/engine/commit.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../src/ids.js';
import { eventId, isoTimestamp } from '../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../src/schemas/events/progression.js';

const PACK = loadStarterPack();

const heroism = () => PACK.spells.find((s) => s.id === 'heroism')!;
const heroicActive = () => PACK.conditions?.find((c) => c.id === 'heroic-active')!;

const buildPaladin = (cha: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Ariadne',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'paladin', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: cha },
    hp: { current: 25, max: 25, temp: 0 },
    preparedSpells: ['heroism'],
  });

const buildAlly = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Bran',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 14, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 25, max: 25, temp: 0 },
  });

describe('slice 848: heroism-no-recurring-temp-hp is NOT A BUG', () => {
  it('the temp HP IS wired — on the spell’s recurring mechanic (+CHA mod), not the condition', () => {
    const recurring = heroism().mechanicalEffects.find((m) => m.kind === 'recurring');
    expect(recurring, 'Heroism ships a recurring SpellMechanic').toBeDefined();
    expect((recurring as { effect?: string }).effect).toBe('temp-hp');
    expect((recurring as { addCasterAbilityMod?: string }).addCasterAbilityMod).toBe('CHA');
  });

  it('heroic-active carries the Frightened immunity and does NOT itself store the temp HP', () => {
    const cond = heroicActive();
    expect(
      cond.effects.some(
        (e) => e.kind === 'GrantConditionImmunity'
          && (e as { conditionId?: string }).conditionId === 'frightened',
      ),
      'heroic-active grants Frightened immunity',
    ).toBe(true);
    // By design the temp HP is NOT on the condition (it has no recurring arms).
    const c = cond as { recurringDamage?: unknown; recurringSave?: unknown };
    expect(c.recurringDamage).toBeUndefined();
    expect(c.recurringSave).toBeUndefined();
  });

  it('the tick grants the caster’s CHA mod as temp HP, with RAW max-not-stack semantics', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const paladin = buildPaladin(18); // CHA mod +4
    const ally = buildAlly();
    let campaign = engine.createCampaign({ name: 'heroism-guard' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: paladin } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
    ]);
    campaign = commit(campaign, engine.plan.castSpell(campaign.state, {
      characterId: paladin.id,
      spellId: 'heroism',
      slotLevel: 1,
      targetIds: [ally.id],
    }).events);
    // The buff lands as heroic-active (Frightened immunity).
    expect(campaign.state.characters[ally.id]!.appliedConditions.some((c) => c.conditionId === 'heroic-active')).toBe(true);

    // Tick one: +4 temp HP.
    const tick1 = engine.plan.tickRecurring(campaign.state, { casterId: paladin.id, targetId: ally.id }).events;
    const grant1 = tick1.find((e) => e.type === 'TempHPGranted');
    expect(grant1).toBeDefined();
    expect((grant1 as { amount: number }).amount).toBe(4);
    campaign = commit(campaign, tick1);
    expect(campaign.state.characters[ally.id]!.hp.temp).toBe(4);

    // Tick two: another +4 grant fires, but temp HP refreshes (max), not stacks → stays 4.
    const tick2 = engine.plan.tickRecurring(campaign.state, { casterId: paladin.id, targetId: ally.id }).events;
    expect(tick2.find((e) => e.type === 'TempHPGranted')).toBeDefined();
    campaign = commit(campaign, tick2);
    expect(campaign.state.characters[ally.id]!.hp.temp).toBe(4);
  });
});
