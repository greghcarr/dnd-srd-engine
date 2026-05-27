# Getting started

This walkthrough builds your first character, attacks a goblin, saves the campaign, and reloads it. About fifteen minutes from a blank project.

## 1. Install

The engine is not currently distributed through a package registry. Pin to the git ref in your consumer's `package.json`:

```jsonc
"dependencies": {
  "dnd-srd-engine": "github:greghcarr/dnd-srd-engine"
}
```

Peer dependencies (`zod`, `immer`, `ulid`) install transitively.

## 2. Create an engine with the starter pack

<!-- typecheck -->
```ts
import { createEngine, loadStarterPack, seededRNG } from 'dnd-srd-engine';

const engine = createEngine({
  contentPacks: [loadStarterPack()],
  rng: seededRNG(42),
});
```

The starter pack ships in the package and includes all 12 PHB classes with full 1–20 level tables (features wired through L7, narrative-only beyond where the primitive vocabulary doesn't yet cover), 12 subclasses (one canonical per class, L3 baseline plus a handful of wired higher-tier features), 9 species, 4 backgrounds (the SRD 5.2.1 set: Acolyte, Criminal, Sage, Soldier), 18 feats (6 origin + 1 general + 4 fighting style + 7 epic boon), 339 spells (the complete SRD 5.2.1 catalog; 183 mechanically wired, 70 narrative-only, 86 schema-only), 73 weapons + 22 armors + 37 tools + 77 adventuring-gear items + 69 consumables, 258 magic items, 253 monster statblocks, the 2024 Bastion system, and 127 conditions (all 15 RAW plus 112 mechanic-rider variants; 6 non-SRD spell conditions moved to `phb-2024-extras` in slice 402). It's enough to instantiate a character and run combat with a meaningful spell selection; later-tier play exercises the long tail of schema-only spells and the higher subclass-feature tiers that aren't yet authored. See [docs/starter-pack-gaps.md](starter-pack-gaps.md) for the per-spell catalog of "wired vs schema-only" and the queue of primitives still on the menu. The starter pack is SRD-only by design; non-SRD, homebrew, or campaign content is user-supplied as your own pack(s) in the gitignored `content-packs/` folder (see [content-packs/README.md](../content-packs/README.md)).

## 3. Build a character

<!-- typecheck:continue -->
```ts
import { CharacterSchema, newCharacterId, newItemInstanceId, newEventId } from 'dnd-srd-engine';
import { commit } from 'dnd-srd-engine';

const alyx = CharacterSchema.parse({
  id: newCharacterId(),
  name: 'Alyx',
  speciesId: 'human',
  backgroundId: 'soldier',
  classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
  abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
  hp: { current: 26, max: 26, temp: 0 },
  featsTaken: ['savage-attacker'],
});

const sword = {
  id: newItemInstanceId(),
  definitionId: 'longsword',
  quantity: 1,
  attuned: false,
  identifiedByCharacterIds: [],
};

let campaign = engine.createCampaign({ name: 'demo' });
campaign = commit(campaign, [
  { id: newEventId(), at: new Date().toISOString(), type: 'ItemAcquired', instance: sword },
  { id: newEventId(), at: new Date().toISOString(), type: 'CharacterCreated', snapshot: alyx },
]);
```

The engine state is now populated. `commit` is pure: it returns a new `Campaign` with the events appended and the state advanced.

## 4. Derive their sheet

<!-- typecheck:continue -->
```ts
const sheet = engine.derive.character(campaign.state, alyx.id);
const ac = engine.derive.ac(campaign.state, alyx.id);
const attack = engine.derive.attackBonus(campaign.state, alyx.id, sword.id);

console.log(`AC ${ac.total}, Longsword +${attack.total} to hit`);
```

Every derivation returns a typed result with a breakdown (each contributing modifier and its source), not just a total.

## 5. Take an attack

Add a goblin, create an encounter, and attack:

<!-- typecheck:continue -->
```ts
const goblin = CharacterSchema.parse({
  id: newCharacterId(),
  name: 'Goblin',
  speciesId: 'human',
  backgroundId: 'soldier',
  classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
  abilityScores: { STR: 8, DEX: 14, CON: 10, INT: 10, WIS: 8, CHA: 8 },
  hp: { current: 7, max: 7, temp: 0 },
  featsTaken: ['savage-attacker'],
});

campaign = commit(campaign, [
  { id: newEventId(), at: new Date().toISOString(), type: 'CharacterCreated', snapshot: goblin },
]);

const enc = engine.plan.createEncounter(campaign.state, {
  combatantIds: [alyx.id, goblin.id],
  name: 'Goblin at the bridge',
});
campaign = commit(campaign, enc.events);
campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);

campaign = commit(
  campaign,
  engine.plan.attack(campaign.state, {
    attackerId: alyx.id,
    targetId: goblin.id,
    weaponInstanceId: sword.id,
  }).events,
);

console.log(`Goblin HP: ${campaign.state.characters[goblin.id]?.hp.current}/7`);
```

All randomness was consumed inside `engine.plan.attack`. The events it returned have the d20 and damage dice baked in. `apply()` never touches RNG, so the campaign event log replays to byte-equivalent state on any machine.

## 6. Save and load

<!-- typecheck:continue -->
```ts
import { replay, EventSchema } from 'dnd-srd-engine';

// Save: events are the durable artifact. State is computed.
const saved = JSON.stringify({
  id: campaign.id,
  name: campaign.name,
  schemaVersion: campaign.schemaVersion,
  events: campaign.events,
});

// Load: parse events, replay, you have the same state.
const parsed = JSON.parse(saved) as { events: unknown[] };
const events = parsed.events.map((e) => EventSchema.parse(e));
const restoredState = replay(events);
// restoredState deep-equals campaign.state.
```

This is the practical payoff of event sourcing. Your save file is the truth; the state is derived.

## What's next

- **Understand the mental model**: [docs/concepts.md](concepts.md) explains why the API has the shape it does (events, plan/commit, content packs, effect primitives, PendingChoice).
- **Common how-tos**: [docs/recipes.md](recipes.md) covers save/undo/redo, branching timelines, adding content and feats, houserules, multiplayer sync, custom planners, and migrations.
- **Browse the public surface**: [docs/api-overview.md](api-overview.md) lists every public symbol by namespace.
- **Build a UI / consume the data**: the read/query layer renders the screens a player-facing app needs without reaching into raw state: `querySpells` / `queryMonsters` / `queryItems` (content browse), `buildCharacterSheet` (the full character sheet, beyond the partial `computeDerivedCharacter` used above), and `buildEncounterView` (combat tracker). See the "Content queries" section of [api-overview.md](api-overview.md).
- **Larger scenarios**: [examples/](../examples/) has three runnable scripts. The showcase transcript at [tests/golden/transcripts/showcase.transcript.md](../tests/golden/transcripts/showcase.transcript.md) walks through a multi-act campaign exercising most of the engine.
- **Bring your own content**: see [src/schemas/content/](../src/schemas/content/) for the Zod schemas of `Species`, `Background`, `Class`, `Spell`, `Feat`, `ItemDefinition`, `MonsterStatblock`, `Condition`. Load with `loadContentPack(json)` and merge with the starter via `resolveContent([starter, mine])`.
