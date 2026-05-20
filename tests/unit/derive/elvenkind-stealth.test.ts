// Slice 297 — Boots of Elvenkind + Cloak of Elvenkind Stealth wires.
//
// Both items grant bearer-side Stealth advantage. Boots' RAW is
// unconditional ("you also have Advantage on Dexterity (Stealth)
// checks"); Cloak's RAW is hood-up gated, but the engine doesn't
// model hood posture — the wire fires whenever the cloak is
// attuned, and the consumer who tracks hood state opts out by
// not attuning when the hood is down.
//
// The Cloak's third-party-Perception-disadvantage arm stays
// deferred (the engine's SetAdvantage is bearer-side; the
// per-skill-roll context to swing a check from another creature's
// perspective hasn't landed). Same deferral applies to Cloak of
// Displacement's third-party attack-disadvantage.
import { describe, expect, it } from 'vitest';
import { computeAbilityCheck } from '../../../src/derive/ability-check.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import {
  ItemInstanceSchema,
  type ItemInstance,
} from '../../../src/schemas/runtime/item-instance.js';
import { newItemInstanceId } from '../../../src/ids.js';
import { buildFighter } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const makeItem = (definitionId: string): ItemInstance =>
  ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId });

describe('Boots of Elvenkind Stealth wire (slice 297)', () => {
  it('grants advantage on Stealth while worn (no attunement required)', () => {
    const boots = makeItem('boots-of-elvenkind');
    const wearer = buildFighter({ DEX: 14, inventory: [boots.id] });
    const r = computeAbilityCheck({
      character: wearer,
      itemInstances: { [boots.id]: boots },
      content: CONTENT,
      ability: 'DEX',
      skill: 'stealth',
    });
    expect(r.hasAdvantage).toBe(true);
  });

  it('does not affect non-Stealth skills', () => {
    const boots = makeItem('boots-of-elvenkind');
    const wearer = buildFighter({ DEX: 14, inventory: [boots.id] });
    const r = computeAbilityCheck({
      character: wearer,
      itemInstances: { [boots.id]: boots },
      content: CONTENT,
      ability: 'DEX',
      skill: 'acrobatics',
    });
    expect(r.hasAdvantage).toBe(false);
  });

  it('does not fire when the boots are not in the wearer inventory', () => {
    const boots = makeItem('boots-of-elvenkind');
    const wearer = buildFighter({ DEX: 14 });
    const r = computeAbilityCheck({
      character: wearer,
      itemInstances: { [boots.id]: boots },
      content: CONTENT,
      ability: 'DEX',
      skill: 'stealth',
    });
    expect(r.hasAdvantage).toBe(false);
  });
});

describe('Cloak of Elvenkind Stealth wire (slice 297)', () => {
  it('grants advantage on Stealth while attuned (hood-up gate is consumer-managed)', () => {
    const cloak = makeItem('cloak-of-elvenkind');
    const wearer = buildFighter({
      DEX: 14,
      inventory: [cloak.id],
      attunedInstanceIds: [cloak.id],
    });
    const r = computeAbilityCheck({
      character: wearer,
      itemInstances: { [cloak.id]: cloak },
      content: CONTENT,
      ability: 'DEX',
      skill: 'stealth',
    });
    expect(r.hasAdvantage).toBe(true);
  });

  it('does NOT fire without attunement (RAW: attunement-required)', () => {
    const cloak = makeItem('cloak-of-elvenkind');
    const wearer = buildFighter({ DEX: 14, inventory: [cloak.id] });
    const r = computeAbilityCheck({
      character: wearer,
      itemInstances: { [cloak.id]: cloak },
      content: CONTENT,
      ability: 'DEX',
      skill: 'stealth',
    });
    expect(r.hasAdvantage).toBe(false);
  });

  it('does not affect non-Stealth skills', () => {
    const cloak = makeItem('cloak-of-elvenkind');
    const wearer = buildFighter({
      DEX: 14,
      inventory: [cloak.id],
      attunedInstanceIds: [cloak.id],
    });
    const r = computeAbilityCheck({
      character: wearer,
      itemInstances: { [cloak.id]: cloak },
      content: CONTENT,
      ability: 'DEX',
      skill: 'perception',
    });
    expect(r.hasAdvantage).toBe(false);
  });
});
