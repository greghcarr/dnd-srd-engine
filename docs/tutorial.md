# Tutorial: building on dnd-srd-engine

A sequential walkthrough that exercises every major capability of the engine in one running example. By the end you'll have driven a character through creation, equipment, combat with attacks and spells and reactions, a level-up choice cascade, a long rest, save / load / replay, and a plugin handler registry — all the patterns a real consumer needs.

This is the long-form companion to [getting-started.md](getting-started.md) (the 5-minute on-ramp). If you're looking up a specific symbol, see [api-overview.md](api-overview.md). If you want to know what the engine tracks vs what you track, see [engine-scope.md](engine-scope.md).

Every code block tagged with `<!-- typecheck -->` or `<!-- typecheck:continue -->` is compiled in CI against the real public API, so the snippets stay correct as the API evolves.

## 1. Install

The engine is not currently published to a registry. Pin to the GitHub ref:

```jsonc
"dependencies": {
  "dnd-srd-engine": "github:greghcarr/dnd-srd-engine"
}
```

Peer dependencies (`zod`, `immer`, `ulid`) install transitively. TypeScript strict mode is recommended in your consumer; the engine ships full `.d.ts` and assumes you'll use it.

## 2. Create the engine

The engine takes a content-pack list and (optionally) an RNG. Use `seededRNG(n)` for reproducible runs (tests, replay-equivalence checks); use `defaultRNG` or omit the field for production randomness.

<!-- typecheck -->
```ts
import {
  createEngine,
  loadStarterPack,
  seededRNG,
} from 'dnd-srd-engine';

const engine = createEngine({
  contentPacks: [loadStarterPack()],
  rng: seededRNG(42),
});
```

The starter pack ships in the package and includes the full SRD 5.2.1 catalog (classes, species, backgrounds, feats, spells, magic items, monsters, conditions) at varying mechanical-wiring depth. See [status.md](status.md) for the per-category coverage table.

## 3. Build a character

Characters are plain data parsed through `CharacterSchema`. Minimum fields: a class enrollment, ability scores, HP. The engine assigns an ID via `newCharacterId()`.

<!-- typecheck:continue -->
```ts
import {
  CharacterSchema,
  newCharacterId,
  newItemInstanceId,
  newEventId,
  commit,
} from 'dnd-srd-engine';

const alyx = CharacterSchema.parse({
  id: newCharacterId(),
  name: 'Alyx',
  speciesId: 'human',
  backgroundId: 'soldier',
  classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
  abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
  hp: { current: 12, max: 12, temp: 0 },
  featsTaken: ['savage-attacker'],
});
```

## 4. Drain the level-1 choice cascade

A freshly-created character has unresolved L1 choices the level-up planner never sees (Fighter Fighting Style, every class's L1 OfferChoice grants). Run `offerCharacterChoices` to install the `PendingChoice` set, then resolve each one.

<!-- typecheck:continue -->
```ts
let campaign = engine.createCampaign({ name: 'tutorial' });
campaign = commit(campaign, [
  { id: newEventId(), at: new Date().toISOString(), type: 'CharacterCreated', snapshot: alyx },
]);

campaign = commit(
  campaign,
  engine.plan.offerCharacterChoices(campaign.state, {
    characterId: alyx.id,
  }).events,
);

const pendingForAlyx = Object.values(campaign.state.pendingChoices).filter(
  (c) => c.forCharacterId === alyx.id && c.resolution === undefined,
);

for (const choice of pendingForAlyx) {
  const firstOptionId = choice.options[0]?.id;
  if (firstOptionId === undefined) continue;
  campaign = commit(
    campaign,
    engine.plan.resolveChoice(campaign.state, {
      characterId: alyx.id,
      choiceId: choice.id,
      selectedOptionIds: [firstOptionId],
    }).events,
  );
}
```

In a real app you'd surface each prompt to the player and pass back their selection. The engine doesn't auto-pick — see [engine-scope.md](engine-scope.md) "What your app tracks" for the rationale.

## 5. Acquire and equip a weapon

Items have two layers: **definitions** (the data, in content packs) and **instances** (the per-character ownership records). Acquire an instance via `ItemAcquired`, then `engine.plan.equip` puts it in a slot.

<!-- typecheck:continue -->
```ts
const sword = {
  id: newItemInstanceId(),
  definitionId: 'longsword',
  quantity: 1,
  attuned: false,
  identifiedByCharacterIds: [],
};

campaign = commit(campaign, [
  { id: newEventId(), at: new Date().toISOString(), type: 'ItemAcquired', instance: sword },
]);

campaign = commit(
  campaign,
  engine.plan.equip(campaign.state, {
    characterId: alyx.id,
    instanceId: sword.id,
    slot: 'mainHand',
  }).events,
);
```

`slot` values: `'mainHand'`, `'offHand'`, `'armor'`, `'shield'`. The planner enforces the two-handed-prevents-shield and attunement rules from RAW.

## 6. Derive the character sheet

Two surfaces: the low-level `engine.derive.*` namespace (AC, attack bonus, spell DC, etc.) and the higher-level `buildCharacterSheet` view model (everything a UI needs in one call). Each derivation returns a typed result with a breakdown (each contributing modifier and its source), not just a total.

<!-- typecheck:continue -->
```ts
import { buildCharacterSheet } from 'dnd-srd-engine';

const ac = engine.derive.ac(campaign.state, alyx.id);
const attackBonus = engine.derive.attackBonus(campaign.state, alyx.id, sword.id);

console.log(`AC ${ac.total}, Longsword +${attackBonus.total} to hit`);

const character = campaign.state.characters[alyx.id];
if (character !== undefined) {
  const sheet = buildCharacterSheet({
    character,
    itemInstances: campaign.state.itemInstances,
    content: engine.content,
    characters: campaign.state.characters,
  });

  console.log(`Lvl ${sheet.totalLevel}, prof +${sheet.proficiencyBonus}`);
  for (const skill of sheet.skills) {
    console.log(`  ${skill.skill}: ${skill.modifier >= 0 ? '+' : ''}${skill.modifier}`);
  }
}
```

That's the value of the audit-log shape: a UI can show *why* AC is 18, not just that it is.

## 7. Start an encounter

Encounters drive turn order and the action-economy reset. The lifecycle is `createEncounter` → `rollInitiative` → `startEncounter` → `beginFirstTurn` → (`advanceTurn` per turn) → `endEncounter`.

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
  featsTaken: [],
});

campaign = commit(campaign, [
  { id: newEventId(), at: new Date().toISOString(), type: 'CharacterCreated', snapshot: goblin },
]);

const enc = engine.plan.createEncounter(campaign.state, {
  combatantIds: [alyx.id, goblin.id],
  name: 'Goblin at the bridge',
});
campaign = commit(campaign, enc.events);
campaign = commit(
  campaign,
  engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events,
);
campaign = commit(
  campaign,
  engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events,
);
campaign = commit(
  campaign,
  engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events,
);
```

## 8. Attack: plan, commit, observe

`engine.plan.attack` rolls every die it needs — d20, advantage / disadvantage extras, damage dice, critical doubling — and returns the resolution events with the rolls baked in. `commit` then runs `apply()` over each event in order. `apply()` itself is RNG-free.

<!-- typecheck:continue -->
```ts
const attackResult = engine.plan.attack(campaign.state, {
  attackerId: alyx.id,
  targetId: goblin.id,
  weaponInstanceId: sword.id,
});

for (const event of attackResult.events) {
  if (event.type === 'AttackRolled') {
    const d20 = event.d20[0] ?? 0;
    console.log(
      `d20 ${d20} + ${event.attackBonus} = ${event.total} vs AC ${event.targetAC} -> ${event.hit ? 'HIT' : 'MISS'}`,
    );
  } else if (event.type === 'DamageApplied') {
    for (const component of event.components) {
      console.log(`${component.amount} ${component.type} damage`);
    }
  }
}

campaign = commit(campaign, attackResult.events);
```

DamageApplied carries one or more `components` because a single hit can split across damage types (Flame Tongue: slashing + fire). Each component has its own `amount`, `type`, optional `mitigation` ('resisted' / 'immune' / 'vulnerable'), and pre-mitigation `rawAmount`.

The plan/commit split is what makes save / load / multiplayer / undo all work. The committed events are the durable artifact; state is computed from them.

## 9. Cast a spell

`engine.plan.castSpell` consumes the slot, rolls (attack / save / damage as the spell's mechanic requires), and emits resolution events.

<!-- typecheck:continue -->
```ts
const wizard = CharacterSchema.parse({
  id: newCharacterId(),
  name: 'Brynn',
  speciesId: 'elf',
  backgroundId: 'sage',
  classes: [{
    classId: 'wizard',
    level: 3,
    hitDiceRemaining: 3,
    spellcasting: {
      preparedSpellIds: ['magic-missile', 'shield', 'mage-armor'],
    },
  }],
  abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 16, WIS: 12, CHA: 10 },
  hp: { current: 18, max: 18, temp: 0 },
  featsTaken: [],
});

campaign = commit(campaign, [
  { id: newEventId(), at: new Date().toISOString(), type: 'CharacterCreated', snapshot: wizard },
]);

const castResult = engine.plan.castSpell(campaign.state, {
  characterId: wizard.id,
  spellId: 'magic-missile',
  slotLevel: 1,
  targetIds: [goblin.id],
});

campaign = commit(campaign, castResult.events);
```

Note `targetIds` — the engine doesn't compute "who's in the area" of a Fireball or Burning Hands. Your app supplies the targets from its spatial model (or just lets the player click them). See [engine-scope.md](engine-scope.md).

For spells with caster-chosen mechanics (Chromatic Orb picks acid / fire / cold / lightning / poison / thunder at cast), pass `casterChoice`. For free-cast features (Cleric Divine Intervention, magic items), pass `noSlotCost: true`. For multiclass casters using a different class's list, pass `castingClassId`.

## 10. Reactions

Reactions are surfaced as opportunities on the event stream. Your app detects the trigger window (e.g. an `AttackRolled` event lands on the wizard) and decides whether to invoke the matching reaction planner.

<!-- typecheck:continue -->
```ts
for (const event of attackResult.events) {
  if (event.type !== 'AttackRolled') continue;
  if (event.targetId !== wizard.id) continue;
  if (!event.hit) continue;

  const shieldOutcome = engine.plan.shield(campaign.state, {
    casterId: wizard.id,
    triggeringAttackEventId: event.id,
    triggeringAttackTotal: event.total,
    originalAC: event.targetAC,
  });

  if (shieldOutcome.preventedHit) {
    campaign = commit(campaign, shieldOutcome.events);
  }
}
```

Reaction planners return an outcome shape (`ShieldOutcome.preventedHit`, `ProtectionOutcome`, `ConsumeGuidanceOutcome`) so the caller can decide whether to spend the resource based on what the planner determined would happen. The reaction doesn't fire unless you commit its events.

Other reactions: `engine.plan.opportunityAttack`, `engine.plan.counterspell`, `engine.plan.protection` (Fighting Style), `engine.plan.consumeGuidance` (the cantrip), `engine.plan.uncannyDodge`, `engine.plan.stonesEndurance`.

## 11. Weapon masteries (2024)

Each fighter / barbarian / paladin / ranger / monk chooses a small set of mastery weapons (slice 502 enforces the slot budget). Mastery effects fire automatically off attacks — Graze on a miss, Sap / Vex on a hit (slice 624 gates these by hit/miss), Topple / Push as riders the planner emits.

<!-- typecheck:continue -->
```ts
campaign = commit(
  campaign,
  engine.plan.chooseWeaponMasteries(campaign.state, {
    characterId: alyx.id,
    weaponDefinitionIds: ['longsword'],
  }).events,
);
```

Mastery selections are re-choosable on a Long Rest (RAW): the consumer invokes `chooseWeaponMasteries` again and the reducer replaces the prior selection.

## 12. Rests

Short and long rests reset different resource pools per the 2024 PHB. `engine.plan.shortRest` expends hit dice for HP and resets per-short-rest features; `engine.plan.longRest` restores HP to max, returns hit dice (clamped to half-of-max), resets all per-rest tracking.

<!-- typecheck:continue -->
```ts
campaign = commit(
  campaign,
  engine.plan.shortRest(campaign.state, {
    participantIds: [alyx.id, wizard.id],
  }).events,
);

campaign = commit(
  campaign,
  engine.plan.longRest(campaign.state, {
    participantIds: [alyx.id, wizard.id],
  }).events,
);
```

The `grittyRest` campaign setting changes short-rest = 8h / long-rest = 7d; the engine plumbs the flag through but consumers branching on it for narrative pacing apply the wall-clock change themselves.

## 13. Level up

`engine.plan.levelUp` advances a single class enrollment by one level. `hpStrategy` picks rolled vs average. The planner also emits `ChoiceRequired` events for any L→L+1 OfferChoice grants (subclass selection at the gating level, ASI vs feat at 4 / 8 / 12 / 16 / 19, etc.).

<!-- typecheck:continue -->
```ts
const levelUpResult = engine.plan.levelUp(campaign.state, {
  characterId: alyx.id,
  classId: 'fighter',
  hpStrategy: 'average',
});

campaign = commit(campaign, levelUpResult.events);

const newChoices = Object.values(campaign.state.pendingChoices).filter(
  (c) => c.forCharacterId === alyx.id && c.resolution === undefined,
);

for (const choice of newChoices) {
  const firstOptionId = choice.options[0]?.id;
  if (firstOptionId === undefined) continue;
  campaign = commit(
    campaign,
    engine.plan.resolveChoice(campaign.state, {
      characterId: alyx.id,
      choiceId: choice.id,
      selectedOptionIds: [firstOptionId],
    }).events,
  );
}
```

In a real app, surface each `ChoiceRequired` to the player and post their selection back via `resolveChoice`. The engine emits the choices; your app drives the UI.

## 14. Consume the event stream

Every commit returns a new `Campaign` with `events: ReadonlyArray<Event>`. Your UI renders from those: stream-process for a live combat log, scrub through them for a replay timeline, diff state-at-event-N vs state-at-event-N+1 for animations.

<!-- typecheck:continue -->
```ts
for (const event of campaign.events) {
  if (event.type === 'DamageApplied') {
    for (const component of event.components) {
      console.log(`tick: ${component.amount} ${component.type} on ${event.targetId}`);
    }
  } else if (event.type === 'TurnStarted') {
    console.log(`-- turn for ${event.combatantId} --`);
  }
}
```

For a tested human-readable transcript formatter, see [tests/transcript.ts](../tests/transcript.ts) and the showcase output at [tests/golden/transcripts/showcase.transcript.md](../tests/golden/transcripts/showcase.transcript.md).

## 15. Save, load, replay

The event log is the durable artifact. `serializeCampaign` produces JSON; `loadCampaign` round-trips back. State is recomputed from events, not stored separately.

<!-- typecheck:continue -->
```ts
import { serializeCampaign, loadCampaign, replay } from 'dnd-srd-engine';

const json = serializeCampaign(campaign);
const restored = loadCampaign(json);
const recomputed = replay(campaign.events);
console.log('restored:', restored.id, 'recomputed encounters:', Object.keys(recomputed.encounters).length);
```

Branching timelines work the same way: take the events array, fork it, replay the fork. No mutation in sight.

<!-- typecheck:continue -->
```ts
const hypotheticalEvents = [...campaign.events];
const hypotheticalState = replay(hypotheticalEvents);
console.log('hypothetical characters:', Object.keys(hypotheticalState.characters).length);
```

## 16. Undo and redo

Standard editor semantics: `undo` moves the cursor back, `redo` moves it forward. Committing new events after an undo discards the redo tail.

<!-- typecheck:continue -->
```ts
import { undo, redo } from 'dnd-srd-engine';

campaign = undo(campaign);
campaign = redo(campaign);
```

For an "I want to try Fireball and see what happens" workflow, prefer `replay(events.concat(hypothetical))` over `undo`. The replay approach doesn't touch the live timeline.

## 17. Custom content via content packs

The starter pack is JSON. Layer your own packs over it for homebrew. Later packs override earlier ones on ID conflicts.

<!-- typecheck -->
```ts
import {
  createEngine,
  loadStarterPack,
  loadContentPack,
  seededRNG,
} from 'dnd-srd-engine';

const homebrew = loadContentPack({
  id: 'my-table',
  name: 'My Table Homebrew',
  version: '0.1.0',
  spells: [
    {
      id: 'home-fire-arrow',
      name: 'Fire Arrow',
      level: 1,
      school: 'evocation',
      castingTime: 'Action',
      range: '60 feet',
      components: { verbal: true, somatic: true },
      duration: 'Instantaneous',
      concentration: false,
      ritual: false,
      classes: ['wizard', 'sorcerer'],
      mechanicalEffects: [
        { kind: 'attack', attackKind: 'ranged', damageDice: '2d6', damageType: 'fire' },
      ],
    },
  ],
});

const engineWithHomebrew = createEngine({
  contentPacks: [loadStarterPack(), homebrew],
  rng: seededRNG(7),
});
```

For the full content-pack schema (which fields a `Spell` / `Feat` / `Class` / `MonsterStatblock` accepts), see the Zod schemas under [../src/schemas/content/](../src/schemas/content/) or [authoring-content-packs.md](authoring-content-packs.md).

## 18. Custom handlers (the plugin escape hatch)

When a feature is genuinely procedural and the effect-primitive vocabulary doesn't fit (Wild Shape, Polymorph, Wish), use a `CustomEffect` with a `handlerId` plus a handler registry that supplies the behavior. Two axes: `effect` handlers (for buffs / conditions / auras with `onApply` / `onTick` / `onExpire` lifecycle hooks) and `action` handlers (for bespoke spells / items / actions invoked via `engine.plan.custom`).

<!-- typecheck -->
```ts
import {
  createEngine,
  loadStarterPack,
  seededRNG,
} from 'dnd-srd-engine';
import type { ActionHandler, HandlerRegistry } from 'dnd-srd-engine';

const luckyBoonAction: ActionHandler = {
  plan: (ctx, params) => {
    // ctx exposes apiVersion, state, content, rng. Read params (typed by
    // your handler's contract with its content). Return events of the
    // engine's existing event union — handlers don't invent new event
    // types, they compose what apply() already knows.
    return [];
  },
};

const handlers: HandlerRegistry = {
  action: {
    'my-table:lucky-boon': luckyBoonAction,
  },
};

const engineWithHandlers = createEngine({
  contentPacks: [loadStarterPack()],
  rng: seededRNG(1),
  handlers,
});
```

Action handlers run at plan time inside `engine.plan.custom`, consume `ctx.rng`, and bake their rolls into the returned events. `apply()` and replay are unaffected — they re-apply the baked events without calling the handler again. See [plugin-api-design.md](plugin-api-design.md) for the full constraints, the effect-handler lifecycle, and the handler-context shape.

## 19. Determinism guarantees

Two architectural invariants make the engine deterministic:

1. **`apply()` is RNG-free.** Every die rolls inside `engine.plan.*`. The resolution events carry baked rolls. `apply()` reads them.
2. **Replay equivalence**: `replay(campaign.events)` produces a state that deep-equals `campaign.state` for every event log the engine has ever produced. Every golden scenario in [tests/golden/](../tests/golden/) asserts this.

Practical consequence: seeded RNG + identical event log = byte-identical state across machines. That's what makes save files, multiplayer sync, and audit logs work correctly.

One caveat: engine slices can change the *order* in which the planner consumes RNG (e.g. when a new advantage source gets wired into attack resolution). The seed-to-result mapping is not stable across engine versions. The mapping is stable across runs of the same engine version. See [breaking-changes-queued.md](breaking-changes-queued.md) for the queued RNG-stream changes that will roll into the next release.

## 20. What the engine doesn't track

For the full reference, see [engine-scope.md](engine-scope.md). One-line summary: the engine tracks everything that flows from rolls and rule resolution (HP, action economy, conditions, slots, concentration, initiative, death saves, choices). Your app tracks positions, line of sight, ambient light, narrative DM rulings, area target selection, reaction decisions.

When you're integrating, the recurring question is "do I have to track X myself?" The engine-scope doc answers it for the common cases (positions, light, line of sight, carry weight, narrative outcomes, area targets, reaction windows) and lists the four consumer-coordinated fact slots (`bearerCanSeeFearSource`, `targetCanSeeAttacker`, `lightLevel`, `attackerHasAllyAdjacentToTarget`) where the engine ships the predicate plumbing and you supply the per-intent boolean.

## Where to go next

- **A specific symbol's signature**: [api-overview.md](api-overview.md).
- **Patterns the tutorial didn't cover** (multiplayer sync, branching timelines, content-pack migrations): [recipes.md](recipes.md).
- **Why the API is shaped this way**: [concepts.md](concepts.md).
- **Engine internals + locked architectural decisions**: [architecture.md](architecture.md).
- **Browse a full multi-act campaign run**: [the showcase transcript](../tests/golden/transcripts/showcase.transcript.md) walks the engine through sessions, party currency, locations + doors, NPC reactions, mounts, travel, two combats, action surge, sneak attack, opportunity attacks, falling, polymorph, multiattack, fire mitigation, death save + revivify, quest objectives + XP + rewards, magic-item charges, downtime crafting, and replay-equivalence over the whole multi-act transcript.
