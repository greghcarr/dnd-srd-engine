# Concepts

The mental model behind the engine. About fifteen minutes to read. After this, the planners and reducers will make a lot more sense.

## Events are the truth, state is the projection

Most game engines mutate state in place: an actor's HP field gets decremented, an effect gets appended to a list. The state IS the truth; the history of how it got there is a chat log at best.

This engine inverts that. The truth is an append-only **event log**. The current state is **computed** by folding `apply(state, event) -> state` over the log.

```ts
campaign.events   // ← the truth: every state change ever recorded
campaign.state    // ← derived: state == replay(events)
```

`apply()` is **pure**: same state + same event always produces the same next state. `replay(events)` walks the entire log and reconstructs the state from empty. On every commit the engine asserts `replay(state.events).state` deep-equals `campaign.state` (this invariant is tested in CI on every golden scenario).

What this gives you:

- **Save files are just JSON arrays of events.** `serializeCampaign(c)` writes id + name + schemaVersion + events. State is not stored; it's reconstructed by `loadCampaign(json)`.
- **Undo / redo are free.** The campaign carries a cursor into the event log. `undo()` decrements it; the state is recomputed from the prefix.
- **Multiplayer sync is straightforward.** Stream events between clients. As long as the planners on both sides consume the same RNG, they arrive at byte-equivalent state.
- **Debugging.** "Why is my HP 12?" Filter the event log: every change has a cause. The chat log isn't the only record; the events are.
- **Branching.** Fork the event list, append hypothetical events, observe the resulting state. Discard the fork. This is how an AI DM could evaluate "what if I cast Fireball here?"

The cost: every state change has to go through an event. Direct mutation of `campaign.state` is forbidden (and TypeScript enforces it: the state shape is frozen by Immer).

## Plan / commit split: RNG capture

The hardest part of event-sourced game engines is randomness. If `apply()` rolls dice during the attack reducer, the same events replay to different states on different machines.

This engine splits the work:

- **`engine.plan.*(intent)`**: consumes RNG. Rolls dice. Returns events with the dice results **baked in**.
- **`apply()`**: pure. Reads the baked rolls. Never touches RNG.

```ts
// plan.attack consumes RNG, returns events with d20, damage dice, etc. captured.
const { events } = engine.plan.attack(state, { attackerId, targetId, weaponInstanceId });

// commit appends events and applies them. apply() never re-rolls.
campaign = commit(campaign, events);
```

The architectural invariant: passing `ThrowOnCallRNG()` to `replay()` must not throw on any golden scenario. This is asserted in CI. If a reducer ever reaches for the RNG, the test suite fails.

What this gives you:

- **Deterministic replay across machines.** Two clients playing the same campaign arrive at the same state by streaming events alone.
- **The events ARE the dice record.** Looking at `AttackRolled` you see `d20: [14, 17], used: 17` and you know the natural-17 came from rolling with advantage.
- **Easy to test.** A seeded RNG (`seededRNG(42)`) makes a scenario reproducible from end to end.

The cost: dice rolls happen at plan time, not at apply time. You can't roll dice in a reducer.

## Schema-only library: bring your own content

A rules engine that ships content has IP problems and is hard to extend. This engine ships **only schemas + machinery** and a small **starter content pack** (under MIT, drawn from the 2024 SRD shape). Consumers load their own content packs at runtime.

A content pack is a JSON file with this shape:

```ts
{
  id: 'my-pack',
  name: 'My Pack',
  version: '0.1.0',
  species: [...],
  backgrounds: [...],
  classes: [...],
  subclasses: [...],
  feats: [...],
  spells: [...],
  items: [...],
  monsters: [...],
  conditions: [...],
}
```

Each list is validated against its Zod schema (`SpeciesSchema`, `SpellSchema`, etc.). Cross-references are checked (a `background.originFeatId` must point at a real feat).

```ts
import { loadContentPack, resolveContent, validateCrossReferences } from 'dnd-srd-engine';

const pack = loadContentPack(myJson);             // Zod parse, throws on shape error
const content = resolveContent([pack, otherPack]); // merge multiple packs
const issues = validateCrossReferences(content);   // returns Levenshtein-suggested issues
```

Multiple packs merge with later packs winning on ID conflicts. This is how you layer "core + homebrew" or "core + setting + table-specific."

For the full authoring reference (every entity type's fields, the effect primitives with examples, common patterns and pitfalls), see [authoring-content-packs.md](authoring-content-packs.md).

## Effect primitives plus an escape hatch

5.5e content has a wildly heterogeneous mechanical surface. The Barbarian's Rage is one shape; the Wizard's Mage Armor is another; Wish is its own beast.

The engine expresses **most** features via a fixed vocabulary of about 69 **effect primitives** (plus the `Custom` escape hatch):

- `AddModifier { target, value, condition? }`: a +1 to AC, a +2 to attack bonus
- `GrantResource { resourceId, max, recharge }`: Bardic Inspiration, Action Surge, Channel Divinity
- `OverrideACFormula { base, abilityModifiers, ... }`: Unarmored Defense
- `OnEvent { trigger, actions, oncePer? }`: Sneak Attack (rider damage on a hit)
- `GrantResistance / GrantImmunity / GrantVulnerability`: Half-Orc Relentless Endurance, dragon fire immunity
- `ModifyActionEconomy { op: 'extraAttack' | ... }`: Extra Attack
- `ModifySpeed { mode, op, value }`: Barbarian Fast Movement
- `GrantWeaponMastery { masteries, slots }`: Ranger's mastery grant
- ...and about a dozen more.

Effects live on **classes**, **feats**, **species**, **conditions**, and **items**. The engine's `buildEffectStack(character)` walks every source and assembles a single ordered list. Derivations then read the stack.

For features that genuinely don't fit a primitive (Wild Shape, Polymorph, Simulacrum, Wish), there's an **escape hatch**: dedicated event types (`PolymorphApplied`, `SimulacrumCreated`, `WishGranted`) with their own reducers. Same architectural contract: pure apply, baked rolls, replay-safe.

This split lets data express ~95% of features without code, and code handle the ~5% that data can't.

## PendingChoice: deferred decisions are events too

A character levels up: do they want a feat or ASI? They learn a new spell: which spells does the pack offer at that level?

In an imperative engine these are interactive prompts mid-mutation. Here they're **first-class events**:

```ts
ChoiceRequired { choiceId, characterId, kind, options }   // engine emits this
ChoiceResolved { choiceId, selectedOptionIds }            // consumer emits this
```

The level-up planner emits a `LevelUpResolved` event plus any `ChoiceRequired` for decisions the player owes. The choice sits on `campaign.state.pendingChoices` indefinitely. When the player picks, the consumer emits `ChoiceResolved` and the engine applies the chosen option's effects.

This is how the engine supports "build a UI" without owning the UI: ask the engine what decisions are open, render them, send back the selections.

## Branded IDs

Every entity kind has its own branded string type: `CharacterId`, `EncounterId`, `ItemInstanceId`, `ItemDefinitionId`, etc. They're all `string` at runtime (ULIDs), but the type system stops you from passing a spell ID where a character ID was expected.

```ts
const c: CharacterId = newCharacterId();
const i: ItemInstanceId = newItemInstanceId();
engine.derive.attackBonus(state, c, i);  // typechecks
engine.derive.attackBonus(state, i, c);  // ❌ type error
```

When you load IDs from JSON, use the cast helpers: `asCharacterId(s)`, `asSpeciesId(s)`, etc. At parse time the Zod schemas validate that the strings are ULIDs.

## Derivations are pure, memoized per state version

`engine.derive.character(state, id)`, `engine.derive.ac(state, id)`, etc. are **pure functions** of `(state, args)`. No caching, no side effects, no mutation.

Internally the engine memoizes them per `CampaignState.version`. Every commit bumps the version; the next derive call clears the cache. So if you ask for derived AC ten times per frame across twelve combatants, you pay for one computation each, not 120.

This is invisible to callers: the API is just "give me the derived sheet"; performance is handled.

## Where to next

- **Try it**: [examples/00-quickstart](../examples/00-quickstart/) is the smallest working consumer.
- **Walk through the tutorial**: [docs/getting-started.md](getting-started.md).
- **Look up an API**: [docs/api-overview.md](api-overview.md).
- **Common how-to recipes**: [docs/recipes.md](recipes.md).
- **See it all at once**: the showcase transcript at [tests/golden/transcripts/showcase.transcript.md](../tests/golden/transcripts/showcase.transcript.md).
