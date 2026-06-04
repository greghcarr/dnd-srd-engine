// Slice 499: Goodberry (L1) - item-creation + inventory grant.
//
// RAW (SRD 5.2.1 Goodberry, Druid/Ranger): "Ten berries appear in your
// hand and are infused with magic for the duration. A creature can take
// a Bonus Action to eat one berry. Eating a berry restores 1 Hit Point,
// and the berry provides enough nourishment to sustain a creature for
// one day. Uneaten berries disappear when the spell ends."
//
// Engine additions:
//   - Optional `characterId` on ItemAcquired (slice 499): when set, the
//     reducer also pushes the new instance id onto that character's
//     inventory (so it's reachable by consumeItem).
//   - New SpellMechanic `create-item` (itemDefinitionId + quantity):
//     mints `quantity` fresh instances into the caster's inventory.
//
// Content: goodberry consumable (Heal flatAmount 1) + the Goodberry
// spell's create-item mechanic (quantity 10). Berries are consumed one
// at a time via engine.plan.consumeItem.
//
// Deferred (consumer-managed): the 24-hour expiry of uneaten berries.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ItemAcquiredEvent } from '../../../src/schemas/events/inventory.js';

const PACK = loadStarterPack();

const buildDruid = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Druid',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'druid', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 10, DEX: 12, CON: 13, INT: 10, WIS: 16, CHA: 10 },
    hp: { current: 8, max: 24, temp: 0 },
    knownSpells: ['goodberry'],
    preparedSpells: ['goodberry'],
  });

describe('Goodberry (slice 499)', () => {
  it('the goodberry consumable heals 1 HP on consume', () => {
    const item = PACK.items.find((i) => i.id === 'goodberry');
    expect(item).toBeDefined();
    expect(item?.itemKind).toBe('consumable');
    expect((item as { onConsume?: unknown })?.onConsume).toEqual([{ kind: 'Heal', flatAmount: 1 }]);
  });

  it('the Goodberry spell carries a create-item mechanic for 10 berries', () => {
    const s = PACK.spells.find((sp) => sp.id === 'goodberry');
    expect(s?.mechanicalEffects).toEqual([
      { kind: 'create-item', itemDefinitionId: 'goodberry', quantity: 10 },
    ]);
  });

  it('casting Goodberry mints 10 goodberry instances into the caster inventory', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const druid = buildDruid();
    let campaign: Campaign = engine.createCampaign({ name: 'goodberry' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: druid } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: druid.id,
      spellId: 'goodberry',
      slotLevel: 1,
      targetIds: [],
    }).events;
    const acquired = events.filter((e) => e.type === 'ItemAcquired') as ItemAcquiredEvent[];
    expect(acquired.length).toBe(10);
    for (const a of acquired) {
      expect(a.instance.definitionId).toBe('goodberry');
      expect(a.characterId).toBe(druid.id);
    }
    campaign = commit(campaign, events);
    const stored = campaign.state.characters[druid.id]!;
    const berriesInInventory = stored.inventory.filter(
      (id) => campaign.state.itemInstances[id]?.definitionId === 'goodberry',
    );
    expect(berriesInInventory.length).toBe(10);
  });

  it('eating one berry heals 1 HP and leaves 9 berries', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const druid = buildDruid(); // current HP 8 / max 24
    let campaign: Campaign = engine.createCampaign({ name: 'eat-berry' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: druid } satisfies CharacterCreatedEvent,
    ]);
    campaign = commit(campaign, engine.plan.castSpell(campaign.state, {
      characterId: druid.id,
      spellId: 'goodberry',
      slotLevel: 1,
      targetIds: [],
    }).events);
    const berryId = campaign.state.characters[druid.id]!.inventory.find(
      (id) => campaign.state.itemInstances[id]?.definitionId === 'goodberry',
    )!;
    const hpBefore = campaign.state.characters[druid.id]!.hp.current;
    campaign = commit(campaign, engine.plan.consumeItem(campaign.state, {
      characterId: druid.id,
      instanceId: berryId,
    }).events);
    const after = campaign.state.characters[druid.id]!;
    expect(after.hp.current).toBe(hpBefore + 1);
    const berriesLeft = after.inventory.filter(
      (id) => campaign.state.itemInstances[id]?.definitionId === 'goodberry',
    );
    expect(berriesLeft.length).toBe(9);
  });
});
