// Slice 527: at-will Invisibility for Imp / Quasit / Sprite via the
// monster-trait GrantSpell + slice-513 at-will slot-bypass pathway.
//
// RAW (each, paraphrased): "The {monster} casts Invisibility on
// itself, requiring no spell components and using Charisma as the
// spellcasting ability."
//
// Engine surface: the monster statblock's `traits` array now carries
// `{ kind: 'GrantSpell', spellId: 'invisibility', preparation:
// 'at-will', spellcastingAbility: 'CHA' }`. Monster traits already
// fold into the bearer's effect stack (effect-stack.ts line 223),
// and `characterKnowsSpell` consults the effect stack via
// `effectiveSpellList` (slice 212 wiring). The slice-513 at-will
// slot-bypass derivation detects the at-will GrantSpell at cast time
// and skips the SpellSlotConsumed event entirely. Result: the
// monster casts Invisibility on itself without any new engine code.
//
// This is a pure-content slice. **Zero engine changes.** The
// infrastructure (effect-stack folding of monster traits; effective-
// spell-list consultation; slice-513 at-will detection) all pre-
// dates this slice.
//
// Documented RAW deviation (deferred, all three monsters):
//   - "Requiring no spell components" - the engine doesn't currently
//     gate cast-spell on V/S/M component availability, so this is a
//     non-deviation in practice (components are narrative).
//
// Documented RAW deferral (deferred, scope-wise):
//   - The Imp + Quasit Shape-Shift action stays deferred (needs
//     monster-action polymorph primitive).
//   - The Quasit Scare (1/Day) reaction stays deferred (needs
//     per-day-uses + reaction-with-save-or-condition primitive).
//   - The Sprite Enchanting Bow Charmed-on-hit ranged weapon stays
//     deferred (would be a slice-321 mirror but with ranged kind +
//     1-piercing-damage trick; small slice, separate scope).

import { describe, expect, it } from 'vitest';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

// Build a runtime Character backed by the given monster statblock.
// Monsters live as runtime Characters; this is the engine convention.
const buildMonster = (statblockId: string, name: string): Character => {
  const sb = PACK.monsters.find((m) => m.id === statblockId)!;
  return CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human', // monsters don't have a species; placeholder
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: sb.abilityScores,
    hp: { current: sb.hp.average, max: sb.hp.average, temp: 0 },
    statblockId: sb.id,
  });
};

const MONSTERS = ['imp', 'quasit', 'sprite'] as const;

describe('At-will Invisibility for Imp/Quasit/Sprite (slice 527)', () => {
  it.each(MONSTERS)('%s ships the at-will Invisibility GrantSpell trait', (id) => {
    const m = PACK.monsters.find((mon) => mon.id === id)!;
    const grant = m.traits.find((t) => t.kind === 'GrantSpell' && (t as { spellId?: string }).spellId === 'invisibility');
    expect(grant).toBeDefined();
    expect((grant as { preparation: string }).preparation).toBe('at-will');
    expect((grant as { spellcastingAbility: string }).spellcastingAbility).toBe('CHA');
  });

  it.each(MONSTERS)('%s effect stack projects Invisibility as a granted at-will spell', (id) => {
    const monster = buildMonster(id, `Test-${id}`);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(527) });
    let campaign: Campaign = engine.createCampaign({ name: `${id}-grants` });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: monster } satisfies CharacterCreatedEvent,
    ]);
    const acc = buildEffectStack({
      character: campaign.state.characters[monster.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    const granted = acc.grantedSpells().find((g) => g.spellId === 'invisibility');
    expect(granted).toBeDefined();
    expect(granted!.preparation).toBe('at-will');
    expect(granted!.spellcastingAbility).toBe('CHA');
  });

  it.each(MONSTERS)('%s can cast Invisibility on itself with NO slot consumed (slice-513 at-will bypass)', (id) => {
    const monster = buildMonster(id, `Caster-${id}`);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(528) });
    let campaign: Campaign = engine.createCampaign({ name: `${id}-cast` });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: monster } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: monster.id,
      spellId: 'invisibility',
      slotLevel: 2,
      targetIds: [monster.id],
    }).events;
    const kinds = events.map((e) => e.type);
    // Cast resolves normally
    expect(kinds).toContain('SpellCastDeclared');
    expect(kinds).toContain('ConditionApplied');
    // Free cast: no slot consumed
    expect(kinds).not.toContain('SpellSlotConsumed');
    expect(kinds).not.toContain('PactSlotConsumed');
    // Invisible condition lands on self
    const applied = events.find(
      (e) => e.type === 'ConditionApplied' && (e as { conditionId?: string }).conditionId === 'invisible',
    );
    expect(applied).toBeDefined();
    expect((applied as { targetId: string }).targetId).toBe(monster.id);
    // Concentration starts (Invisibility is concentration)
    expect(kinds).toContain('ConcentrationStarted');
  });
});
