# API overview

The public surface is everything re-exported from [src/index.ts](../src/index.ts). Anything not exported is internal and may change without notice.

## Engine

```ts
const engine = createEngine({ contentPacks, rng, handlers? });
```

Returns an `Engine` with five namespaces:

- `engine.createCampaign({ name })` builds a fresh `Campaign` with an empty state.
- `engine.apply(state, event)`, `engine.applyAll(state, events)`, `engine.replay(events)`: pure state transitions.
- `engine.commit(campaign, events)`: append events to a campaign, returning the new campaign.
- `engine.undo(campaign)`, `engine.redo(campaign)`: move the cursor along the log.
- `engine.plan.*`: planners that consume RNG and return events to commit. See [planners](#planners).
- `engine.derive.*`: pure derivations that read state and return typed results. See [derivations](#derivations).

Also exported: `engine.do(campaign, intent)` (dispatches on `intent.type` to the right planner and commits in one call), `engine.content` (the resolved content pack), `engine.schemaVersion`, `engine.rng`.

## Planners

Every planner returns `{ events: Event[] }` (or `{ events, ...outcome }` for the handful that surface a derived bool / id / d4 alongside the chain). RNG-consuming planners bake the dice rolls into the resolution events; `apply()` is RNG-free.

**Encounter lifecycle**: `createEncounter`, `rollInitiative`, `startEncounter`, `beginFirstTurn`, `advanceTurn`, `endEncounter`.

**Combat (attack-side)**: `attack`, `cleave`, `opportunityAttack`, `actionSurge`, `offHandAttack`, `multiattack`, `falling`. Plus mastery-specific `weaponMastery({mastery, ...})`.

**Combat (defense-side)**: `dodge`, `shield`, `absorbElements`, `sanctuaryWardSave`, `protection`, `consumeGuidance`, `consumeResistance`, `cuttingWords`. Each is a dedicated reaction planner the consumer calls after observing the trigger event. `consumeResistance` (Resistance cantrip, slice 369) rolls the 1d4 and emits a compensating `Healed` for the reduction when the `resisted` creature takes the chosen damage type (mirrors `absorbElements`; the once-per-turn cap + chosen type are consumer-coordinated). `sanctuaryWardSave` is the inverse direction: called BEFORE an attack against a sanctuary-warded creature, rolling the attacker's WIS save and emitting `SanctuaryProtected` on failure so the consumer drops the attack. `protection` (slice 120, Protection Fighting Style) rolls a fresh d20 the consumer pairs with the original AttackRolled.d20 as disadvantage; gates on `GrantProtectionFightingStyle` + shield equipped + reaction available; position / vision preconditions stay consumer-side.

**Class-specific actions**: `sacredWeapon` (Paladin Devotion), `recklessAttack` (Barbarian), `stunningStrike` (Monk), `flurryOfBlows` (Monk: spend 1 Focus Point → two Unarmed Strikes as a Bonus Action, three at L10+), `patientDefense` (Monk: Disengage as a Bonus Action, or 1 Focus for Disengage + Dodge, +temp HP at L10+), `stepOfTheWind` (Monk: Dash as a Bonus Action, or 1 Focus for Disengage + Dash), `frenzy` (Barbarian Berserker), `metamagic` (Sorcerer), `wildCompanion` (Druid).

**Subclass-feature actions** (slices 350-358): `intimidatingPresence` (Barbarian Berserker L14: Bonus-Action WIS-save-or-Frightened over chosen targets), `dragonWings` (Draconic Sorcerer L14: Bonus-Action Fly Speed 60 self-buff), `preserveLife` (Life Domain Cleric L3: Channel-Divinity heal pool of 5× level among Bloodied allies, each capped at half max), `landsAid` (Circle of the Land Druid L3: expend Wild Shape for a 10-ft Sphere, CON save for 2d6 Necrotic half-on-success plus a 2d6 ally heal, scaling at L10/L14), `wholenessOfBody` (Warrior of the Open Hand Monk L6: Bonus-Action self-heal of the Martial Arts die + WIS mod), `peerlessSkill` (College of Lore Bard L14: spend a Bardic Inspiration die on the bard's own failed check/attack, refunded if it still fails; returns `{ events, dieRoll, turnedSuccess }`).

**Movement**: `move`, `dash`, `disengage`, `mistyStep`, `thunderStep` (slice 128: action, teleport caster + one willing ally within 5 ft up to 90 ft, AoE 3d10 thunder on origin with CON save half, +1d10 per slot above 3rd), `dimensionDoor` (slice 342: action, teleport up to 500 ft + one optional willing creature within 5 ft, arriving within 5 ft of the destination; no save/damage, occupied destinations rejected).

**Spellcasting (cast-time)**: `castSpell` (the general dispatcher), `magicWeapon`, `elementalWeapon`, `counterspell`, `dispelMagic`, `identify`, `removeCurse` (slice 134: strips every condition tagged `category: 'curse'` on the touched target), `silentImage` + `majorImage` (slice 137: places an Illusion entity; consumers use `investigateIllusion` to roll Investigation against the baked DC), `clairvoyance` + `scrying` (slices 135 + 136: places a remote Sensor entity bound to caster concentration; Scrying composes the same primitive with a target WIS save), `arcaneEye` (slice 138: places a mobile Sensor with darkvision 30).

**Spellcasting (tick / trigger)**: `checkConcentration`, `expireSpellDurations`, `tickAura`, `tickMovementDamage`, `tickRecurring`, `tickRecurringSave`, `triggerTrap`. Consumers call these at the appropriate moments (per-turn ticks, on-movement, on-trigger).

**Sensors & illusions**: `switchSensorMode` (toggles sight / hearing on a sensor; caster action), `moveSensor` (updates a mobile sensor's free-text location; caster bonus action; rejects non-mobile sensors and ownership mismatches), `removeSensor` (voluntary spell end), `investigateIllusion` (a creature spends an action to Study an illusion; rolls Investigation against the baked DC; success adds the investigator to `disbelievedBy`), `dismissIllusion` (voluntary spell end). `clearConcentrationEffect` automatically sweeps sensors and illusions linked to a dropped concentration via `sourceEffectInstanceId`.

**Summons**: `dismissCompanion`. Summoning happens via `castSpell` against a `summon` SpellMechanic (find-familiar, find-steed, the summon-X family); the planner emits `CompanionSummoned`.

**Transformations**: `polymorph`, `wildShape`, `simulacrum`, `wish`.

**Resurrection**: `resurrect({characterId, spellId, via})`. Supports `via: 'spell-slot' | 'scroll' | 'special'` so scroll consumption and special revivals can skip caster validation.

**Resting & resources**: `shortRest`, `longRest`, `rest` (generic dispatcher on rest kind).

**Inventory**: `equip` (enforces two-handed-vs-shield arbitration before stamping `ItemEquipped`).

**Contested actions**: `grapple`, `shove`, `hide`.

**Travel & exploration**: `forage`, `navigationCheck`, `forcedMarch`.

**NPC mechanics**: `moraleCheck`, `reactionRoll`.

**Variant rules**: `grantInitialHeroPoints`, `spendHeroPoint` (both require `CampaignSettings.heroPoints: true`).

**Checks & saves**: `save`, `abilityCheck`.

**Progression**: `levelUp`, `resolveChoice`.

## Derivations

All read-only and pure. Memoized per `CampaignState.version`.

- `character(state, id)` → `DerivedCharacter` (totalLevel, proficiency bonus, ability modifiers, HP, `hpMaxBonus` / `effectiveHpMax`, AC, saves, spell slots, pending choices, known languages).
- `ac(state, id)`, `savingThrow(state, id, ability)`, `attackBonus(state, id, weaponInstanceId)`.
- `spellSaveDC(state, id, classId)`, `spellAttackBonus(state, id, classId)`, `spellSlots(state, id)`.
- `abilityModifier(score)`, `proficiencyBonus(level)`: pure helpers.

Stand-alone derivations also exported from the public barrel:

- Effect-stack composition: `buildEffectStack` (returns an `EffectAccumulator` with `advantageFor`, `advantageVsSource`, `hasResistance`, `hasImmunity`, `flatDamageReductionFor`, `critThreshold`, `hasHealingBlocked`, `hasConditionImmunity`, ...).
- Spatial / movement: `terrainAt`, `movementCostFor`, `movementCostAt`, `chebyshevDistanceFeet`, `isInRangeFeet`, `hasLineOfSight`, `hasLineOfEffect`.
- Ability checks: `computeAbilityCheck`, `computePassiveScore`.
- Movement speed: `getEffectiveSpeeds(input)` (all modes; `walk` always, non-walk modes when > 0) and `getEffectiveSpeed(input)` (walk only). Each folds the effect stack's `ModifySpeed` entries per RAW (add / set / multiply / matchWalkSpeed, zero-speed wins).

Several helpers are intentionally engine-internal (used by planners, not on the public barrel): `mitigateDamage`, `isImmuneToCondition`, `isHealingBlocked`, `getCreatureType`, `computeCarryingCapacity`, `computeEncumbrance`, `interceptFatalDamage` (slice 111: planner-side fatal-damage clamp + bearing-condition consume), `isMagicWeaponAttack` (slice 112: weapon-magicality detector reading `temporaryBuff` and `itemKind`). Consumers compose these effects through the planner / event surface instead. `mitigateDamage` accepts a `characters?: Record<string, Character>` field (slice 105) for source-relative formula evaluation and a `sourceIsMagical?: boolean` (slice 112) for the resistance qualifier; every primary damage emitter populates both. `computeSavingThrow` accepts the same `sourceIsMagical?: boolean` (slice 131) for the Magic Resistance advantage fold; cast-spell, trap, recurring-save, and reactive-spells planners pass `true` (slice 133). The trigger dispatcher (slice 113) infers magicality per rider via `isRiderMagical` (spell-sourced via `sourceEffectInstanceId.spellId` → magical; AttackRolled rider with weaponInstanceId inherits from weapon; otherwise non-magical).

`EffectAccumulator.modifierSum(target, facts?)` and `modifierBreakdown(target, facts?)` (slice 115) accept caller-supplied facts so `AddModifier` entries with a `condition?: Predicate` are evaluated at sum time. `computeAttackBonus` populates `event.attackKind` from the weapon definition (slice 115); `computeAC` populates `bearer.wearingArmor` (slice 116). Predicate-less contributions continue to apply unconditionally.

`ModifierTarget` save/check wildcard (slice 299, mirror of slice-266 `RollTarget`): a `target: { kind: 'save' }` or `{ kind: 'check' }` entry with no `ability` field stores under a wildcard bucket and merges into every per-ability query. Lets "+1 to all saves" (Cloak of Protection, Stone of Good Luck, Bless) and "+1 to all checks" ship as a single entry each. Wildcard queries (`modifierSum({ kind: 'save' })` with no ability) return only the wildcard bucket — specific-ability entries don't bubble upward. Canonical users wired in slice 299: Stone of Good Luck, Cloak/Ring of Protection, `blessed` / `baned` / `aura-of-protection-active` conditions.

Predicate DSL kinds (slice 122 additions): `eq` / `gt` / `gte` for value comparisons, `hasProperty` / `hasCondition` / `damageType` for context queries, `self` / `always` / `never` for trivial cases, and `all` / `any` / `not` for composition. Numeric kinds (`gt`, `gte`) return false on missing or non-numeric values. Facts populated by the trigger dispatcher include `event.attackerIsSelf`, `event.targetIsSelf`, `event.hit`, `event.critical`, `event.attackKind` (slice 123: `'melee'` / `'ranged'`, read from the new required `AttackRolledEvent.attackKind` field), `event.weaponInstanceId`, `event.attackerIsSource`, `event.targetIsSource`, `event.attackerCreatureType`, `event.targetCreatureType`, and `bearer.tempHp` (slice 122).

**Consumer-supplied scene-state facts** (slices 263, 274, 276, 278, 279): several RAW gates depend on narrative context the engine doesn't model (line of sight, ambient light, skill sub-action, in-fiction sense). The consumer (UI, encounter manager, future VTT) supplies these via optional input fields on `AttackIntent` and `ComputeAbilityCheckInput`:

- `bearerCanSeeFearSource?: boolean` (slice 276, `AttackIntent` + `ComputeAbilityCheckInput`) — Frightened LoS gate. Default-apply (predicate is `not eq false`): undefined or true fires the disadvantage; explicit `false` bypasses.
- `targetCanSeeAttacker?: boolean` (slice 278, `AttackIntent`) — Dodge LoS gate, per-attacker. Default-apply.
- `lightLevel?: 'bright' | 'dim' | 'darkness'` (slice 279, `ComputeAbilityCheckInput`) — ambient-light gate (Cloak of the Bat Stealth). Opt-in: predicates require a specific value, undefined produces no match.
- `sense?: 'sight' | 'hearing' | 'smell' | 'touch' | 'taste'` (slice 263, `ComputeAbilityCheckInput`) — in-fiction sense gate (Eyes of the Eagle sight-only Perception). Opt-in.
- `athleticsSubAction?: 'climb' | 'swim' | 'jump' | 'grapple' | 'shove'` (slice 274, `ComputeAbilityCheckInput`) — Athletics sub-action gate (Gloves of Swimming and Climbing). Opt-in.

Two semantic flavors: **default-apply** for negative penalties (engine ships strict-RAW-broad behavior; consumer bypasses with explicit `false`) and **opt-in** for positive benefits (engine ships strict-RAW-narrow behavior; consumer specifies the right scene state to receive the benefit). Engine-side fact slots can land independently of consumer wiring; until the consumer populates a slot, the engine behaves per the documented default semantic.

## Events

Every state transition is an event. The discriminated union `Event` lives at `EventSchema` (Zod) and `Event` (TypeScript). The full list (~130 event types) is at [src/schemas/events/index.ts](../src/schemas/events/index.ts) in the `EVENT_TYPES` constant.

Grouped by category:

- **Combat**: `DamageApplied`, `Healed`, `TempHPGranted`, `HPMaxBonusChanged`, `ConditionApplied` (carries optional `sourceEffectInstanceId` since slice 110 so rider-applied conditions can be swept when their parent concentration ends), `ConditionRemoved`, `CreaturePushed`, `DeathSaveRolled`, `Stabilized`, `CreatureDestroyed` (slice 323: instant death bypassing death saves), `ExhaustionChanged`, `AttackRolled`, `DamageRolled`, `WeaponLoaded`, `SaveRolled`, `AbilityCheckRolled`.
- **Spellcasting**: `SpellCastDeclared`, `SpellSlotConsumed`, `PactSlotConsumed`, `ConcentrationStarted`, `ConcentrationBroken`, `TriggerFired`.
- **Reactive spells**: `SpellCountered`, `SpellDispelled`, `ItemIdentified`, `ShieldCast`, `AbsorbElementsCast`, `SanctuaryProtected`, `ProtectionUsed`, `GuidanceUsed`.
- **Mirror Image** (slice 124): `MirrorImageDeflected` — emitted by `planAttack` / `planOffHandAttack` when an incoming attack is redirected to a Mirror Image duplicate. Reducer decrements the bearer's `mirror-image-active` AppliedCondition.level when `duplicateHit` is true; planner follows up with `ConditionRemoved` at level 0.
- **Sensors** (slices 135, 138): `RemoteSensorPlaced`, `RemoteSensorModeChanged`, `RemoteSensorRemoved`, `RemoteSensorMoved`. Drive the Sensor entity lifecycle for Clairvoyance, Scrying, and Arcane Eye. Sensor records carry id + label + free-text location + casterId + sourceSpellId + sourceEffectInstanceId + sight/hearing mode + optional `mobile` and `darkvisionRange`.
- **Illusions** (slice 137): `IllusionCreated`, `IllusionInvestigated`, `IllusionDismissed`. Drive the Illusion entity lifecycle for Silent Image and Major Image. Illusion records carry id + label + free-text location + `kind: 'visual' | 'audiovisual'` + casterId + sourceSpellId + sourceEffectInstanceId + baked `investigationDC` + `disbelievedBy: CharacterId[]`.
- **Action economy**: `ActionEconomyConsumed`, `RecklessAttackActivated`, `StunningStrikeAttempted`.
- **Weapon mastery**: `WeaponMasteryActivated`.
- **Encounter**: `EncounterCreated`, `EncounterStarted`, `EncounterEnded`, `InitiativeRolled`, `TurnStarted`, `TurnEnded`, `RoundEnded`.
- **Resting**: `ShortRestStarted`, `ShortRestEnded`, `LongRestStarted`, `LongRestEnded`, `HitDieSpent`, `ResourceSpent`, `ResourceRestored`.
- **Progression**: `CharacterCreated`, `LevelUpResolved`, `ChoiceRequired`, `ChoiceResolved`, `XPAwarded`, `MilestoneAwarded`.
- **Inventory**: `ItemAcquired`, `ItemEquipped`, `ItemUnequipped`, `ItemAttuned`, `ItemUnattuned`, `ItemBuffApplied`, `ItemBuffRemoved`, `ItemChargeConsumed`, `ItemRecharged`, `SentientItemConflict`.
- **Movement**: `CombatantMoved`, `Dashed`, `Disengaged`, `OpportunityAvailable`.
- **Party & treasure**: `PartyCreated`, `PartyMembersChanged`, `CurrencyAcquired`, `CurrencySpent`, `ItemDepositedToParty`, `ItemWithdrawnFromParty`.
- **Sessions & journal**: `SessionStarted`, `SessionEnded`, `JournalEntryAdded`, `InGameTimeAdvanced`.
- **Locations & terrain**: `LocationCreated`, `DoorAdded`, `DoorStateChanged`, `CharacterLocationChanged`.
- **Quests**: `QuestStarted`, `ObjectiveProgressed`, `ObjectiveCompleted`, `ObjectiveFailed`, `QuestCompleted`, `QuestFailed`, `QuestAbandoned`, `QuestRewardClaimed`.
- **Travel**: `TravelLegCompleted`, `NavigationCheckRolled`, `ForagedFor`.
- **NPC mechanics**: `AttitudeChanged`, `MoraleCheckRolled`, `MoraleBroken`.
- **Downtime**: `DowntimeActivityResolved`.
- **Mounts & vehicles**: `Mounted`, `Dismounted`, `VehicleAcquired`, `VehicleBoarded`, `VehicleDeparted`, `VehicleDamaged`, `VehicleRepaired`.
- **Resurrection & transformation**: `CharacterResurrected`, `PolymorphApplied`, `PolymorphReverted`, `SimulacrumCreated`, `WishGranted`.
- **Summons**: `CompanionSummoned`, `CompanionDismissed`.
- **Traps**: `TrapArmed`, `TrapTriggered`, `TrapExpired`.
- **Bastions**: `BastionFounded`, `BastionFacilityAdded`, `BastionHirelingAdded`, `BastionTurnTaken`, `BastionDamaged`, `BastionLevelChanged`.
- **Variant rules**: `CampaignSettingsChanged`, `HeroPointGranted`, `HeroPointSpent`.

## Schemas

Every shape is a Zod schema (parse at boundaries, types via `z.infer`):

- Content: `ContentPackSchema`, `SpeciesSchema`, `BackgroundSchema`, `FeatSchema`, `ClassSchema`, `SubclassSchema`, `ClassFeatureSchema`, `SpellSchema`, `ConditionSchema` (carrying optional `recurringSave` + `autoExpiry` metadata, plus `category: 'curse' | 'disease' | 'poison'` since slice 134 so dedicated removal planners can strip in bulk), `ItemDefinitionSchema` (with `WeaponSchema`, `ArmorSchema`, `ToolSchema`, `MagicItemSchema`, `ConsumableSchema`, `GearSchema` variants; since slices 315-316 `ArmorSchema` and `WeaponSchema` carry optional magic fields — armor: `rarity` / `requiresAttunement` / `acBonus` / `effects`; weapon: `rarity` / `requiresAttunement` / `attackBonus` / `damageBonus` / `onHit` per-hit riders / `effects` — so a single-base magic armor / shield / weapon ships as `itemKind: 'armor'` / `'weapon'` and the AC derive, attack planner, effect projection, and magicality detector treat it as real worn/wielded equipment; since slice 317 a multi-base enchantment stays `itemKind: 'magic'` carrying the same magic fields and a base instance references it via `ItemInstance.enchantmentDefinitionId`, which those same consumers overlay onto the base — Frost Brand / "+N weapon" / "+N armor" with consumer-chosen bases), `MonsterStatblockSchema`.
- Runtime: `CharacterSchema`, `ItemInstanceSchema` (carrying optional `temporaryBuff`), `EncounterSchema`, `EffectInstanceSchema`, `PartySchema`, `SessionSchema`, `JournalEntrySchema`, `LocationSchema`, `DoorSchema`, `LocationMapSchema`, `QuestSchema`, `QuestObjectiveSchema`, `VehicleSchema`, `BastionSchema`, `TrapSchema`, `SensorSchema` (slice 135 + 138: id + label + free-text location + casterId + sourceSpellId + sourceEffectInstanceId + mode + optional mobile + optional darkvisionRange), `IllusionSchema` (slice 137: id + label + free-text location + visual/audiovisual kind + casterId + sourceSpellId + sourceEffectInstanceId + investigationDC + disbelievedBy), `CampaignStateSchema`.

## Effect primitives

The fixed vocabulary the engine reads to compute character state. 53 kinds (52 primitives + the `Custom` escape hatch); see `EFFECT_KINDS` in [src/schemas/effects.ts](../src/schemas/effects.ts) for the canonical list. Highlights:

- Stats: `AddModifier` (carries optional `condition?: Predicate` honored at modifier-sum time since slice 115 — Archery's ranged-only +2, Defense's wearing-armor +1, future Fighting Style gates), `SetAdvantage`, `SetAdvantageVsSource`, `SetACFloor`, `OverrideACFormula`, `OverrideAbilityScore` (sets/floors a score: Amulet of Health, Belt of Giant Strength), `IncreaseAbilityScore` (slice 308: additive +N to a max, distinct from the set form: the six ability Ioun Stones, Belt of Dwarvenkind Toughness), `ModifySpeed`, `GrantSense`, `GrantProficiency`, `GrantWeaponMastery`.
- Damage / heal: `GrantResistance` (carries optional `qualifier: 'nonmagical' | 'magical'` since slice 112: Stoneskin's SRD shape, the common monster "resistance to B/P/S from nonmagical attacks" pattern), `GrantImmunity`, `GrantVulnerability`, `FlatDamageReduction`, `BlockHealing`, `BoostHealing`, `GrantEvasion`, `PreventFatalDamage` (slice 111: marker that triggers `interceptFatalDamage` planner-side when incoming damage would drop the bearer's HP to 0; Death Ward's canonical user), `GrantMagicResistance` (slice 131: marker; `computeSavingThrow` contributes advantage when both the marker and the save's `sourceIsMagical: true` are set; the canonical Imp / Quasit / future-CR-5+-MM-creature trait).
- Conditions / immunities: `GrantConditionImmunity` (carries optional `condition?: Predicate` for source-gated immunity arms like Protection from Evil and Good).
- Resources / slots: `GrantResource`, `RecoverResource`, `GrantSpellSlots`, `GrantSpell`, `ExpandSpellList`.
- Action economy: `ModifyActionEconomy`.
- Triggers: `OnEvent` (with `AddDamage`, `AddDamageToAttacker`, `Heal`, `ApplyCondition`, `ApplyConditionToAttacker`, `SpendResource`, `ModifyDamageTaken`, `EmitEvent` TriggerActions). The `ImposeDisadvantageOnAttackers` effect also carries an optional `condition?: Predicate` evaluated against attacker facts at attack time (used by the type-conditional wards).
- Misc: `ExpandCritRange`, `GrantHalfProficiencyBonusFloor`, `ImposeDisadvantageOnAttackers`, `GrantAdvantageToAttackers`, `GrantAura`, `GrantFallingProtection`, `GrantTwoWeaponFighting` (slice 119: marker that flips `planOffHandAttack` to include the wielder's full ability mod in off-hand damage, even when positive), `GrantProtectionFightingStyle` (slice 120: marker consumed by `engine.plan.protection` for the Fighting Style reaction), `GrantGreatWeaponFighting` (slice 121: marker that triggers the 1/2→3 substitution on weapon damage dice in `planAttack`, gated on a melee two-handed wield), `OfferChoice`, `SetHPMaxFormula`, `CustomEffect` (code-handler escape hatch).

## Content packs

```ts
const pack = loadContentPack(json);            // parse + validate one pack against the schema
const issues = validatePacks([srdPack, myPack]); // author-time: report all collisions + dangling refs
const resolved = resolveContent([srdPack, myPack]); // merge for the engine; THROWS on a bad collision
const refIssues = validateCrossReferences(resolved); // dangling-ref-only pass over merged content
```

`loadStarterPack()` returns the bundled starter pack. `STARTER_PACK_RAW` exposes the underlying object if you need to inspect or extend it. `import('dnd-srd-engine/starter-pack')` is a real subpath so browser consumers can code-split the starter content off the main bundle.

**Multi-pack id policy.** Packs merge into a global per-category id namespace in array order. `resolveContent` throws a `ContentPackLoadError` on any within-pack duplicate id or any cross-pack id collision, so a second pack can't silently clobber an SRD entry. A later pack may *intentionally* replace an earlier id by listing it in its `overrides: string[]` (a deliberate houserule, e.g. a homebrew pack replacing `fireball`); the later entry then wins. `validatePacks(packs)` is the report-all author-time companion (returns every collision + dangling cross-reference instead of throwing on the first); `detectIdCollisions(packs)` is the collision-only half. `mergeContent(packs)` is the bare last-wins merge with no collision check, for tooling that wants to inspect the merged view itself.

## Content queries (browse)

The consumer-facing read layer for browsing the catalog (the spell / monster / item browsers a player-facing app renders). Pure, deterministic filters over a `ResolvedContent`; no state, no events.

```ts
querySpells(content, { level: 3, school: 'evocation', class: 'wizard' }); // -> Spell[]
queryMonsters(content, { type: 'Undead', crMin: 1, crMax: 5 });           // -> MonsterStatblock[]
queryItems(content, { itemKind: 'magic', rarity: 'rare', search: 'sword' }); // -> ItemDefinition[]
```

Each is per-category and returns that category's precise type. Every filter field is optional and AND-combines; an absent field matches everything. `search` is a case-insensitive name substring. `querySpells` takes `level` (exact) or `levelMin`/`levelMax` (inclusive range; exact wins), plus `school` / `class` (lowercase class id) / `concentration` / `ritual`. `queryMonsters` takes `type` / `size` / `cr` (exact) or `crMin`/`crMax` (inclusive; fractional CRs are decimals, 1/4 = 0.25). `queryItems` takes `itemKind` / `rarity` (`MagicRarity`). Results return in stable display order: spells by level then name, monsters by CR then name, items by name.

```ts
buildCharacterSheet({ character, itemInstances, content }); // -> CharacterSheet
```

`buildCharacterSheet` is the character-sheet view model. It extends `computeDerivedCharacter`'s `DerivedCharacter` (level, PB, ability mods, HP, AC, saves, spell slots, languages) with the rest of a sheet's computed stats: `skills` (all 18, each `{ skill, ability, proficiency, modifier, hasAdvantage, hasDisadvantage }`, in canonical order), `passiveScores` (`perception` / `investigation` / `insight`), `initiative` (DEX mod + initiative modifiers, with advantage), `speeds` (effective movement: `walk` always, plus `fly` / `swim` / `climb` / `burrow` when > 0), `attacks` (one `AttackView` per inventory weapon: to-hit `attackBonus`, a static `damage` line `{ dice, modifier, type }`, `versatileDamage` for versatile weapons, `properties`, `range`, `mastery`), `spellcasting?` (present only for casters: per-class `{ ability, saveDC, attackBonus }` plus `spellsByLevel`, the castable spells grouped by level with `prepared` / `alwaysPrepared` flags), and `inventory` (`InventoryView`: the carried + equipped + attuned `items`, each with `quantity` / `weight` / `equippedSlot?` / `attuned` / `charges?`, plus an `encumbrance` summary). Pure assembly over the derivations; invents no rules. The standalone derivations are `computeWeaponDamage(input)` (`-> WeaponDamageResult`) and `getEffectiveSpeeds(input)` / `getEffectiveSpeed(input)`. The one remaining sheet gap (follow-up slice): the unarmed strike entry on the attacks list.

## RNG

```ts
import { defaultRNG, seededRNG, throwOnCallRNG } from 'dnd-srd-engine';
```

`seededRNG(seed)` for deterministic tests. `throwOnCallRNG()` is the architectural canary: pass it into a replay to prove `apply()` never reaches for randomness.

## IDs

Branded string types per kind. Factories: `newCharacterId`, `newCreatureId`, `newPartyId`, `newEncounterId`, `newCampaignId`, `newSessionId`, `newLocationId`, `newQuestId`, `newJournalEntryId`, `newEventId`, `newChoiceId`, `newEffectInstanceId`, `newAppliedConditionId`, `newItemInstanceId`, `newTrapId`, `newSensorId`, `newIllusionId`. Brand casts: `asCharacterId`, `asSpeciesId`, etc.

## Migrations

`migrate(json) → CampaignState` walks the on-disk version forward. `SCHEMA_VERSION` lives in [src/version.ts](../src/version.ts); migrations live in [src/migrations/](../src/migrations/) and run automatically on `loadCampaign(json)`.

## Conveniences

`serializeCampaign(c)` writes a JSON string with id + name + schemaVersion + events only; state is omitted because `loadCampaign(json)` replays the events to reconstruct it. `createPC({name, speciesId, backgroundId, classId, hpMax, ...})` returns a `Character` with sensible defaults; caller emits the `CharacterCreated` event themselves to add to a campaign. `performIntent(campaign, intent)` is the engine.do convenience (same dispatcher as `engine.do`).
