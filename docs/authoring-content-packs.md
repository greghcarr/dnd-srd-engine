# Authoring content packs

`dnd-srd-engine` ships only the rules engine and an SRD 5.2.1 starter content pack. Anything beyond that SRD scope (the full 2024 PHB / DMG / MM, third-party content, your campaign's homebrew) you write yourself, as your own content pack(s). This guide is the reference for doing that. (For what the starter pack already ships, see [status.md](status.md).)

It assumes you've already read [getting-started.md](getting-started.md) and [concepts.md](concepts.md). If you haven't, those explain what a content pack *is* and how it fits into the engine. This document is about *what to put in one*.

## Pack file shape

A content pack is one JSON file shaped like this:

```jsonc
{
  "id": "my-pack",
  "name": "My Pack",
  "version": "0.1.0",

  // Optional metadata. Recommended if the pack derives from a licensed work.
  "license": "CC-BY-4.0",
  "attribution": "Derived from ...",
  "derivedFrom": "...",

  // Every list defaults to []; include only the categories you need.
  "species": [],
  "backgrounds": [],
  "classes": [],
  "subclasses": [],
  "feats": [],
  "spells": [],
  "items": [],
  "monsters": [],
  "conditions": []
}
```

`id`, `name`, and `version` are the only required top-level fields. Every other category list is optional and defaults to empty.

## Loading and validation workflow

```ts
import { loadContentPack, resolveContent, validateCrossReferences } from 'dnd-srd-engine';

const raw = JSON.parse(fs.readFileSync('my-pack.json', 'utf-8'));

// Step 1: Zod parse. Throws ContentPackLoadError with a list of path-pointed
// issues on shape error.
const pack = loadContentPack(raw);

// Step 2: Resolve and merge with other packs (e.g., the starter).
const content = resolveContent([loadStarterPack(), pack]);

// Step 3: Cross-reference validation. Catches dangling IDs (e.g., a background's
// originFeatId pointing at a feat that doesn't exist). Returns a list of
// {path, message, suggestion?} entries.
const issues = validateCrossReferences(content);
for (const issue of issues) {
  console.error(`${issue.path}: ${issue.message}${issue.suggestion ? ' (' + issue.suggestion + ')' : ''}`);
}
```

Multiple packs merge into one global per-category id namespace. A cross-pack id collision throws unless the later pack declares that id in its `overrides` list (then the later entry intentionally wins). This is how you layer "starter + setting + table homebrew" without silent clobbering.

## Entity reference

Each section below covers one entity category. Required fields are marked **required**; everything else has a sensible default and can be omitted.

### Species

```json
{
  "id": "human",
  "name": "Human",
  "size": "Medium",
  "creatureType": "Humanoid",
  "speed": { "walk": 30 },
  "languages": ["common"],
  "traits": []
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Unique within the pack |
| `name` | string | yes | Display name |
| `size` | `Tiny`/`Small`/`Medium`/`Large`/`Huge`/`Gargantuan` | yes | |
| `creatureType` | string | no, default `Humanoid` | |
| `speed` | `{ walk, fly?, swim?, burrow?, climb? }` | yes | Each is feet/round |
| `languages` | string[] | no, default `[]` | |
| `traits` | `Effect[]` | no, default `[]` | See the Effect primitives section below |

### Background

```json
{
  "id": "soldier",
  "name": "Soldier",
  "abilityScoreIncreases": {
    "options": ["STR", "DEX", "CON"],
    "pattern": "+2/+1"
  },
  "skillProficiencies": ["athletics", "intimidation"],
  "toolProficiencies": ["gaming"],
  "originFeatId": "savage-attacker"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | |
| `name` | string | yes | |
| `abilityScoreIncreases.options` | `AbilityScore[]` | yes | 2024 player picks how to distribute |
| `abilityScoreIncreases.pattern` | `'+2/+1'` or `'+1/+1/+1'` | yes | |
| `skillProficiencies` | `Skill[]` | no, default `[]` | |
| `toolProficiencies` | string[] | no, default `[]` | |
| `languages` | string[] | no, default `[]` | |
| `originFeatId` | string | yes | Must point at a real feat |
| `traits` | `Effect[]` | no, default `[]` | |

### Class

Classes are the longest entity. The `levelTable` carries per-level features and any class-table columns (Sneak Attack dice, Channel Divinity uses, etc.).

```json
{
  "id": "fighter",
  "name": "Fighter",
  "hitDie": 10,
  "primaryAbility": ["STR", "DEX"],
  "savingThrowProficiencies": ["STR", "CON"],
  "armorProficiencies": ["light", "medium", "heavy", "shield"],
  "weaponProficiencies": ["simple", "martial"],
  "skillChoices": { "choices": 2, "from": ["acrobatics", "athletics", "history", "insight", "perception", "persuasion", "survival"] },
  "levelTable": {
    "1": { "proficiencyBonus": 2, "features": [{ "id": "second-wind", "name": "Second Wind", "effects": [/* ... */] }], "columns": {} },
    "2": { "proficiencyBonus": 2, "features": [], "columns": {} },
    "5": { "proficiencyBonus": 3, "features": [{ "id": "extra-attack", "name": "Extra Attack", "effects": [{ "kind": "ModifyActionEconomy", "op": "extraAttack", "count": 1 }] }], "columns": {} }
  },
  "subclassLevel": 3,
  "spellcasting": { "ability": "INT", "type": "full" }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | |
| `name` | string | yes | |
| `hitDie` | `4`/`6`/`8`/`10`/`12` | yes | Sides of the class's hit die |
| `primaryAbility` | `AbilityScore[]` | yes | At least one |
| `savingThrowProficiencies` | `AbilityScore[]` | yes | Exactly two |
| `armorProficiencies` | string[] | no, default `[]` | |
| `weaponProficiencies` | string[] | no, default `[]` | |
| `toolProficiencies` | string[] | no, default `[]` | |
| `skillChoices` | `{ choices, from }` | no | |
| `levelTable` | `Record<'1'..'20', LevelEntry>` | yes | One entry per level |
| `subclassLevel` | number | no | Level at which subclass is chosen |
| `spellcasting` | `{ ability, type }` | no | `type` is `full`, `half`, `third`, or `pact` |

**`LevelEntry`**: `{ proficiencyBonus: number, features: ClassFeature[], columns: Record<string, ...> }`. The `columns` object is for class-table columns the engine doesn't know about by name (e.g., a custom homebrew "Karma Points" column); the engine reads them by name when a Formula references them.

**`ClassFeature`**: `{ id, name, effects: Effect[] }`. The `id` is the dedupe key — multiple features with the same id at different levels are reduced to the *highest-level* one. That's how Sneak Attack scales: each odd level ships a `sneak-attack` feature with a larger `AddDamage` dice expression, and the engine picks the right one for the character's level.

### Subclass

```json
{
  "id": "champion",
  "parentClassId": "fighter",
  "name": "Champion",
  "levelGrants": {
    "3": [{ "id": "improved-critical", "name": "Improved Critical", "effects": [/* ... */] }],
    "7": [{ "id": "remarkable-athlete", "name": "Remarkable Athlete", "effects": [/* ... */] }]
  }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | |
| `parentClassId` | string | yes | Must point at a real class |
| `name` | string | yes | |
| `levelGrants` | `Record<level, ClassFeature[]>` | no, default `{}` | |

Subclass features dedupe by id the same way class features do.

### Feat

```json
{
  "id": "savage-attacker",
  "name": "Savage Attacker",
  "category": "origin",
  "repeatable": false,
  "prerequisites": [],
  "effects": [{ "kind": "Custom", "handlerId": "savage-attacker-reroll-damage" }]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | |
| `name` | string | yes | |
| `category` | `'origin'`/`'general'`/`'fighting-style'`/`'epic-boon'` | yes | |
| `repeatable` | boolean | no, default `false` | |
| `prerequisites` | string[] | no, default `[]` | Free-text strings; not enforced by the engine |
| `effects` | `Effect[]` | no, default `[]` | |

### Spell

```json
{
  "id": "fireball",
  "name": "Fireball",
  "level": 3,
  "school": "evocation",
  "castingTime": "Action",
  "range": "150 feet",
  "components": { "verbal": true, "somatic": true, "material": "a tiny ball of bat guano and sulfur" },
  "duration": "Instantaneous",
  "concentration": false,
  "ritual": false,
  "classes": ["sorcerer", "wizard"],
  "targeting": { "shape": "sphere", "size": 20 },
  "mechanicalEffects": [
    {
      "kind": "save",
      "ability": "DEX",
      "damageDice": "8d6",
      "damageType": "fire",
      "halfOnSuccess": true,
      "extraDicePerSlotLevel": 1
    }
  ]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | |
| `name` | string | yes | |
| `level` | `0`-`9` | yes | `0` for cantrips |
| `school` | spell school | yes | |
| `castingTime` | string | yes | Free text (`'Action'`, `'Bonus Action'`, `'1 minute'`, ...) |
| `range` | string | yes | Free text (`'Self'`, `'30 feet'`, ...) |
| `components` | `{ verbal, somatic, material? }` | yes | |
| `duration` | string | yes | Free text |
| `concentration` | boolean | no, default `false` | |
| `ritual` | boolean | no, default `false` | |
| `classes` | string[] | no, default `[]` | Class IDs that can prepare this spell |
| `description` | string | no | |
| `targeting` | `{ shape, size }` | no | AoE shape; `shape` is `cone`/`cube`/`line`/`sphere`/`cylinder` |
| `mechanicalEffects` | `SpellMechanic[]` | no, default `[]` | See below |

`SpellMechanic` is a discriminated union by `kind`. It has fourteen kinds:

| `kind` | Use | Fields |
|---|---|---|
| `attack` | A spell attack roll (Eldritch Blast, Fire Bolt). `damageType` can be replaced by `casterChoosesDamageType: { allowed: DamageType[] }` so the caster picks at cast time (Chromatic Orb). | `damageDice`, `damageType?` or `casterChoosesDamageType?`, `extraDicePerSlotLevel?`, `cantripScalingDice?` |
| `save` | A saving throw — may or may not deal damage, may apply a condition. Optional `casterChoosesVariant: { variants: [{key, conditionId}] }` lets the caster pick which condition lands (Calm Emotions, Command, Bestow Curse). Optional `pushedFeetOnFail` emits `CreaturePushed` (Gust of Wind). | `ability`, `damageDice?`, `damageType?`, `halfOnSuccess?`, `conditionOnFail?` or `casterChoosesVariant?`, `pushedFeetOnFail?`, `extraDicePerSlotLevel?`, `cantripScalingDice?` |
| `heal` | Healing a target | `amountDice?`, `flatAmount?`, `extraDicePerSlotLevel?` (at least one of `amountDice` / `flatAmount`) |
| `temp-hp` | Grant temporary HP (False Life). RAW max-not-additive semantics. | `amountDice?`, `flatAmount?`, `extraPerSlotLevel?` |
| `auto-hit` | N darts, no save / no roll (Magic Missile) | `damageDicePerDart`, `damageType`, `dartsAtBaseSlot`, `extraDartsPerSlotLevel` |
| `buff` | Apply a condition with no save (Bless, Mage Armor). Optional `casterChoosesVariant` for spells where the caster picks at cast time (Enlarge/Reduce, Enhance Ability, Spirit Shroud, Protection from Energy, Fire Shield). | `conditionId?` or `casterChoosesVariant?` |
| `remove-condition` | Strip the first matching condition from each target (Lesser Restoration) | `eligibleConditionIds` (min 1) |
| `hp-pool-knockout` | Roll a dice pool; walk targets in ascending-HP order and apply `conditionId` until the pool runs out (Sleep). Targets already carrying the condition are skipped. | `poolDice`, `extraPoolDicePerSlotLevel?`, `conditionId` |
| `aura-damage` | Concentration aura (Spirit Guardians, Cloud of Daggers, Hunger of Hadar, Wall of X). Cast-time emits only `ConcentrationStarted`; damage / condition fires later via `engine.plan.tickAura({casterId, targetIds, trigger?})`. Optionality matrix: omit `saveAbility` for no-save (Cloud of Daggers); omit `damageDice` / `damageType` for condition-only (Entangle); omit `conditionOnFail` for damage-only. Optional `trigger` tag (`on-enter` / `on-turn-start` / `on-turn-end`) gates multi-component zones. | `rangeFeet`, `saveAbility?`, `damageDice?`, `damageType?`, `halfOnSuccess?`, `conditionOnFail?`, `trigger?`, `extraDicePerSlotLevel?` |
| `movement-damage` | Per-foot-moved damage zone (Spike Growth). Consumer detects movement and calls `engine.plan.tickMovementDamage({casterId, targetId, feetMoved})`. Distinct from `aura-damage` so per-tick vs per-traversal semantics stay legible. | `rangeFeet`, `damageDicePerFiveFeet`, `damageType` |
| `recurring` | Per-turn effect while concentrating (Heroism). Consumer calls `engine.plan.tickRecurring({casterId, targetId})` at the start of each target's turn. `effect` is `temp-hp` / `heal` / `damage`. | `effect`, `amountDice?`, `flatAmount?`, `addCasterAbilityMod?`, `damageType?` |
| `summon` | Creates a controlled companion (find-familiar, summon-X family, find-steed, animate-dead, phantom-steed, etc.). Emits `CompanionSummoned`; the reducer instantiates a Character with `summonSource` pointing to controller / spell / slot / effect. HP scales by slot level. Concentration auto-dismiss. | `name`, `ac`, `hpBase`, `hpPerSlotAbove?`, `baseSlotLevel`, `speedFeet?` |
| `trap` | Primes a placed trap (Glyph of Warding, Cordon of Arrows). Cast-time emits `TrapArmed`; the consumer detects the trigger condition and calls `engine.plan.triggerTrap({trapId, triggeringCharacterId})`. DC pre-baked from caster's spell save DC at arm time (or `fixedDC`). `damageType` can be `casterChoosesDamageType` (Glyph: caster picks from a list at cast). | `saveAbility`, `damageDice`, `damageType?` or `casterChoosesDamageType?`, `halfOnSuccess?`, `charges`, `label`, `fixedDC?` |
| `hp-threshold` | Reads each target's current HP and applies one of two arms by threshold (Power Word Kill / Power Word Stun). Each arm is `destroy` (emits `CreatureDestroyed`, bypassing death saves), `damage` (`damageDice` + `damageType`, run through the normal mitigation pipeline), or `condition` (`conditionId`, immunity-checked). | `threshold`, `atOrBelow` (arm), `above?` (arm) |

A spell can have multiple `mechanicalEffects` entries — for instance a spell that both damages and applies a condition would have two `save` entries (or one `save` with both `damageDice` and `conditionOnFail`).

**Empty `mechanicalEffects` is silently a no-op.** The spell will cast (declare + consume slot + concentration if applicable) but no further events will fire. Use this for utility cantrips intentionally; for anything else it's a bug.

### Item

Items are a discriminated union on `itemKind`. Six variants ship:

**Weapon**:
```json
{
  "id": "longsword",
  "itemKind": "weapon",
  "name": "Longsword",
  "category": "martial",
  "attackKind": "melee",
  "damageType": "slashing",
  "damageDice": "1d8",
  "versatileDice": "1d10",
  "properties": ["versatile"],
  "mastery": "Sap"
}
```

**Armor**:
```json
{
  "id": "chain-shirt",
  "itemKind": "armor",
  "name": "Chain Shirt",
  "category": "medium",
  "baseAC": 13,
  "dexCap": 2,
  "stealthDisadvantage": false
}
```

`category` is `light`, `medium`, `heavy`, or `shield`. Shields use `baseAC: 2` and are applied additively. Heavy armor ignores DEX. Medium armor caps DEX at +2 by default (override with `dexCap`).

**Magic item**:
```json
{
  "id": "wand-of-magic-missiles",
  "itemKind": "magic",
  "name": "Wand of Magic Missiles",
  "rarity": "uncommon",
  "requiresAttunement": false,
  "charges": { "max": 7, "recharge": "dawn", "rechargeFormula": "1d6+1" },
  "effects": []
}
```

**Tool**, **consumable**, and **gear** are also valid `itemKind` values. See `src/schemas/content/item.ts` for the full discriminated union.

### Monster

```json
{
  "id": "young-red-dragon",
  "name": "Young Red Dragon",
  "size": "Large",
  "type": "Dragon",
  "alignment": "chaotic-evil",
  "ac": 18,
  "hp": { "average": 178, "formula": "17d10+85" },
  "speed": { "walk": 40, "climb": 40, "fly": 80 },
  "abilityScores": { "STR": 23, "DEX": 10, "CON": 21, "INT": 14, "WIS": 11, "CHA": 19 },
  "savingThrows": { "DEX": 4, "CON": 9, "WIS": 4, "CHA": 8 },
  "skills": { "perception": 8, "stealth": 4 },
  "damageImmunities": ["fire"],
  "senses": { "blindsight": 30, "darkvision": 120 },
  "languages": ["draconic", "common"],
  "cr": 10,
  "xp": 5900,
  "proficiencyBonus": 4,
  "traits": []
}
```

Note that monster statblocks ship the *flat* values for AC, saves, and skills — the engine doesn't recompute these from abilities + proficiency. The `traits: Effect[]` field is where you'd attach things like "Legendary Resistance" or breath weapon usage triggers if you want them to fire automatically.

### Condition

```json
{
  "id": "blessed",
  "name": "Blessed",
  "stackable": false,
  "endsOn": [],
  "effects": [
    { "kind": "AddModifier", "target": "attack", "value": 2 },
    { "kind": "AddModifier", "target": { "kind": "save", "ability": "STR" }, "value": 2 }
  ]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | |
| `name` | string | yes | |
| `description` | string | no | |
| `effects` | `Effect[]` | no, default `[]` | |
| `stackable` | boolean | no, default `false` | Exhaustion is stackable; most others aren't |
| `endsOn` | `EndCondition[]` | no, default `[]` | See below |

`EndCondition` is one of: `{ kind: 'shortRest' }`, `{ kind: 'longRest' }`, `{ kind: 'turnEnd', ownerId? }`, `{ kind: 'saveSuccess', ability, dc }`, `{ kind: 'damageTaken' }`. Most conditions ship `endsOn: []`, meaning the condition persists until something else removes it (a spell ending, `ConditionRemoved` event, etc.).

## Effect primitives reference

Effects are the building blocks that classes, feats, species, items, and conditions all use. There are 62 effect kinds (61 primitives plus the `Custom` escape hatch); the canonical list lives in `EFFECT_KINDS` in [src/schemas/effects.ts](../src/schemas/effects.ts). The reference below documents the most-used kinds — for the full vocabulary including the recently added markers (`GrantUncannyDodge`, `GrantInnateSorcerySpendAlternative`, `GrantSelfRestoration`, `GrantMaxHealingDice`, `GrantUnarmedAsMagical`, `CancelAdvantageOnAttackers`, `ExpandAuraRange`, etc.), consult the schema.

### Modifiers and rolls

**`AddModifier`** — flat +/- to a roll or stat.
```json
{ "kind": "AddModifier", "target": "attack", "value": 2 }
{ "kind": "AddModifier", "target": { "kind": "save", "ability": "STR" }, "value": 2 }
{ "kind": "AddModifier", "target": "ac", "value": 1 }
```
Valid `target` values: `'ac'`, `'attack'`, `'damage'`, `'initiative'`, `'spellAttack'`, `'spellSaveDC'`, `'hpMax'` (not yet read by any derivation), `'speed'`, `'passivePerception'`, `{ kind: 'save', ability }`, `{ kind: 'check', ability }`, `{ kind: 'skill', skill }`.

**`SetAdvantage`** — grant advantage / disadvantage / auto-crit / auto-fail on the actor's own rolls.
```json
{ "kind": "SetAdvantage", "on": "attack", "mode": "disadvantage" }
```
`on` is the same shape as a `RollTarget` (`'attack'`, `'damage'`, `'initiative'`, or `{ kind: 'save'/'check'/'skill', ... }`).

**`GrantAdvantageToAttackers`** — when present on the *target's* effect stack, attackers gain advantage. Used by Faerie Fire's condition and the Restrained status. The attack planner consults the target's stack for this, not the attacker's.

**`ImposeDisadvantageOnAttackers`** — mirror of `GrantAdvantageToAttackers`: attacks against the bearer roll with disadvantage. Used by the Dodge action's `dodged` condition.

**`SetAdvantageVsSource`** — direction-filtered advantage. Only applies when the roll's target equals the bearing applied condition's `sourceCharacterId`. Used by Bestow Curse's "Disadvantage on attack rolls against the caster" variant. No effect when the bearing condition has no `sourceCharacterId`.
```json
{ "kind": "SetAdvantageVsSource", "on": "attack", "mode": "disadvantage" }
```

### Resistance / immunity / vulnerability

```json
{ "kind": "GrantResistance", "damageType": "fire" }
{ "kind": "GrantImmunity", "damageType": "poison" }
{ "kind": "GrantVulnerability", "damageType": "radiant" }
{ "kind": "GrantConditionImmunity", "conditionId": "paralyzed" }
```

`damageType` accepts the literal `'all'` for blanket resistance / immunity.

### AC

**`OverrideACFormula`** — replaces the equipment-based AC with a custom formula.
```json
{ "kind": "OverrideACFormula", "base": 10, "abilityModifiers": ["DEX", "CON"] }
```
Used by Unarmored Defense (Barbarian: base 10, DEX + CON), Monk (DEX + WIS), Draconic Sorcerer (13 + DEX), and Mage Armor (13 + DEX). `base` can be a number or `'dex'`/`'con'`/`'wis'`.

**`SetACFloor`** — bumps the natural AC up to `value` if it would otherwise be lower. Used by Barkskin (AC can't be lower than 17 regardless of armor). Multiple floors fold to the highest. Distinct from `OverrideACFormula` (which replaces the formula entirely and only applies unarmored).
```json
{ "kind": "SetACFloor", "value": 17 }
```

### Movement and senses

```json
{ "kind": "ModifySpeed", "mode": "walk", "op": "set", "value": 40 }
{ "kind": "GrantSense", "sense": "darkvision", "range": 60 }
```

### Resources

**`GrantResource`** — defines a per-character resource (Rage uses, Bardic Inspiration dice, Ki points, Action Surge uses).
```json
{ "kind": "GrantResource", "resourceId": "rage", "max": 2, "recharge": "longRest" }
{ "kind": "GrantResource", "resourceId": "bardic-inspiration", "max": 4, "recharge": "longRest", "diceSize": 6 }
```

**`RecoverResource`** — restores a resource at the named cadence.
```json
{ "kind": "RecoverResource", "resourceId": "rage", "amount": "all", "when": "longRest" }
```

### Spellcasting

```json
{ "kind": "GrantSpellSlots", "level": 1, "count": 2, "source": "full" }
{ "kind": "GrantSpell", "spellId": "magic-initiate-fire-bolt", "preparation": "at-will" }
{ "kind": "ExpandSpellList", "classId": "wizard", "spellIds": ["bless"] }
```

### Action economy

```json
{ "kind": "ModifyActionEconomy", "op": "extraAttack", "count": 1 }
{ "kind": "GrantAction", "actionId": "second-wind", "name": "Second Wind", "cost": "bonusAction", "resourceCost": { "resourceId": "second-wind", "amount": 1 } }
```

### Triggers

**`OnEvent`** — the most powerful effect kind. Fires actions when a matching event happens.

```json
{
  "kind": "OnEvent",
  "id": "sneak-attack",
  "trigger": {
    "eventType": "AttackRolled",
    "filter": {
      "kind": "all",
      "terms": [
        { "kind": "eq", "path": "event.attackerIsSelf", "value": true },
        { "kind": "eq", "path": "event.hit", "value": true },
        { "kind": "eq", "path": "event.used", "value": "advantage" }
      ]
    }
  },
  "actions": [{ "kind": "AddDamage", "dice": "3d6", "damageType": "piercing" }],
  "oncePer": "turn"
}
```

`oncePer` (`'turn'`, `'round'`, `'shortRest'`, `'longRest'`) limits firing cadence. Optional `consumeOnTrigger: true` lifts the parent condition after firing (one-shot smite-style riders). Actions can be `AddDamage` (damages event.targetId), `AddDamageToAttacker` (damages event.attackerId; Fire Shield, Armor of Agathys), `Heal`, `ApplyCondition` (stamps a condition on event.targetId; Spirit Shroud's heal-block), `SpendResource`, `ModifyDamageTaken`, or `EmitEvent`. The `filter` is a recursive Predicate (`all`, `any`, `eq`, etc.) over event facts. Available facts on `AttackRolled` include `event.attackerIsSelf`, `event.targetIsSelf`, `event.hit`, `event.critical`, `event.used`, `event.weaponInstanceId`, `event.attackerHasAllyAdjacentToTarget`, `event.attackerIsSource` (true when the attacker matches the bearing applied condition's source).

### Proficiencies

```json
{ "kind": "GrantProficiency", "target": "skill", "id": "perception", "level": "proficient" }
{ "kind": "GrantProficiency", "target": "skill", "id": "stealth", "level": "expertise" }
{ "kind": "GrantProficiency", "target": "save", "id": "WIS", "level": "proficient" }
```

`level` is `none`, `half`, `proficient`, or `expertise`.

### Player choice

**`OfferChoice`** — emits a `ChoiceRequired` event that the consumer resolves via `ChoiceResolved`. Used for level-up decisions (ASI vs feat, fighting style pick, subclass pick).
```json
{
  "kind": "OfferChoice",
  "choiceId": "fighter-fighting-style",
  "prompt": "Choose a Fighting Style",
  "when": "onLevelUp",
  "oneOf": 1,
  "options": [
    { "id": "defense", "label": "Defense", "effects": [{ "kind": "AddModifier", "target": "ac", "value": 1, "condition": { "kind": "hasProperty", "path": "armor.equipped", "value": true } }] }
  ]
}
```

### Damage shaping

```json
{ "kind": "FlatDamageReduction", "damageTypes": ["bludgeoning", "piercing", "slashing"], "amount": 3 }
{ "kind": "SetHPMaxFormula", "formula": { "kind": "add", "left": { "kind": "constant", "value": 5 }, "right": { "kind": "abilityMod", "ability": "CON" } } }
```

**`BlockHealing`** — bearer cannot regain hit points. `planHealMechanic` consults the effect stack and, when set, emits Healed with amount=0 plus a `(blocked)` annotation in the event's `source` field. Used by Spirit Shroud's `healing-blocked-active`.
```json
{ "kind": "BlockHealing" }
```

**`BoostHealing`** — additive boost to outgoing heals when the caster has this effect. Used by Disciple of Life.
```json
{ "kind": "BoostHealing", "flat": 2, "perSpellLevel": 1 }
```

**`GrantEvasion`** — flips the DEX-save half-on-success path to (success → 0, fail → half). Used by Rogue L7 and Monk L7.
```json
{ "kind": "GrantEvasion" }
```

**`GrantFallingProtection`** — short-circuits `engine.plan.falling` to no damage events while present. Used by Feather Fall's `feather-falling-active` condition.
```json
{ "kind": "GrantFallingProtection" }
```

**`ExpandCritRange`** — lowers the natural-d20 threshold at which the attacker's weapon attacks crit. Default 20; Improved Critical sets 19. Multiple sources fold to the lowest.
```json
{ "kind": "ExpandCritRange", "threshold": 19 }
```

**`GrantHalfProficiencyBonusFloor`** — adds `floor(profBonus / 2)` to ability checks when no explicit proficiency contribution applies. Used by Bard Jack of All Trades.
```json
{ "kind": "GrantHalfProficiencyBonusFloor" }
```

**`GrantAura`** — declarative metadata for consumers to project a condition onto in-range allies. The engine doesn't auto-project (position is consumer territory). Used by paladin Aura of Protection / Courage, and the Crusader's Mantle spell.
```json
{ "kind": "GrantAura", "auraId": "aura-of-protection", "rangeFeet": 10, "allyConditionId": "aura-of-protection-blessed" }
```

### Custom

**`Custom`** — escape hatch for genuinely-procedural mechanics that don't fit a primitive (Wild Shape's form library, Wish's narrative response, Simulacrum's clone management).
```json
{ "kind": "Custom", "handlerId": "wild-shape-beast-form-selection", "params": { "cr": 1 } }
```
Custom effects do nothing unless the consumer supplies a handler with the same `handlerId` to `createEngine` (in `opts.handlers` or a `ContentBundle`), and invokes it via `engine.plan.custom(...)`.

## Common patterns (cookbook)

### Spell that deals damage on save

```json
{ "kind": "save", "ability": "DEX", "damageDice": "3d6", "damageType": "fire", "halfOnSuccess": true, "extraDicePerSlotLevel": 1 }
```
Damage is rolled once for the whole spell and applied to each target with full/half based on their save. `halfOnSuccess: false` (the default) means saves take zero.

### Spell that applies a condition on failed save

```json
{ "kind": "save", "ability": "WIS", "conditionOnFail": "frightened" }
```
The named condition is applied to each target that fails. If the spell is concentration, the condition lifts when concentration ends.

### Spell that buffs willing targets (no save)

```json
{ "kind": "buff", "conditionId": "blessed" }
```
The condition's `effects[]` carries the actual mechanical impact.

### Class feature that scales with level

Ship multiple features with the **same `id`** at the levels you want to step at:

```json
"3": { "features": [{ "id": "sneak-attack", "name": "Sneak Attack (2d6)", "effects": [/* 2d6 dice */] }] },
"5": { "features": [{ "id": "sneak-attack", "name": "Sneak Attack (3d6)", "effects": [/* 3d6 dice */] }] }
```

The effect-stack collector dedupes by `id` and keeps the highest-level version. A level-5 Rogue gets only the 3d6 entry.

### Condition that affects attackers

For "while affected by this condition, attacks against this character have advantage" (Faerie Fire, Restrained), use `GrantAdvantageToAttackers` on the condition, not `SetAdvantage`:

```json
{
  "id": "faerie-fired",
  "name": "Faerie Fired",
  "effects": [{ "kind": "GrantAdvantageToAttackers" }]
}
```

`SetAdvantage` affects the actor's own rolls; it's the wrong primitive for "attackers against me".

### Magic item with charges

```json
{
  "id": "wand-of-magic-missiles",
  "itemKind": "magic",
  "name": "Wand of Magic Missiles",
  "rarity": "uncommon",
  "requiresAttunement": false,
  "charges": { "max": 7, "recharge": "dawn", "rechargeFormula": "1d6+1" }
}
```

Consumers emit `ItemChargeConsumed` and `ItemRecharged` events to drive this; the engine enforces the charge ceiling and the recharge cadence.

### Trigger that fires once per turn

```json
{
  "kind": "OnEvent",
  "id": "savage-attacker",
  "trigger": { "eventType": "DamageRolled", "filter": { "kind": "eq", "path": "event.attackerIsSelf", "value": true } },
  "actions": [/* re-roll once and take higher */],
  "oncePer": "turn"
}
```

The cadence machinery prevents the same trigger from firing twice on the same turn. The `id` is the dedupe key (per-character).

## Pitfalls

- **Empty `mechanicalEffects` on a leveled spell** silently produces a working cast that does nothing. Casters lose the slot, no other events fire. If a spell isn't doing anything, check `mechanicalEffects` first.
- **`SetAdvantage` vs `GrantAdvantageToAttackers`**: the first affects the actor's own rolls, the second affects attacks against the actor. They are not symmetric.
- **`AddModifier` with target `hpMax`** parses fine but no derivation reads it yet. HP max comes from the `Character.hp.max` field directly. (This is a known engine gap.)
- **Variant-rule flags** in `CampaignSettings` (gritty rest, hero points, sanity, mass combat) are toggles only. The engine doesn't read them; consumer planner code does.
- **Concentration and time** — concentration spells stay active until the caster's concentration breaks (damage, new concentration spell, unconsciousness, long rest). The engine does not expire them after 1 minute / 1 hour / etc. If you want time-based expiration, the consumer emits `ConcentrationBroken` themselves.
- **Duplicate IDs across packs** — later packs win. This is by design (homebrew can override starter content) but easy to do accidentally.
- **Cross-references at load time, not cast time** — if `background.originFeatId` points at a feat that doesn't exist, `validateCrossReferences` will catch it. But a spell's `classes: ['rogue']` is not checked against the registered classes — that's a free string list, not a typed reference. Same for monster `traits` effects referencing missing condition IDs.

## Composition

Multiple packs merge by category into a global per-category id namespace, in array order:

```ts
const engine = createEngine({
  contentPacks: [
    loadStarterPack(),       // SRD-derived baseline
    loadSettingPack(),        // your campaign world
    loadHomebrewPack(),       // table-specific tweaks
  ],
});
```

**Id collisions are an error, not a silent overwrite.** `resolveContent` (called by `createEngine`) throws a `ContentPackLoadError` if two packs define the same id in the same category, so a homebrew pack can't accidentally clobber an SRD entry you didn't mean to touch. To *intentionally* replace an entry, the later pack must declare the id in its `overrides`:

```jsonc
{
  "id": "my-homebrew",
  "name": "Table Homebrew",
  "version": "1.0.0",
  "overrides": ["fireball"],          // we KNOW we're replacing the SRD fireball
  "spells": [{ "id": "fireball", /* our houserule version */ }]
}
```

With `fireball` declared in `overrides`, the homebrew version wins (later packs override). Without it, the load throws and names the colliding id + the pack it came from. Within-pack duplicates are always an error (no `overrides` escape). There's no field-level merge: an override replaces the whole entry, so copy the starter version into your pack and edit it if you mean to extend rather than replace.

This is why **non-SRD content belongs in its own pack, never appended to `starter-pack.json`**: the starter pack is drift-audited against SRD 5.2.1 and is the licensable baseline. A separate pack keeps your additions IP-clean and lets the collision policy protect the SRD ids.

## When to write code instead of content

The `Custom` effect kind plus the handler registry is the escape hatch for mechanics that legitimately resist the primitive vocabulary. Use a `Custom` effect with a `handlerId` when:

- The mechanic involves freeform narrative (Wish).
- The mechanic involves picking from a large dynamic library (Wild Shape's beast forms).
- The mechanic is iterative or conditional in ways the existing primitives can't express.

Supply the handler to `createEngine` (keyed by `handlerId`), then invoke it via `engine.plan.custom`:

```ts
const engine = createEngine({
  contentPacks: [loadStarterPack(), myPack],
  handlers: {
    action: {
      'my-custom-handler': {
        // ctx: { state (read-only), content, rng, at, helpers }; params: caller-supplied
        plan(ctx, params) {
          return [/* Event[] */];
        },
      },
    },
  },
});

engine.plan.custom(state, { handlerId: 'my-custom-handler', params: { /* ... */ } });
```

A handler can also travel with its pack as a single `ContentBundle` (`{ pack, handlers }`) fed to `createEngine({ bundles: [...] })`. See [docs/plugin-api-design.md](plugin-api-design.md) for the full `HandlerContext` surface and the determinism contract (handlers run at plan time, consume `ctx.rng`, and bake rolls into the events they return).

If you find yourself writing handlers for things that aren't genuinely procedural (e.g., "a feat that adds +2 to one ability"), the right answer is almost always an existing primitive — file an issue with the use case if a primitive feels missing.

## Validating before shipping

Before publishing a content pack:

1. `loadContentPack(myJson)` — catches shape errors with path-pointed Zod issues.
2. `validatePacks([loadStarterPack(), pack])` — the report-all author-time check: returns *every* id collision (within-pack duplicates and undeclared cross-pack clobbers) plus *every* dangling cross-reference, each with a Levenshtein-suggested fix ("Did you mean 'savage-attacker'?"), without throwing on the first. This is the one to run while authoring.
3. `resolveContent([loadStarterPack(), pack])` — the engine's load path; throws a `ContentPackLoadError` on the first disallowed collision. Passing `validatePacks` first means this won't surprise you at `createEngine` time.

Run these in CI. `validatePacks` returns a structured `ContentValidationIssue[]`, so you can fail fast on a non-empty result with a non-zero exit code. (`validateCrossReferences(resolveContent(...))` remains available if you want the dangling-ref pass alone over already-merged content.)

## Reference: full starter pack

[src/content/packs/starter-pack.json](../src/content/packs/starter-pack.json) is the most complete worked example. It carries every entity kind and exercises most of the effect primitives. If a pattern doesn't appear in this guide, search the starter pack for an example before falling back to source.
