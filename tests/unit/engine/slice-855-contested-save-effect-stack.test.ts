// Slice 855 — `hand-rolled-saves-bypass-stack` (Grapple / Shove arm — closes the row).
//
// The 2024 Grapple and Shove (part of the Unarmed Strike) resolve on a target
// STR-or-DEX save vs the attacker's DC. `contested.ts` hand-rolled both saves
// as `abilityModifier(target.abilityScores[...])` — a raw modifier bypassing
// `computeSavingThrow`, the same bug slice 853 (Topple) / 854 (Open Hand)
// fixed. So the save skipped save PROFICIENCY (a Fighter resisting a grapple
// with only its raw STR mod), Bless/Bane, advantage/disadvantage, Magic
// Resistance, and the auto-fail.
//
// Both saves now route through the shared `rollSaveAgainstDC` primitive
// (`sourceIsMagical: false` — an Unarmed Strike is nonmagical). This closes
// the whole `hand-rolled-saves-bypass-stack` pattern (Topple → Open Hand →
// Grapple/Shove).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';

const PACK = loadStarterPack();

// Unarmed grappler (no equipped weapon → free hand). STR 18 → unarmed save DC 15 at L5.
const buildGrappler = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Grip',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 18, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 44, max: 44, temp: 0 },
  });

// Fighter target: PROFICIENT in STR saves (Fighter saves are STR + CON). STR 14 (+2) → +4.
const buildStrProficientTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Sturdy',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 10, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

// Wizard target: NOT proficient in STR saves (Wizard saves are INT + WIS). Same STR 14 → +2.
const buildStrNonProficientTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Frail',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 10, CON: 12, INT: 16, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

const seedCampaign = (grappler: Character, target: Character) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
  let campaign = engine.createCampaign({ name: 'contested-guard' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: grappler } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

const grappleSave = (target: Character): SaveRolledEvent => {
  const grappler = buildGrappler();
  const { engine, campaign } = seedCampaign(grappler, target);
  const events = engine.plan.grapple(campaign.state, {
    attackerId: grappler.id,
    targetId: target.id,
    targetAbility: 'STR',
  }).events;
  return events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent;
};

const shoveSave = (target: Character): SaveRolledEvent => {
  const grappler = buildGrappler();
  const { engine, campaign } = seedCampaign(grappler, target);
  const events = engine.plan.shove(campaign.state, {
    attackerId: grappler.id,
    targetId: target.id,
    mode: 'prone',
  }).events;
  return events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent;
};

describe('slice 855: Grapple / Shove saves go through the full derivation', () => {
  it('the Grapple save carries a computeSavingThrow breakdown', () => {
    const save = grappleSave(buildStrNonProficientTarget());
    expect(save.ability).toBe('STR');
    expect(save.breakdown ?? []).not.toHaveLength(0);
  });

  it('a STR-save-proficient target now adds proficiency to a Grapple save (was raw STR mod)', () => {
    const proficient = grappleSave(buildStrProficientTarget()); // STR +2, prof +2 → +4
    const nonProficient = grappleSave(buildStrNonProficientTarget()); // STR +2, no prof → +2
    expect(proficient.bonus).toBe(4);
    expect(nonProficient.bonus).toBe(2);
    expect(proficient.bonus).toBeGreaterThan(nonProficient.bonus);
  });

  it('a STR-save-proficient target now adds proficiency to a Shove save too', () => {
    const proficient = shoveSave(buildStrProficientTarget());
    const nonProficient = shoveSave(buildStrNonProficientTarget());
    expect(proficient.ability).toBe('STR');
    expect(proficient.bonus).toBe(4);
    expect(nonProficient.bonus).toBe(2);
  });
});
