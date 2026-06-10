# Engine scope: what the engine tracks vs what your app tracks

A reference for consumers building on `dnd-srd-engine`. Answers the recurring question, "do I need to track X myself, or does the engine handle it?"

The short version: the engine owns everything that flows from rolls and rule resolution (HP, action economy, conditions, slots, concentration, initiative, death saves). Your app owns the table-level facts the rules consume but don't derive (positions, line of sight, ambient light, narrative choices). A small middle category — consumer-coordinated fact slots — has engine plumbing for the predicate side, but your app supplies the per-intent value.

For the mental model behind events / plan-commit / how the engine consumes intents, see [concepts.md](concepts.md). For the full public surface, see [api-overview.md](api-overview.md).

## What the engine tracks

State the engine owns and reduces from events. You read it, the engine writes it (through `commit`).

- **Hit points**: current, max, temporary, and hit dice remaining per character.
- **Action economy**: action / bonus action / reaction / movement budget per turn, per encounter. Consumed by intents, reset on turn-start.
- **Conditions**: the 15 RAW conditions plus 128 mechanic-rider variants the pack uses. Effects on attack rolls, saves, checks, AC, and movement compose into derivations automatically.
- **Spell slots**: used vs total per level, pact slots, free-cast slots (Magic Initiate, Magic Item charges, etc.).
- **Concentration**: which effect a character is concentrating on, broken automatically on damage saves, unconsciousness, or a new concentration cast.
- **Weapon mastery**: slot budget + chosen weapons (per the 2024 PHB Weapon Mastery class feature).
- **Effect instances**: active spells, conditions, and buffs with their `sourceCharacterId`, `durationRounds`, and `expiresOnRound` metadata.
- **Initiative order**: rolled initiative + the active combatant index per encounter.
- **Equipped items + attunement**: which items are equipped, which are attuned (engine enforces the 3-attunement RAW cap).
- **Inventory**: item instances + quantities per character.
- **Encounter lifecycle**: created → initiative → started → turn-advance → ended, with the appropriate events emitted at each transition.
- **Death saves**: success and failure counters, stable / dead-at-3-failures state, instant-death threshold.
- **Per-character resources**: rage, second-wind, lay-on-hands pool, sorcery points, ki, etc., with the correct per-rest reset semantics.
- **Trigger counters**: per-turn / per-round / per-rest "already fired" flags so reactions and once-per-turn riders gate correctly.
- **Pending choices**: level-up, ASI vs feat, subclass selection, OfferChoice cascades. `ChoiceRequired` events install the choice; `ChoiceResolved` records the selection; the effect stack reads resolved choices for derivations.
- **RNG consumption**: every roll is captured into events. Replay reads the baked rolls — `apply()` itself is RNG-free, so a captured event log replays to byte-identical state.
- **Ability scores**: base scores, ASI increases, score-cap floors, proficiency bonus by level.
- **Class progression**: level per class, multi-class spell-slot math, feature grants at each level, subclass selection at the gating level.

## What your app tracks

State the engine accepts as facts but doesn't derive. The engine has no model for these; your app populates them and (where applicable) passes them on the intent.

- **Distance and positions.** The optional `Position { x, y }` on combatants is the only spatial model the engine carries. If positions are undefined, the engine assumes adjacency-permissive (melee always reaches; no opportunity attacks fire). Populate `combatant.position` to unlock OA reactions, Pack Tactics, Spike Growth, and other position-aware mechanics.
- **Line of sight.** `bearerCanSeeFearSource` and `targetCanSeeAttacker` are intent-side facts. The engine has no LoS derivation; your app supplies the boolean per attack roll.
- **Ambient light.** `lightLevel: 'bright' | 'dim' | 'darkness'` per intent. Cloak of the Bat gates Stealth advantage on it; Kobold Warrior's Sunlight Sensitivity gates disadvantage on it. The engine doesn't model time-of-day, torches, or magical darkness.
- **Carry weight / encumbrance.** Not modeled. Item weights live on definitions, but the engine ships no encumbrance derivation.
- **Narrative DM rulings.** Improvised actions ("can I climb this wall?"), social outcomes, out-of-combat skill use that doesn't fit a wired planner. The engine ships planners for the canonical mechanics; narrative discretion stays with your app.
- **In-game time of day / calendar.** `inGameTime.totalMinutes` is bumped only via `InGameTimeAdvanced` events your app emits. The engine doesn't auto-advance time as turns pass.
- **Revivify / death-narrative outcomes.** The engine tracks death saves and the dead state. Your app drives revivify intent (the spell is wired; the choice to cast it is yours).
- **Spell area target selection.** As of slice 786 the engine ships the canonical rasterizer: `engine.query.creaturesInSpellArea(...)` (and the pure `coveredCells`) compute who's in the cone/sphere/line/cube/cylinder/emanation from positions + line of effect, so consumers no longer hand-roll the geometry. Area spells still accept an explicit `targetIds: string[]` on the cast intent; call `creaturesInSpellArea` to get the canonical ids and pass them through. A forthcoming opt-in `aim` (slice 787) will let the engine derive and enforce membership itself.
- **Narrative-only spells.** Alarm, Comprehend Languages, Detect Magic, Disguise Self, Speak with Animals, Illusory Script, and similar are content-only ("narrative" bucket). The cast emits no mechanical events; your app narrates the effect.
- **Reaction decisions.** The engine surfaces reaction windows (`OpportunityAvailable`, `ShieldCast`, `HellishRebukeAvailable`, etc.) on the event stream. Your app decides whether to invoke the matching reaction planner; the engine doesn't auto-react on the player's behalf.
- **Choice resolution.** The engine emits `ChoiceRequired` to install a `PendingChoice`. Your app collects the player's selection and emits `ChoiceResolved`. The engine never auto-picks.

## Consumer-coordinated fact slots

A small set of optional input fields where the engine ships the predicate plumbing and your app supplies the per-intent value. The semantic-default column matters: some default to "RAW arm fires" when undefined (so the engine matches RAW out of the box), others default to "RAW arm doesn't fire" (so the engine is strict until your app wires it).

| Fact slot | Type | Where it's read | Default semantic | What's gated |
|---|---|---|---|---|
| `bearerCanSeeFearSource` | `boolean` | `AttackIntent`, `ResolveAttackInput`, ability-check input | default-apply (undefined → true) | Frightened's attack and check disadvantage arms. Your app supplies `false` only when the bearer cannot see any source of fear. |
| `targetCanSeeAttacker` | `boolean` | `AttackIntent`, `ResolveAttackInput` | default-apply (undefined → true) | Dodge's `ImposeDisadvantageOnAttackers`. Per-attacker (not per-bearer). Your app supplies `false` only when the target cannot see this specific attacker. |
| `lightLevel` | `'bright' \| 'dim' \| 'darkness'` | check + attack intents | opt-in (undefined → predicate evaluates false) | Cloak of the Bat Stealth advantage (gates on dim or darkness); Kobold Warrior Sunlight Sensitivity (gates on bright). |
| `attackerHasAllyAdjacentToTarget` | `boolean` | `AttackIntent`, `ResolveAttackInput` | opt-in (undefined → no advantage); engine auto-derives from positions when the target is positioned | Monster Pack Tactics. Position-aware consumers don't need to populate this; the engine derives it from grid positions. Position-less consumers supply the boolean. |

Full per-row context (entry points, RAW citations, slice history) lives in [starter-pack-gaps.md](starter-pack-gaps.md) "Consumer-coordinated fact slots".

### How the defaults are chosen

Two semantic flavors:

- **Default-apply** fits a RAW arm describing a *penalty* the bearer suffers under a typical condition ("Frightened applies disadvantage unless ..."). Leaving the value undefined preserves prior behavior; your app opts out per intent.
- **Opt-in** fits a RAW arm describing a *benefit* gated on a specific narrative context ("Stealth advantage while in dim light or darkness"). The bearer must explicitly receive the value to gain the benefit.

If you wire none of these, the engine stays correct for the things it derives from rolls and reduces from events. The gated behaviors above degrade gracefully: Frightened still applies disadvantage everywhere; Dodge still imposes disadvantage on every attacker; Pack Tactics simply doesn't fire (which is the safest direction to be wrong in).

## Quick decision guide

When you're integrating and wondering whether something is your job:

- **Does it come out of a roll or a rule resolution?** Engine tracks it.
- **Is it a position, a sight line, a lighting condition, or a narrative judgment?** Your app tracks it.
- **Is it a player decision the rules pause for?** Engine surfaces the `ChoiceRequired`; your app collects the selection and emits `ChoiceResolved`.
- **Is it a reaction window?** Engine surfaces it as an event; your app decides whether to invoke the reaction planner.
- **Is it a spell area's targets?** Your app supplies the `targetIds` array.
- **Is it the engine's job, but the engine deviates from RAW because a fact slot is undefined?** Wire the slot in your app (see the consumer-coordinated table above) and the engine becomes strict-RAW for that arm.

If you're unsure about a specific mechanic and the table above doesn't answer it, the canonical reference is the planner source under [../src/engine/plan/](../src/engine/plan/) — the intent shape tells you what the engine expects from you.
