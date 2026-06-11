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
- `engine.query.*`: intent-shaped affordance queries ("what can this combatant legally do right now?"). See [affordance queries](#affordance-queries-intent-shaped).

Also exported: `engine.do(campaign, intent)` (dispatches on `intent.type` to the right planner and commits in one call), `engine.content` (the resolved content pack), `engine.schemaVersion`, `engine.rng`.

## Planners

Every planner returns `{ events: Event[] }` (or `{ events, ...outcome }` for the handful that surface a derived bool / id / d4 alongside the chain). RNG-consuming planners bake the dice rolls into the resolution events; `apply()` is RNG-free.

**Encounter lifecycle**: `createEncounter`, `rollInitiative`, `startEncounter`, `beginFirstTurn`, `advanceTurn`, `endEncounter`.

**Combat (attack-side)**: `attack`, `cleave`, `opportunityAttack`, `actionSurge`, `offHandAttack`, `multiattack`, `falling`. Plus mastery-specific `weaponMastery({mastery, ...})`. `attack` also splits into a two-phase form (slice 754) for consumers that open a reaction window mid-attack: `attackRoll(state, intent)` → `{ events, roll }` (the action-economy prelude + range / LoS / loading gates + the d20 roll, emitting `AttackRolled`; `roll.hit` surfaces the connect, `roll` is the opaque resume handle) then `attackDamage(roll)` → `{ events }` (the damage chain for a hit that stands — never rolled if the consumer prevents the hit). `attack` is the byte-identical composition of the two.

**Combat (defense-side)**: `dodge`, `shield`, `absorbElements`, `sanctuaryWardSave`, `protection`, `consumeGuidance`, `consumeResistance`, `cuttingWords`. Each is a dedicated reaction planner the consumer calls after observing the trigger event. `consumeResistance` (Resistance cantrip, slice 369) rolls the 1d4 and emits a compensating `Healed` for the reduction when the `resisted` creature takes the chosen damage type (mirrors `absorbElements`; the once-per-turn cap + chosen type are consumer-coordinated). `sanctuaryWardSave` is the inverse direction: called BEFORE an attack against a sanctuary-warded creature, rolling the attacker's WIS save and emitting `SanctuaryProtected` on failure so the consumer drops the attack. `protection` (slice 120, Protection Fighting Style) rolls a fresh d20 the consumer pairs with the original AttackRolled.d20 as disadvantage; gates on `GrantProtectionFightingStyle` + shield equipped + reaction available; position / vision preconditions stay consumer-side.

**Class-specific actions**: `sacredWeapon` (Paladin Devotion), `recklessAttack` (Barbarian), `stunningStrike` (Monk), `flurryOfBlows` (Monk: spend 1 Focus Point → two Unarmed Strikes as a Bonus Action, three at L10+), `patientDefense` (Monk: Disengage as a Bonus Action, or 1 Focus for Disengage + Dodge, +temp HP at L10+), `stepOfTheWind` (Monk: Dash as a Bonus Action, or 1 Focus for Disengage + Dash), `frenzy` (Barbarian Berserker), `metamagic` (Sorcerer), `wildCompanion` (Druid), `wildResurgence` (Druid: trade a spell slot for a Wild Shape use or vice-versa, once per Long Rest), `memorizeSpell` (Wizard: swap a prepared spell), `countercharm` (Bard L7: reaction to reroll a failed Charmed/Frightened save with Advantage; returns `{ events, d20, total, success }`).

**Subclass-feature actions** (slices 350-358): `intimidatingPresence` (Barbarian Berserker L14: Bonus-Action WIS-save-or-Frightened over chosen targets), `dragonWings` (Draconic Sorcerer L14: Bonus-Action Fly Speed 60 self-buff), `preserveLife` (Life Domain Cleric L3: Channel-Divinity heal pool of 5× level among Bloodied allies, each capped at half max), `landsAid` (Circle of the Land Druid L3: expend Wild Shape for a 10-ft Sphere, CON save for 2d6 Necrotic half-on-success plus a 2d6 ally heal, scaling at L10/L14), `wholenessOfBody` (Warrior of the Open Hand Monk L6: Bonus-Action self-heal of the Martial Arts die + WIS mod), `peerlessSkill` (College of Lore Bard L14: spend a Bardic Inspiration die on the bard's own failed check/attack, refunded if it still fails; returns `{ events, dieRoll, turnedSuccess }`), `naturalRecovery` (Circle of the Land Druid L6: recover expended spell slots on a Short Rest, combined level ≤ ceil(level/2), once per Long Rest), `darkOnesOwnLuck` (Fiend Patron Warlock L6: spend a use → roll a d10 the consumer folds into an ability check or save; returns `{ events, d10 }`).

**Movement**: `move`, `dash`, `disengage`, `mistyStep`, `thunderStep` (slice 128: action, teleport caster + one willing ally within 5 ft up to 90 ft, AoE 3d10 thunder on origin with CON save half, +1d10 per slot above 3rd), `dimensionDoor` (slice 342: action, teleport up to 500 ft + one optional willing creature within 5 ft, arriving within 5 ft of the destination; no save/damage, occupied destinations rejected).

**Spellcasting (cast-time)**: `castSpell` (the general dispatcher; slice 787: pass an opt-in `aim: {x,y}` in feet on an area spell and the engine derives the covered creatures from the rasterizer + line of effect, ignoring `targetIds` — the per-target range gate is skipped since RAW range is to the origin), `magicWeapon`, `elementalWeapon`, `counterspell`, `dispelMagic`, `identify`, `removeCurse` (slice 134: strips every condition tagged `category: 'curse'` on the touched target), `silentImage` + `majorImage` (slice 137: places an Illusion entity; consumers use `investigateIllusion` to roll Investigation against the baked DC), `clairvoyance` + `scrying` (slices 135 + 136: places a remote Sensor entity bound to caster concentration; Scrying composes the same primitive with a target WIS save), `arcaneEye` (slice 138: places a mobile Sensor with darkvision 30).

**Spellcasting (tick / trigger)**: `checkConcentration`, `expireSpellDurations`, `tickAura`, `tickMovementDamage`, `tickRecurring`, `tickRecurringSave`, `triggerTrap`. Consumers call these at the appropriate moments (per-turn ticks, on-movement, on-trigger).

**Sensors & illusions**: `switchSensorMode` (toggles sight / hearing on a sensor; caster action), `moveSensor` (updates a mobile sensor's free-text location; caster bonus action; rejects non-mobile sensors and ownership mismatches), `removeSensor` (voluntary spell end), `investigateIllusion` (a creature spends an action to Study an illusion; rolls Investigation against the baked DC; success adds the investigator to `disbelievedBy`), `dismissIllusion` (voluntary spell end). `clearConcentrationEffect` automatically sweeps sensors and illusions linked to a dropped concentration via `sourceEffectInstanceId`.

**Summons**: `dismissCompanion`. Summoning happens via `castSpell` against a `summon` SpellMechanic (find-familiar, find-steed, the summon-X family); the planner emits `CompanionSummoned`.

**Transformations**: `polymorph`, `wildShape`, `simulacrum`, `wish`.

**Resurrection**: `resurrect({characterId, spellId, via})`. Supports `via: 'spell-slot' | 'scroll' | 'special'` so scroll consumption and special revivals can skip caster validation.

**Resting & resources**: `shortRest`, `longRest`, `rest` (generic dispatcher on rest kind), `spendHitDie({characterId})` (slice 785: the short rest's defining heal — rolls one Hit Die + CON modifier, minimum 1; spends the first class enrollment with dice remaining).

**Inventory**: `equip` (enforces two-handed-vs-shield arbitration before stamping `ItemEquipped`).

**Contested actions**: `grapple`, `shove`, `hide`.

**Travel & exploration**: `forage`, `navigationCheck`, `forcedMarch`.

**NPC mechanics**: `moraleCheck`, `reactionRoll`.

**Variant rules**: `grantInitialHeroPoints`, `spendHeroPoint` (both require `CampaignSettings.heroPoints: true`).

**Checks & saves**: `save`, `abilityCheck`.

**Progression**: `levelUp`, `resolveChoice`.

## Derivations

All read-only and pure. Memoized per `CampaignState.version`.

- `character(state, id)` → `DerivedCharacter` (totalLevel, proficiency bonus, **effective `abilityScores` + `abilityModifiers`** — base plus floors and `IncreaseAbilityScore` from the active effect stack: ASI, Ioun Stones, Belt of Dwarvenkind, etc. — HP, `hpMaxBonus` / `effectiveHpMax`, AC, saves, spell slots, pending choices, known languages).
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

The fixed vocabulary the engine reads to compute character state. 69 kinds (68 primitives + the `Custom` escape hatch); see `EFFECT_KINDS` in [src/schemas/effects.ts](../src/schemas/effects.ts) for the canonical list. Highlights:

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
monsterAttackActions(content, 'wolf'); // -> ResolvedMonsterAction[]  (slice 788: a statblock's attack actions with each weaponId resolved to its weapon def — query the link instead of hardcoding wolf → wolf-bite)
validateBackgroundAbilityIncrease(character, content); // -> string[]  (slice 793: checks a character's opt-in `backgroundAbilityIncrease` allocation against its background's +2/+1 / +1/+1/+1 options; [] = valid. The engine applies the allocation in derivation, capped at 20)
```

Each is per-category and returns that category's precise type. Every filter field is optional and AND-combines; an absent field matches everything. `search` is a case-insensitive name substring. `querySpells` takes `level` (exact) or `levelMin`/`levelMax` (inclusive range; exact wins), plus `school` / `class` (lowercase class id) / `concentration` / `ritual`. `queryMonsters` takes `type` / `size` / `cr` (exact) or `crMin`/`crMax` (inclusive; fractional CRs are decimals, 1/4 = 0.25). `queryItems` takes `itemKind` / `rarity` (`MagicRarity`). Results return in stable display order: spells by level then name, monsters by CR then name, items by name.

```ts
buildCharacterSheet({ character, itemInstances, content }); // -> CharacterSheet
```

`buildCharacterSheet` is the character-sheet view model. It extends `computeDerivedCharacter`'s `DerivedCharacter` (level, PB, ability mods, HP, AC, saves, spell slots, languages) with the rest of a sheet's computed stats: `skills` (all 18, each `{ skill, ability, proficiency, modifier, hasAdvantage, hasDisadvantage }`, in canonical order), `passiveScores` (`perception` / `investigation` / `insight`), `initiative` (DEX mod + initiative modifiers, with advantage), `speeds` (effective movement: `walk` always, plus `fly` / `swim` / `climb` / `burrow` when > 0), `attacks` (one `AttackView` per inventory weapon, then the always-available unarmed strike: to-hit `attackBonus`, a static `damage` line `{ dice, modifier, type }`, `versatileDamage` for versatile weapons, `properties`, `range`, `mastery`; the unarmed entry has `unarmed: true` and no `weaponInstanceId`), `spellcasting?` (present only for casters: per-class `{ ability, saveDC, attackBonus }` plus `spellsByLevel`, the castable spells grouped by level with `prepared` / `alwaysPrepared` flags), and `inventory` (`InventoryView`: the carried + equipped + attuned `items`, each with `quantity` / `weight` / `equippedSlot?` / `attuned` / `charges?`, plus an `encumbrance` summary). Pure assembly over the derivations; invents no rules. The standalone derivations are `computeWeaponDamage(input)` (`-> WeaponDamageResult`), `computeUnarmedStrike(input)` (`-> UnarmedStrikeResult`), and `getEffectiveSpeeds(input)` / `getEffectiveSpeed(input)`. The view model now covers the full DDB character-sheet surface. (Static-line caveat shared with all attacks: contextual / class-feature scaling such as Sneak Attack, Great Weapon Fighting, and the Monk Martial Arts die resolves in the attack planner, not the sheet line.)

```ts
buildEncounterView(state, content, encounterId); // -> EncounterView | undefined
```

`buildEncounterView` is the combat-tracker view model. It returns the encounter's `status` / `round` / `activeCombatantId` plus `combatants` in initiative order, each a `CombatantView` with `name` / `initiative` / `isActive` / `hp` / `ac` / `exhaustion` / `conditions` (`{ id, name }`) / `defeated` (HP <= 0) / `turn` (action / bonus / reaction used + feet moved). Combatants are `Character` entities (PCs and monsters alike); a missing character is skipped. Returns undefined for an unknown encounter id.

## Affordance queries (intent-shaped)

`engine.query.*` answers "what can this combatant legally do right now?" in intent terms, so an interactive UI renders the answers and never re-derives rules from primitives. Pure + read-only; each wraps the existing derive helpers (pathing, terrain, action-economy, speed, spell-slots) and the planner precondition guard; every list is deterministically ordered.

```ts
engine.query.legalMoveDestinations(state, encounterId, combatantId); // -> MoveDestination[]  ({ position (feet), costFeet, path })
engine.query.actionEconomy(state, encounterId, combatantId);          // -> ActionEconomyView | undefined
engine.query.availableActions(state, encounterId, combatantId);       // -> AvailableAction[]  ({ action, enabled, reason? })
engine.query.legalTargets(state, encounterId, combatantId, 'attack'); // -> TargetCandidate[]  (in reach + LoS, nearest first)
engine.query.castableSpells(state, characterId);                      // -> CastableSpell[]
engine.query.legalSpellTargets(state, encounterId, casterId, spellId, slotLevel); // -> LegalSpellTargets
engine.query.creaturesInSpellArea(state, encounterId, casterId, spellId, aim);     // -> string[]  (slice 786: the cone/sphere/line/cube/cylinder/emanation rasterizer — combatant ids the template covers + with line of effect; aim in feet)
engine.query.bonusActions(state, encounterId, combatantId);           // -> BonusActionOption[]  ({ id, label, target, enabled, reason?, requiresAmount, maxAmount? })
engine.query.bonusActionTargets(state, encounterId, combatantId, optionId); // -> BonusActionTarget[]  (legal targets for a creature-target option)
engine.plan.useOption(state, { combatantId, optionId, targetId?, amount?, weaponInstanceId? }); // -> PlanResult  (perform an enumerated bonus action by id)
engine.query.availableReactions(state, encounterId, combatantId);     // -> ReactionOption[]  ({ id, label, trigger, enabled, reason? })
engine.query.reactionsForTrigger(state, encounterId, reactorId, triggerEvent); // -> CorrelatedReaction[]  ({ id, label, intent }) — ready-to-commit reaction intents
engine.query.actionOptions(state, encounterId, combatantId);          // -> ActionOption[]  (the general 2024 actions: Search/Study/Influence/Utilize/Hide/Grapple/Shove/Help/Ready)
engine.plan.useActionOption(state, { combatantId, optionId, targetId?, mode?, trigger?, ... }); // -> PlanResult  (perform an enumerated general action by id)
engine.query.postHitOptions(state, encounterId, attackEvent);         // -> PostHitOption[]  ({ id, label, enabled, reason?, slotLevels }) — options riding a just-landed attack (Paladin's Smite)
```

`availableActions` covers `move | attack | dash | disengage | dodge`; when an action is disabled its `reason` is machine-readable (a blocking-condition id such as `'stunned'`, or `'action-used'` / `'no-target-in-range'` / `'no-movement'` / `'speed-zero'`). `legalMoveDestinations` honors terrain, occupancy, Dash, Steady-Aim (speed 0), and the Frightened "can't move closer to the source" rule; positions are in feet (pass straight to `engine.plan.move`).

`castableSpells` (slice 713) carries content-derived metadata so a UI buckets + targets a spell without parsing its text: `castingTime` (`'action'|'bonus-action'|'reaction'|'other'`), `rangeFeet` (`number|'self'|'touch'|'unbounded'`), a discriminated `target` (`{kind:'self'}` | `{kind:'creatures', maxTargets, allow}` | `{kind:'point', shape, sizeFeet}`), `resolves` (`'attack'|'save'|'auto'|'heal'|'buff'` + `saveAbility` when `'save'`), and `concentration`, alongside `spellId`/`minLevel`/`levelOptions`. `legalSpellTargets` returns the legal targets at a slot honoring range + line of effect, discriminated to mirror the descriptor: `{kind:'self'}` | `{kind:'creatures', candidates, maxTargets}` (includes the caster for non-enemy spells) | `{kind:'points', cells}` (legal AOE placement/aim cells). Bonus-action spells appear in `castableSpells` filtered by `castingTime === 'bonus-action'`. `maxTargets` (slice 716) is the upper bound of distinct creatures the cast may pick, derived from the spell's mechanics — beam-scaling cantrips (Eldritch Blast → 1/2/3/4 by character level) and `auto-hit` darts (Magic Missile → 3 + 1 per slot above base, scaled per `slotLevel`); single-target spells stay 1. For area spells, `points` are candidate origin/aim cells; computing **which creatures a cone/sphere/line covers** is the consumer's spatial query (the cast-spell planner takes `targetIds` from the app, per [engine scope](engine-scope.md)).

`bonusActions` (slices 714/715/762/768) enumerates the bonus-action **features** a combatant owns — Second Wind, Rage, Innate Sorcery (Sorcerer), Cunning Action, Patient Defense / Step of the Wind (± Focus), Bardic Inspiration, Lay on Hands (heal + cure-poison), Flurry of Blows, Off-Hand Attack (when wielding a light weapon), Cloud's Jaunt (Goliath teleport — `to` destination), Conjure Pact Weapon (Pact of the Blade — `weaponDefinitionId`), Sacred Weapon (Devotion paladin), Intimidating Presence (Berserker L14 — `targetIds`), Adrenaline Rush (Orc), Nimble Escape (Goblin) — each `{ id, label, target: 'none'|'self'|'creature', enabled, reason?, requiresAmount, maxAmount? }`; a disabled `reason` is machine-readable (a blocking-condition id, or `not-your-turn` / `bonus-action-used` / `no-uses` / `no-focus` / `heavy-armor` / `already-dashed` / `already-disengaged`). `requiresAmount` (slice 756) flags a metered option (Lay on Hands heal) whose spendable pool is `maxAmount` (the UI offers 1..maxAmount; overheal clamping stays engine-side). `engine.query.bonusActionTargets(state, encounterId, combatantId, optionId)` (slice 756) lists the legal targets for a creature-target option as `{ combatantId, position? }`, honoring the option's reach + self / defeated rules (Lay on Hands = touch incl. a dying ally; Bardic Inspiration = 60 ft excl. self; Flurry = reach); range is chebyshev on combatant positions (positionless → no range filter, consumer applies line-of-sight). `engine.plan.useOption(state, { combatantId, optionId, targetId?, amount?, weaponInstanceId? })` performs a chosen option by id — a generic executor that maps the id to its dedicated planner and returns its `PlanResult`, so the UI never wires each feature's bespoke intent. The param bag covers metered heals (`amount`, Lay on Hands heal) and strikes (`weaponInstanceId`, Flurry). It throws on an unknown id or a missing required param; dice route through the active RollProvider (it delegates to the same planners as every action). A Bonus Actions menu unions `bonusActions` (features) with `castableSpells` filtered to `castingTime === 'bonus-action'` (spells). (Frenzy is a Rage modifier, not a bonus action, so it is not listed here.)

`availableReactions` / `reactionsForTrigger` (slice 763) are the reaction-side equivalent. `availableReactions` enumerates the reactions a combatant owns — `{ id, label, trigger: 'attack-roll'|'damage'|'spell-cast', enabled, reason? }` — disabled by a blocking condition or `reaction-used` (the reaction spent this round). `reactionsForTrigger(state, encounterId, reactorId, triggerEvent, recentEvents?)` is the correlation helper: given a trigger event it returns `{ id, label, intent }[]` with the reaction params pre-filled; the consumer dispatches each by `intent.type` to the matching typed planner (`engine.plan.shield` / `cuttingWords` / `uncannyDodge` / `counterspell` / `protection` / `stonesEndurance` / `opportunityAttack` / `deflectAttacks` / `countercharm`) to get the rich outcome and commit. The layer is complete — 9 reactions across 5 trigger kinds (`attack-roll` / `damage` / `spell-cast` / `leaves-reach` / `condition-applied`), each planner-faithful: Shield, Cutting Words, Uncanny Dodge, Counterspell (763); Stone's Endurance (gates on the resolved Giant Ancestry), Protection (shield + Fighting Style + 5 ft of the attacked ally) (765); Opportunity Attack (a `CombatantMoved` that leaves the reactor's melee reach) (766); Deflect Attacks + Countercharm (767). The optional `recentEvents` (a log slice) enables the two cross-event reactions — Deflect Attacks scans it for the triggering `AttackRolled`, Countercharm for the preceding failed `SaveRolled`; every other reaction reads only the trigger event.

`actionOptions` / `useActionOption` (slices 764/769) are the general-action sibling of `availableActions` (the 5 core combat intents). `actionOptions` enumerates the SRD 2024 general actions every creature can take — Search, Study, Influence, Utilize, Hide, Grapple, Shove, Help, Ready — plus class-feature actions (slices 769/772): Action Surge (Fighter — its `costsAction:false` economy keeps it enabled after the action is used), Divine Spark + Turn Undead + Preserve Life (Cleric Channel Divinity, gated on the resource), Dragonborn Breath (species, gated on its uses). Each `{ id, label, target: 'none'|'self'|'creature', enabled, reason? }` (disabled by a blocking condition / `not-your-turn` / `action-used` / `no-uses`). `engine.plan.useActionOption(state, { combatantId, optionId, targetId?, targetIds?, mode?, trigger?, … })` performs a chosen one by id (the `useOption` sibling; builds via `actionIntent` and routes through `planIntent`). `engine.query.actionTargets(state, encounterId, combatantId, optionId)` (slice 771) lists the legal targets for a creature-target action (Grapple/Shove = 5 ft; Help = no range filter, consumer-managed; Divine Spark = 30 ft incl. self + a dying ally), the `bonusActionTargets` sibling. An Action menu unions `availableActions` (core) + `actionOptions` (general + class-feature) + `castableSpells` filtered to `castingTime === 'action'`.

`postHitOptions` (slice 774) is the post-hit sibling — options contextual on a just-committed `AttackRolled` rather than on the turn-menu state. Through L7 the only such feature is **Paladin's Smite** (a Bonus Action riding the paladin's own melee hit), discoverable from neither `bonusActions` (no triggering attack in scope) nor `castableSpells` (it's the L2 feature, not the Divine Smite spell). `postHitOptions(state, encounterId, attackEvent)` returns `[]` unless the attack is a melee hit by a paladin; otherwise the single option `{ id:'paladins-smite', label, enabled, reason?, slotLevels }` carries the spell-slot picker (`slotLevels`, the available levels 1-5 that set the 2d8 + 1d8/level damage) and an `enabled`/`reason` reflecting the Bonus Action economy (`not-your-turn` off an Opportunity Attack — there's no Bonus Action on another creature's turn — / `bonus-action-used` / `no-uses` / a blocking-condition id). `postHitIntent(optionId, attackEvent, { slotLevel, targetIsUndeadOrFiend? })` builds the `PaladinsSmiteIntent` (paladin/target/triggering-attack ids read from the event); the consumer runs it through `engine.plan.paladinsSmite` directly (that planner is consumer-orchestrated, deliberately not in the `planIntent` dispatch, so there is no `useOption`-style executor). The gate is RAW-correct and stricter than the lenient `planPaladinsSmite` (which checks only paladin + slot), so the affordance never surfaces a RAW-illegal smite. With this the affordance program is complete: every legal action / bonus action / reaction / post-hit option through L7 is discoverable from `engine.query.*`, each planner-faithful.

## Tactical AI

```ts
import { planTacticalMove, classifyTacticalRole } from 'dnd-srd-engine';
```

The pure, deterministic enemy-movement policy (`planTacticalMove` — flee / kite / close / stay over `reachableCells` + `hasLineOfSight`; `classifyTacticalRole` — ranged vs melee from weapon + cantrips; `pickByTotalOrder` — a stable argmax). Lets a consumer drive an AI combatant's movement without depending on the fuzz scripts. The per-turn intent chooser and the event-committing move orchestration remain in the fuzz harness (`scripts/`).

## RNG

```ts
import { defaultRNG, seededRNG, throwOnCallRNG } from 'dnd-srd-engine';
```

`seededRNG(seed)` for deterministic tests. `throwOnCallRNG()` is the architectural canary: pass it into a replay to prove `apply()` never reaches for randomness.

### Roll providers (die-typed, resumable)

```ts
import { withRollProvider, SuppliedRollProvider, SeededRollProvider, NeedRoll } from 'dnd-srd-engine';
```

For interactive play (a player entering physical dice), a **die-typed** seam sits over the value-typed RNG. `engine.withRollProvider(provider, fn)` runs one synchronous planning call against `provider`; `rollDie` routes each draw through it. `SeededRollProvider(rng)` reproduces the default RNG path bit-for-bit (it's the default). `SuppliedRollProvider(queue)` returns caller-supplied faces in order and throws `NeedRoll { die, context }` when the queue is exhausted — the consumer prompts for that die, appends the answer, and re-attempts (planning is pure, so the same prefix re-draws identical earlier dice). `context` (`'attack' | 'damage' | 'save' | ...`) labels the prompt. One shared stream; no per-combatant forking (intentional). The ranked/daily path keeps using `SeededRollProvider`.

## IDs

Branded string types per kind. Factories: `newCharacterId`, `newCreatureId`, `newPartyId`, `newEncounterId`, `newCampaignId`, `newSessionId`, `newLocationId`, `newQuestId`, `newJournalEntryId`, `newEventId`, `newChoiceId`, `newEffectInstanceId`, `newAppliedConditionId`, `newItemInstanceId`, `newTrapId`, `newSensorId`, `newIllusionId`. Brand casts: `asCharacterId`, `asSpeciesId`, etc.

## Migrations

`migrate(json) → CampaignState` walks the on-disk version forward. `SCHEMA_VERSION` lives in [src/version.ts](../src/version.ts); migrations live in [src/migrations/](../src/migrations/) and run automatically on `loadCampaign(json)`.

## Conveniences

`serializeCampaign(c)` writes a JSON string with id + name + schemaVersion + events only; state is omitted because `loadCampaign(json)` replays the events to reconstruct it. `createPC({name, speciesId, backgroundId, classId, hpMax, ...})` returns a `Character` with sensible defaults; caller emits the `CharacterCreated` event themselves to add to a campaign. `performIntent(campaign, intent)` is the engine.do convenience (same dispatcher as `engine.do`).
