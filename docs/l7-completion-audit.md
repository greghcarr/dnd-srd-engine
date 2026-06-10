# L7 SRD-completion audit — master worklist

**Purpose.** The finite, tracked list of everything standing between today's engine and the claim: *"a consumer like dnd-web runs a complete level 1-7 SRD 5.2.1 game and a D&D expert sees zero divergences in the rules' enforcement — including input handling and targeting."* This is the durable checklist; pick from it, don't re-derive it.

**Scope.** Player characters levels 1-7 (the 12 SRD classes + one canonical SRD subclass each, the SRD species/backgrounds/feats), spells of level 0-4 (a level-7 full caster's ceiling), the combat + exploration + social pillars, items a tier 1-2 party would hold, and the monsters an L1-7 party fights (≈ CR 0-11). Content above L7 / above 4th-level spells / legendary-tier monsters is out of scope.

**What is already done (not in this list).** Class + subclass *features* L1-7 are SRD-complete and CI-guarded by the `srd-l{1..7}-complete` floor audits + the L1-7 fuzz matrix; the AC / saving-throw / spell-DC / weapon / species-speed conformance audits pass; the affordance/query layer (actions, bonus actions, reactions, post-hit, targeting enumeration) is complete through L7. The gaps below are where the *game as played* still diverges, mostly at the edges the floor audits don't exercise: spell mechanical arms, the targeting seam, edition-drift bugs, build-choice validation, item/monster content, and the exploration pillar.

**Provenance.** Compiled 2026-06-09 from a 7-agent parallel audit cross-referencing the SRD canon clone (`references/srd-markdown/`, the only valid source), the engine code, the test suite, and the `docs/gaps-*` catalogs. Most items are agent findings that each need a short confirm before becoming a slice (a few will be false positives); the four headline edition-drift items are marked `[canon-verified]`.

## How to use this doc

- **Severity** — `BLOCKER` (the rule can't be enforced correctly at all) · `DIVERGENCE` (wrong outcome an expert notices) · `QUIRK` (edge case / cosmetic / by-design seam).
- **Owner** — `Engine` (engine fix) · `Seam` (engine must expose more so the consumer *can* be correct) · `Consumer` (dnd-web's job; engine support is sufficient) · `Docs`.
- **Fix** — rough size `S` / `M` / `L`.
- **Status** — every row is open. When a slice closes one, strike it through and append `**Closed by slice N**` (the repo's [changelog closure convention](changelog/)); when a finding is confirmed a non-bug, move it to "Confirmed correct / by-design" at the foot.
- **Evidence** — file paths (with line numbers where known) are in code spans so the doc-links audit ignores them; cross-document references are markdown links.

## Rollup

| Area | Items | Blockers | Divergences | Quirks | Owner mix |
|---|---|---|---|---|---|
| 1. Edition drift | 4 | 0 | 4 | 0 | Engine |
| 2. Spell mechanics (L0-4) | 23 | 0 | 16 | 7 | Engine |
| 3. Targeting / AoE seam | 14 | 0 | 6 | 7 | Seam + Consumer |
| 4. Core combat correctness | 11 | 0 | 6 | 5 | Engine |
| 5. Build & leveling validation | 10 | 1\* | 6 | 3 | Engine |
| 6. Base equipment mechanics | 9 | 1\* | 4 | 4 | Engine |
| 7. Monster runtime (DM side) | 13 | 1 | 5 | 5 | Engine (schema+content) |
| 8. Exploration / non-combat | 14 | 0 | 4 | 9 | Engine |
| 9. Consumer duties & docs | 8 | 0 | 3 | 5 | Consumer + Docs |

\* Pending an ownership/canon confirm (see the row's `[verify]` tag) before it's firmly a blocker.

**Recommended order:** Area 1 (cheap, flatly-wrong, highest expert-visibility) → the structural blockers (~~`aoe-shape-coverage`~~ *(closed by slices 786–787)*, ~~`no-actions-field`~~ *(closed by slice 788)* + `multiattack` *(sweep underway)*, ~~`no-hit-die-spend-planner`~~ *(closed by slice 785)*, `background-ability-bonus`) → remaining divergences by area → quirks. Consumer items (Area 9 + the consumer half of Area 3) bundle into a hand-off note for the dnd-web session.

---

## Area 1 — Edition drift (the engine applies a *wrong-edition* rule)

The most damning class for an expert: not missing, just wrong. All quick.

| ID | Sev | Owner | Fix | Finding |
|---|---|---|---|---|
| ~~`long-rest-half-hd`~~ | DIVERGENCE | Engine | S | `[canon-verified]` Long rest restored only `halfRoundedDown(totalHitDice)` Hit Dice; SRD 5.2.1 restores **all** spent HD. `src/engine/reducers/rest.ts`; canon `references/srd-markdown/rules-glossary.md` "Long Rest". **Closed by slice 781** (each enrollment's `hitDiceRemaining` resets to its level; the 2014 half-budget + its `halfRoundedDown`/`oneMin` helpers were removed). |
| ~~`sleep-hp-pool`~~ | DIVERGENCE | Engine | M | `[canon-verified]` Sleep used the 2014 `hp-pool-knockout` (5d8 +2d8/slot); SRD 5.2.1 is a WIS save → Incapacitated, second-fail → Unconscious, Concentration, ends-on-damage, elf/Exhaustion-immune auto-succeed. **Closed by slice 783** (new `sleep-drowsy-active` condition with the `escalateToCondition` recurring save → Unconscious; new `save` auto-succeed arm + Elf Trance immunity; recurring-save escalation now propagates `endsOnDamage` + the concentration link). The escalated Unconscious carries the engine's existing partial-Unconscious modeling — see `drop-to-0-no-unconscious-arms` (Area 4). |
| ~~`color-spray-hp-pool`~~ | DIVERGENCE | Engine | M | `[canon-verified]` Color Spray used `hp-pool-knockout` (6d10); SRD 5.2.1 is a 15-ft cone, CON save → Blinded until the end of the caster's next turn. **Closed by slice 784** (new `color-sprayed-blinded-active` variant carrying the base Blinded effects + `autoExpiry { afterRounds 1, turnEnd }`; the cone target-selection is the consumer seam, same as Sleep's sphere — the true rasterizer is the separate `aoe-shape-coverage` blocker). **Area 1 (edition drift) is now fully closed.** |
| ~~`small-creature-heavy-disadvantage`~~ | DIVERGENCE | Engine | S | Engine imposed the 2014 "Small creatures have Disadvantage with Heavy weapons" rule, removed in 2024 (replaced by the STR/DEX-13 rule — see `heavy-property-str-dex` in Area 6). `src/engine/plan/attack.ts` (`heavyForSmall`). **Closed by slice 782** (removed; replaced with the 2024 STR/DEX-13 check). |

Cross-ref: the 2014 encumbrance tiers (`encumbrance-variant-2014`) live in Area 8.

---

## Area 2 — Spell mechanics, level 0-4

A level-7 caster's whole repertoire. "Cast does nothing" and "missing a defining arm" are the divergences; cantrip riders are quirks. (Sleep / Color Spray's 2014 math is in Area 1.)

### Casting produces no effect (deferred L4, schema-only)

| ID | Sev | Owner | Fix | Finding |
|---|---|---|---|---|
| `l4-banishment` | DIVERGENCE | Engine | M | CHA save → banish; cast emits no save, target stays. `tests/unit/engine/spell-coverage.test.ts:302`. |
| `l4-dominate-beast` | DIVERGENCE | Engine | M | WIS save → control; no save/condition emitted. `spell-coverage.test.ts:310`. |
| `l4-compulsion` | DIVERGENCE | Engine | M | WIS save → forced move each turn; nothing emitted. `spell-coverage.test.ts:304`. |
| `l4-guardian-of-faith` | DIVERGENCE | Engine | M | Summoned guardian dealing 20 radiant (DEX half) to 60-total; nothing summoned. `spell-coverage.test.ts:315`. |
| `l4-aura-of-life` | DIVERGENCE | Engine | M | 30-ft emanation: necrotic resistance + 0-HP allies regain 1 HP; no aura. `spell-coverage.test.ts:301`. |
| `l4-resilient-sphere` | DIVERGENCE | Engine | M | DEX save → impervious sphere; no save/condition. `spell-coverage.test.ts:319`. |
| `l4-faithful-hound` | DIVERGENCE | Engine | M | Invisible watchdog + 4d8 bite vs adjacent hostiles; nothing. `spell-coverage.test.ts:312`. |
| `l4-giant-insect` | DIVERGENCE | Engine | L | Transforms vermin into controlled giant versions; nothing. `spell-coverage.test.ts:314`. |

### Missing a major mechanical arm

| ID | Sev | Owner | Fix | Finding |
|---|---|---|---|---|
| `heat-metal-save-on-wrong-arm` | DIVERGENCE | Engine | M | Engine gates the 2d8 fire behind a CON save (no damage on success). RAW: damage is automatic; the save only decides drop-the-object / disadvantage. `starter-pack.json` heat-metal. |
| `searing-smite-no-recurring-burn` | DIVERGENCE | Engine | M | Only the one-time +1d6 fire fires; RAW repeats 1d6 + CON save at the start of each of the target's turns. `searing-smite-active` condition (single `consumeOnTrigger`). |
| `acid-arrow-no-delayed-or-miss` | DIVERGENCE | Engine | M | Wired as flat 4d4 on hit; RAW adds 2d4 at end of target's next turn and half on a miss. `starter-pack.json` acid-arrow. |
| `guiding-bolt-no-advantage-grant` | DIVERGENCE | Engine | S | Wired as flat 4d6; RAW grants the next attacker Advantage vs the target. `starter-pack.json` guiding-bolt. |
| `heroism-no-recurring-temp-hp` | DIVERGENCE | Engine | M | `heroic-active` grants only Frightened immunity; RAW also grants temp HP = spell mod at the start of each of the target's turns. |
| `enlarge-reduce-no-damage-rider-or-save` | DIVERGENCE | Engine | M | Pure buff (STR adv/disadv only); RAW adds ±1d4 weapon damage and an unwilling-target CON save (auto-applies today). `enlarged-active` / `reduced-active`. |
| `hideous-laughter-no-conditions` | DIVERGENCE | Engine | M | `hideous-laughter-active` projects no effects; RAW applies Prone + Incapacitated on a failed save (+ damage re-save). |
| `confusion-table-not-rolled` | DIVERGENCE | Engine | M | `confused-active` has empty effects; RAW is a per-turn 1d10 behavior table + no Bonus Actions/Reactions. |

### Cantrip / minor riders (quirks)

| ID | Sev | Owner | Fix | Finding |
|---|---|---|---|---|
| `ray-of-frost-no-slow` | QUIRK | Engine | S | Missing the -10 ft speed on hit (a near-identical `frosts-chill-slowed` condition already exists). |
| `chill-touch-no-anti-heal` | QUIRK | Engine | S | Missing "target can't regain HP until end of caster's next turn." |
| `shocking-grasp-no-oa-denial` | QUIRK | Engine | S | Missing "target can't make Opportunity Attacks" (an `isOpportunityAttack` fact already exists). |
| `chromatic-orb-no-leap` | QUIRK | Engine | M | Missing the leap-to-new-target-on-matching-d8s arm (distinct from Sorcerous Burst's explode). |
| `blindness-deafness-no-choice-no-saveends` | QUIRK | Engine | M | Hardwired to Blinded (no Deafened choice); the shared `blinded` condition has `recurringSave:null`, so the end-of-turn CON save to end never fires. |
| `l4-locate-creature` | QUIRK | Engine/Consumer | M | Directional sense unmodeled (leans divination/DM). `spell-coverage.test.ts:317`. |
| `l4-hallucinatory-terrain` | QUIRK | Engine/Consumer | M | Terrain illusion unmodeled (leans narrative). `spell-coverage.test.ts:316`. |

---

## Area 3 — Targeting / area-of-effect seam (the consumer-correctness frontier)

Where "zero divergences in targeting" actually lives. `Seam` = the engine must give the consumer enough to be correct; `Consumer` = engine support is already sufficient, dnd-web must wire it.

| ID | Sev | Owner | Fix | Finding |
|---|---|---|---|---|
| ~~`aoe-shape-coverage`~~ | **BLOCKER** | Seam | L | No shared cone/sphere/line/cube → covered-creatures rasterizer. `cast-spell` applied damage/saves to exactly the `targetIds` it was handed; every consumer hand-rolled geometry and would disagree with an expert's template (corner inclusion, cone width, diagonals). `src/engine/plan/cast-spell.ts`; `src/query/affordances.ts:433-515`. **Closed by slices 786 + 787.** 786 shipped the canonical rasterizer (`coveredCells` + `creaturesInSpellArea` / `engine.query.creaturesInSpellArea`, all six RAW shapes incl. the new `emanation`, line-of-effect filtered, cell-center template model). 787 wired the opt-in `CastSpellIntent.aim`: the engine derives membership from the rasterizer and owns it (skipping the per-target range gate, since RAW range is to the origin). Aim *placement*-range validation is the separate `positionless-range-los-trusts-consumer` seam. |
| `aoe-save-ignores-cover` | DIVERGENCE | Seam | M | `CastSpellIntent` has no `cover` field; the AoE save block ignores cover even though single-target saves honor it (`_save-roll.ts` `coverDexSaveBonus`). A creature in half cover gets no +2 Dex save vs Fireball. `src/engine/plan/cast-spell.ts` save block. |
| `unseen-attacker-general-rule` | DIVERGENCE | Seam | M | The general "can't see target → Disadvantage / can't be seen → attackers have Advantage" rule is modeled only for the Invisible *condition*; there's no `attackerCanSeeTarget` fact for darkness/obscurement/blindness. `src/engine/plan/attack.ts` fact slots. |
| `positionless-range-los-trusts-consumer` | DIVERGENCE | Consumer | S | Range/LoS is enforced only when both combatants are positioned AND the location has a map; positionless mode accepts any target. dnd-web MUST populate positions + a map or all range/LoS silently disables. `src/engine/plan/_spatial-gates.ts`. |
| `cover-not-derived` | DIVERGENCE | Consumer | M | Cover is a consumer-supplied enum on the intent; the engine never derives it from geometry/intervening creatures. The consumer's cover judgment is unchecked. `src/engine/plan/attack.ts`. |
| `lightlevel-packtactics-underfire` | DIVERGENCE | Consumer | S | The opt-in `lightLevel` / `attackerHasAllyAdjacentToTarget` facts no-op if unset — notably Kobold Sunlight Sensitivity (CR 1/8 staple) silently grants the monster a too-good attack. dnd-web must wire `lightLevel` for light-gated traits. (Also Area 7.) `docs/starter-pack-gaps.md:142-143`. |
| `input-validation-silent-trust` | DIVERGENCE | Seam | M | Planners throw on most illegal *single-target* input (safe-ish: visible failure), but silently trust AoE membership, positionless range, cover, and the advantage enum → a UI that lets those through yields a silent wrong result. |
| `los-equals-loe` | QUIRK | Seam | M | `hasLineOfEffect` === `hasLineOfSight` (one center-to-center ray; no sight-vs-effect distinction, no corner rule). Disagrees with RAW LoS around corners / through sight-but-not-effect blockers. `src/derive/terrain.ts:107`. |
| `legaltargets-surfaces-total-cover` | QUIRK | Seam | S | `legalTargets` doesn't pre-filter targets with Total Cover (which the planner then rejects) → a dead-end "valid" target. `src/query/affordances.ts:292-352`. |
| `frightened-dodge-facts-overstrict-default` | QUIRK | Consumer | S | `bearerCanSeeFearSource` / `targetCanSeeAttacker` default-apply: unset → disadvantage fires broadly (over-strict, never under). RAW-safe but visible if unwired. |
| `weaponinstance-not-validated` | QUIRK | Consumer | S | `legalTargets` computes reach off the main-hand weapon only; an unequipped/off-hand weapon choice isn't caught at the affordance layer. |
| `reaction-recentevents-required` | QUIRK | Consumer | S | Deflect Attacks + Countercharm need `recentEvents` passed to `reactionsForTrigger` or they silently don't correlate. `src/query/reactions.ts`. |
| `reaction-economy-sequencing` | QUIRK | Consumer | S | `reactionsForTrigger` returns intents; the consumer must dispatch each to spend the reaction. Mis-sequencing lets a creature react twice. |
| `encounterview-omits-scene-state` | QUIRK | Consumer | S | `buildEncounterView` exposes HP/AC/conditions/initiative but not positions/light/cover — the consumer's scene model is the sole authority feeding the facts above. `src/query/encounter-view.ts`. |

---

## Area 4 — Core combat correctness

The combat loop itself, independent of specific spells/items. (Engine targets SRD 5.2.1 / 2024; flag any 2014 carry-over.)

| ID | Sev | Owner | Fix | Finding |
|---|---|---|---|---|
| `drop-to-0-no-unconscious-arms` | DIVERGENCE | Engine | M | Dropping to 0 HP sets HP + death-save state but doesn't apply the Unconscious condition's arms: attackers' Advantage, auto-fail STR/DEX saves, Prone, drop items. Engine grants the auto-crit (synthetic-unconscious) but not the advantage-to-hit — internally inconsistent. `src/engine/reducers/combat.ts:88-137`; `src/engine/plan/attack.ts:766`. |
| `surprise-not-in-initiative` | DIVERGENCE | Engine | S | `RollInitiativeIntent` has no surprise channel; SRD 2024 surprise = Disadvantage on the initiative roll. `src/engine/plan/encounter.ts:356`. |
| `bonus-action-spell-restriction` | DIVERGENCE | Engine | M | Missing the 2024 rule: cast a spell with a Bonus Action → your Action spell that turn can only be a cantrip with an action casting time. A caster can cast two leveled spells in a turn. `src/engine/plan/cast-spell.ts:2123-2192`. |
| `grapple-shove-missing-gates` | DIVERGENCE | Engine | S | `planGrapple`/`planShove` skip the size (≤ one larger), free-hand, and `assertActorCanAct` gates; a stunned Medium PC can grapple a Gargantuan dragon. `src/engine/plan/contested.ts:61-194`. |
| `charmed-harmful-target-arm` | DIVERGENCE | Engine/Consumer | M | "Can't attack the charmer" is hardcoded for *weapon* attacks only; the "can't target the charmer with harmful abilities/magic" arm + the charmer's social-check Advantage are unenforced (the `charmed` condition has 0 effects). `src/engine/plan/attack.ts:1844-1855`. |
| `exhaustion-6-not-fatal` | DIVERGENCE | Engine | S | Exhaustion clamps to 6 but never kills; SRD = death at level 6. (Also Area 8.) `src/engine/reducers/combat.ts:165`. |
| `auto-crit-reach-overgrant` | QUIRK | Engine | S | Auto-crit vs Paralyzed/Unconscious uses `attackKind === 'melee'` as the "within 5 ft" proxy → a 10-ft reach weapon auto-crits, which RAW forbids. `src/engine/plan/attack.ts:1113-1121`. |
| `reaction-reset-timing` | QUIRK | Engine | S | `reactionUsedThisRound` resets at round end, not at the combatant's own `TurnStarted`; edge cases (initiative swap, extra turn) refresh a beat early/late. `src/engine/reducers/encounter.ts:233-236`. |
| `prone-cant-crawl` | QUIRK | Engine | M | Any move while Prone forces a stand-up (charges half-speed, removes the condition); no crawl modality, and crawl's +1 ft/ft cost is unmodeled. `src/engine/plan/movement.ts:225-282`. |
| `no-hostility-model` | QUIRK | Engine | M | Ranged-in-melee disadvantage and the auto-derived Pack-Tactics/flank fact treat *any* adjacent creature as hostile (an archer next to a friendly cleric takes disadvantage). Consumer can override per-intent. `src/engine/plan/attack.ts:817-836`. |
| `frightened-single-source-positional` | QUIRK | Engine | S | "Can't move closer to the fear source" enforced only for a single positioned source; positionless / multi-source / sourceless fear isn't constrained. `src/engine/plan/movement.ts:142-163`. |

---

## Area 5 — Build & leveling validation

Where the floor audits (feature *presence*) don't exercise choice-validation or one inert grant.

| ID | Sev | Owner | Fix | Finding |
|---|---|---|---|---|
| `background-ability-bonus` | **BLOCKER** `[verify]` | Engine | M | The 2024 background ability-score increase (+2/+1 or +1/+1/+1) field exists but has no engine reader and no allocation choice — a Sage's INT 15 shows 15, not 17, dropping the build's defining number. *Verify whether the engine is meant to own this or the consumer bakes it into base scores at chargen.* `src/content/packs/starter-pack.json:155-158`; `src/schemas/content/background.ts:8-11`. |
| `asi-distinctness` | DIVERGENCE | Engine | S | The "+1 to two abilities" ASI path accepts `['str','str']` (= illegal +2 to one); also lets Skilled/Magic Initiate pick a duplicate. `src/engine/plan/level-up.ts:165-174`; `src/engine/reducers/level-up.ts:80-90`. |
| `l4-feat-menu-eligibility` | DIVERGENCE | Engine | M | The L4 feat choice lists a static {ASI, Grappler} regardless of character: ignores Grappler's STR/DEX-13 prereq and omits Fighting-Style feats for classes with the Fighting Style feature. `src/engine/plan/level-up.ts:78-103`. |
| `multiclass-prereqs` | DIVERGENCE | Engine | M | No 13+-in-primary-ability check on entering a class; an INT 8 character can take a Wizard level. `src/engine/plan/level-up.ts:36-45`. |
| `multiclass-entry-proficiencies` | DIVERGENCE | Engine | M | No first-class-vs-multiclass-entry proficiency branch; leveling into a second class grants none of the reduced entry proficiencies. (Slot math is correct.) `src/engine/plan/level-up.ts`. |
| `grappler-feat-inert` | DIVERGENCE | Engine | M | `effects: []`; RAW grants +1 STR/DEX, advantage vs grappled, etc. — nothing fires. `starter-pack.json` grappler. |
| `savage-attacker-feat-inert` | DIVERGENCE | Engine | M | `effects: []`; RAW once-per-turn weapon-damage reroll never fires (granted by the Soldier background). |
| `half-caster-l1-slot` | QUIRK | Engine | S | A single-class L1 Paladin/Ranger shows a 1st-level slot (`ceil(1/2)=1`); RAW spellcasting starts at L2 (third-casters are guarded, half-casters aren't). `src/derive/spell-slots.ts:59-63`. |
| `alert-initiative-swap` | QUIRK | Engine | S | The Initiative-Proficiency arm is wired; the swap-initiative-with-an-ally arm isn't (likely intentional). |
| `ki-sorcery-point-undercount` | QUIRK `[verify]` | Engine | S | Possible off-milestone undercount of Monk Ki / Sorcery Points at L6-7 if the per-level formula isn't applied (the L4 audit suggests it now is — verify L6-7). |

---

## Area 6 — Base equipment mechanics

Every character uses weapons/armor, so base-equipment bugs are high-frequency.

| ID | Sev | Owner | Fix | Finding |
|---|---|---|---|---|
| ~~`heavy-property-str-dex`~~ | **BLOCKER** `[verify]` | Engine | S | The 2024 Heavy rule (Disadvantage on attacks if melee-Heavy & STR < 13, or ranged-Heavy & DEX < 13) was unimplemented. Canon-confirmed against `references/srd-markdown/equipment.md` ("Disadvantage on attack rolls with a Heavy weapon if it's a Melee weapon and your Strength score isn't at least 13, or if it's a Ranged weapon and your Dexterity score isn't at least 13"). **Closed by slice 782** (`heavyWeaponBelowThreshold`, effective-score aware, paired with removing the 2014 Small rule). |
| `armor-stealth-disadvantage` | DIVERGENCE | Engine | S | `stealthDisadvantage` is authored on every armor entry but never read; plate-wearers roll Stealth normally. `src/content/packs/starter-pack.json`; `src/derive/ability-check.ts`. |
| `armor-str-requirement-speed` | DIVERGENCE | Engine | M | `strRequirement` (chain 13 / splint+plate 15) is never read; under-STR heavy-armor wearers keep full speed (RAW -10 ft). `src/derive/speed.ts`. |
| `ammunition-not-consumed` | DIVERGENCE | Engine | M | Firing an Ammunition-property weapon doesn't consume or require ammo (no recover-half). `src/engine/plan/attack.ts`. |
| `untrained-armor-penalty` | DIVERGENCE | Engine | M | `armorProficiencies` is unread: wearing untrained armor imposes no STR/DEX-disadvantage / no-cast penalty, and a shield grants +2 AC without training. `src/schemas/content/class.ts:39`; `src/derive/ac.ts:126`. |
| `topple-save-bypasses-effect-stack` | QUIRK | Engine | M | Topple's CON save is a raw ability mod, bypassing `computeSavingThrow` → Bless/Bane/save-advantage don't apply. `src/engine/plan/weapon-mastery.ts:224-243`. |
| `graze-hardcodes-str` | QUIRK | Engine | S | Graze damage hardcodes base STR; RAW is "the ability modifier you used" and should read the effective score. `src/engine/plan/weapon-mastery.ts:303`. |
| `attune-prereq-not-validated` | QUIRK | Engine | S | The 3-item limit is enforced, but `attunementCondition` (class/species) and `requiresAttunement` aren't — any class can attune a class-locked item. `src/engine/reducers/inventory.ts:65-81`. |
| `offhand-not-different-weapon` | QUIRK | Engine | S | Off-hand TWF checks the weapon is Light but not that it differs from the main hand. `src/engine/plan/offhand-attack.ts:78-79`. |

---

## Area 7 — Monster runtime (the DM side)

The big rocks are content population, not engine machinery — the deferred-mechanics catalog is stale (multiattack, on-hit riders, breath recharge, pack tactics, at-will spells all shipped). See [gaps-monsters-deferred-mechanics.md](gaps-monsters-deferred-mechanics.md).

| ID | Sev | Owner | Fix | Finding |
|---|---|---|---|---|
| ~~`multiattack-unpopulated`~~ | **BLOCKER** | Engine (content) | L | Multiattack was authored on only 9/214 statblocks; ~169 in-scope RAW multiattackers (ogre, knight, all young/wyrmling dragons, owlbear, …) did one attack → roughly half their damage. Planner + schema support it. `src/schemas/content/monster.ts`; `src/derive/multiattack.ts`. **Closed by slices 789-792** — the full in-scope sweep, SRD-verified via workflow + adversarial-verify + apply-script, by CR band: **CR 0-1** (789-790, multiattack-poor: 3), **CR 2-5** (791: 64 + 88 weapons), **CR 6-11** (792: 46 + 67 weapons). The pack went from 11 → 122 wired multiattackers, +157 natural-weapon defs (weapons 80 → 237). Each ships base + unconditional secondary damage + the multiattack pattern; spot-checked against canon per band. **Follow-up** (tracked: `monster-onhit-rider-pass` below): ~24 size/charge-**gated** condition riders the flat sweep schema couldn't express. |
| `monster-onhit-rider-pass` | QUIRK | Engine (content) | M | The multiattack sweep (789-792) deferred ~24 **gated** on-hit riders the flat extraction schema couldn't express: size-gated grapple/prone (Aboleth, Chuul, Roper, Griffon, Otyugh, the giants' boulders, Chimera/Djinni storm bolts, T-Rex…) and riders needing new condition defs (Bearded Devil `infernal-wound`, Werebear lycanthropy `cursed`, Cloud Giant Thundercloud `incapacitated`, Oni `frightened`). Each monster's base + secondary damage + multiattack already ships; this is the focused rider pass to wire the gated conditions, modeled the way `boar-gore`/`wolf-bite` already gate riders (size predicate + the relevant fact). Cross-ref `dragon-rend-no-elemental-rider` (the young dragons reuse the pre-existing incomplete `*-dragon-rend` defs). |
| ~~`no-actions-field`~~ | **BLOCKER** | Engine (schema+content) | M | `MonsterStatblock` had no `actions` field, so a single-attack monster's natural weapon was unlinked/un-queryable; consumers hardcoded `wolf → wolf-bite` and diverged. `src/schemas/content/monster.ts`. **Closed by slice 788** — new `actions: [{ name, weaponId }]` field + `monsterAttackActions` query + pack-integrity weaponId guard; the canonical consumer (combat-fuzz) was rewired off its hardcoded map to read `actions[0]` (byte-identical). Full `actions` population across all statblocks rides along with the `multiattack` sweep below. |
| `spellcaster-npc-no-spells` | **BLOCKER** | Engine (primitive+content) | L | Mage / Priest / Druid / Cultist Fanatic carry no spell list (the per-day/slot casting envelope primitive doesn't exist; only at-will `GrantSpell` does). A Mage is a stick-wielder. |
| `dragon-rend-no-elemental-rider` | DIVERGENCE | Engine (content) | S | Dragon Rend weapons miss the RAW +1dX elemental on-hit rider (machinery exists). |
| `weapon-material-qualifier` | DIVERGENCE | Engine (enum+content) | M | `GrantResistance.qualifier` is only nonmagical/magical — no silvered/adamantine; a party with silvered weapons still sees devil/lycanthrope resistance applied. `src/schemas/effects.ts:257`. |
| `drain-undead-arms` | DIVERGENCE | Engine | M | Wraith/Specter/Wight max-HP drain, Shadow STR drain + on-kill spawn are inert (no max-HP-penalty / ability-drain / on-kill-spawn rider). |
| `ooze-split-on-damage` | DIVERGENCE | Engine | M | Black Pudding / Ochre Jelly don't split on slashing/lightning (needs `event.damageType` fact + spawn-copy). |
| `monster-parry-reaction` | DIVERGENCE | Engine | M | No generic monster reaction; Knight/Bandit Captain/Gladiator can't Parry (+2 AC vs one melee hit). |
| `single-target-recharge` | QUIRK | Engine | M | Recharge tracking exists for breath weapons but not for single-target/condition recharge actions (Giant Spider Web). |
| `legendary-lair-actions` | QUIRK | Engine | L | No legendary/lair-action mechanic; in scope this affects only Aboleth (CR 10). Becomes a blocker above CR 11 (out of scope). |
| `disease-generic-condition` | QUIRK | Engine (content) | S | No generic `diseased` condition; each disease (Death Dog) is bespoke. |
| `variable-ac-by-posture` | QUIRK | Engine | S | Statblock AC is a single number; prone/posture AC variants (Ankheg 14/11) are dropped. |

Cross-ref: `lightlevel-packtactics-underfire` (Sunlight Sensitivity / Pack Tactics) and `aoe-shape-coverage` (breath-weapon cones) are in Area 3.

---

## Area 8 — Exploration / non-combat pillar

| ID | Sev | Owner | Fix | Finding |
|---|---|---|---|---|
| ~~`no-hit-die-spend-planner`~~ | **BLOCKER** | Engine | M | The short rest's main benefit had no API: `HitDieSpentEvent` + reducer existed but there was no `planSpendHitDie`. A consumer couldn't heal on a short rest through the engine; the roll was uncaptured if hand-built. `src/engine/reducers/resources.ts:44-55`; absent in `src/engine/plan/index.ts`. **Closed by slice 785** (`planSpendHitDie` / `engine.plan.spendHitDie`: rolls the first-with-dice enrollment's Hit Die + effective-CON modifier, RAW minimum 1; gates 0-HP and no-dice; the multiclass die-size *choice* is the only deferred remainder — the engine spends in class-array order). |
| `exhaustion-6-not-fatal` | DIVERGENCE | Engine | S | (See Area 4.) Reaching exhaustion 6 doesn't kill. |
| `encumbrance-variant-2014` | DIVERGENCE | Engine | M | The character sheet reports 2014 variant encumbrance tiers (encumbered > 5×STR, etc.); SRD 5.2.1 has no variant — only carry = STR×15 and Speed ≤ 5 over capacity. `src/derive/encumbrance.ts:5-45`; `src/query/character-sheet.ts:314`. |
| `falling-no-prone` | DIVERGENCE | Engine | S | Falling applies damage but not the Prone-on-landing condition. `src/engine/plan/falling.ts:125-146`. |
| `carry-capacity-size` | QUIRK | Engine | M | Carry capacity isn't size-scaled (Tiny ×7.5 / Large ×30 / …) and has no Drag/Lift/Push column. `src/derive/carrying-capacity.ts:62-80`. |
| `over-capacity-speed-5` | QUIRK | Engine | M | The only RAW carry consequence (Speed ≤ 5 over max) isn't applied. `src/derive/speed.ts`. |
| `falling-averaged-not-rolled` | QUIRK | Engine | S | Falling deals averaged damage (`round(dice×3.5)`), not rolled dice. `src/engine/plan/falling.ts:18,40-43`. |
| `no-jump-distance` | QUIRK | Engine | S | Long/High jump formulas unmodeled (two pure derives). |
| `climb-swim-crawl-cost` | QUIRK | Engine | M | The +1 ft/ft climb/swim/crawl surcharge isn't applied. `src/engine/plan/movement.ts`. |
| `no-suffocation` | QUIRK | Engine | M | No holding-breath / suffocation → exhaustion mechanic. |
| `no-environmental-hazards` | QUIRK | Engine | M | Burning / Dehydration / Malnutrition / extreme cold-heat unmodeled. |
| `long-rest-no-24h-lockout` | QUIRK | Engine | M | No once-per-~24h cadence (rest advances no clock). `src/engine/plan/rest.ts:138-200`. |
| `rest-no-min-1hp` | QUIRK | Engine | S | A 0-HP/dying character can long-rest to full (RAW needs ≥ 1 HP to start). `src/engine/reducers/rest.ts:119-122`. |
| `no-group-check-helper` | QUIRK | Consumer | S | No group-check aggregation helper (consumer math over per-character checks). |

Cross-ref: `long-rest-half-hd` is the Area 1 headline.

---

## Area 9 — Consumer (dnd-web) duties & doc reconciliation

Engine support is sufficient (or by-design out of scope); these route to the dnd-web session as a hand-off, except the doc fix.

| ID | Sev | Owner | Fix | Finding |
|---|---|---|---|---|
| `consumer-populate-positions` | DIVERGENCE | Consumer | — | Populate combatant positions + a location map, or range/LoS/OA enforcement silently disables (Area 3 `positionless-range-los-trusts-consumer`). |
| `consumer-populate-lightlevel` | DIVERGENCE | Consumer | — | Supply `lightLevel` for light-gated traits (Sunlight Sensitivity, Cloak of the Bat) or they no-op. |
| `consumer-supply-cover` | DIVERGENCE | Consumer | — | Classify and pass cover per attack/save (engine doesn't derive it). |
| `consumer-reaction-recentevents` | QUIRK | Consumer | — | Pass `recentEvents` so Deflect Attacks / Countercharm correlate. |
| `consumer-scene-state-authority` | QUIRK | Consumer | — | The consumer's scene model is the sole authority for light/cover/positions (not in any engine view model). |
| `consumer-aoe-geometry` | QUIRK | Consumer | — | Until `aoe-shape-coverage` ships an engine helper, the consumer's cone/sphere/line rasterizer is the source of truth (and the divergence risk). |
| `engine-scope-encumbrance-doc` | QUIRK | Docs | S | [engine-scope.md](engine-scope.md) says encumbrance is "not modeled," but two derivations exist and one feeds the sheet — reconcile (and align with the Area 8 fixes). |
| `verify-reaction-registry-l1-7` | QUIRK `[verify]` | Engine | S | Confirm the `reactionsForTrigger` registry covers the reactions an L1-7 expert expects (e.g. Hellish Rebuke) or document them as event-stream-only. |

---

## Confirmed correct / by-design (checked, not work items)

Recorded so future audits don't re-flag them:

- **Class/subclass features L1-7** — SRD-complete, CI-guarded (`tests/audit/srd-l1-complete.test.ts` … `srd-l7-complete.test.ts`).
- **2024 exhaustion model** — cap 6, -2/level on d20 tests, -5 ft/level speed; long rest -1. RAW 2024 (not the 2014 tiered table). The *death-at-6* arm is the only gap (Area 4/8).
- **Grapple/Shove use the 2024 saving-throw mechanic** (Str-or-Dex vs DC 8+STR+PB), not a 2014 contest. Only the size/free-hand gates are missing (Area 4).
- **Crit doubles dice not modifier; advantage/disadvantage cancel to one die; Prone melee-advantage/ranged-disadvantage asymmetry + attacker disadvantage; ranged-in-melee disadvantage; concentration CON save = max(10, half) and ends on incapacitation; death saves / massive-damage instant death; teleport/forced movement don't provoke OAs; reach-weapon 10 ft OA threat.**
- **Multiclass spell-slot math** — full + ceil(half/2), the 2024 round-up rule. Correct.
- **Wild Shape / Channel Divinity recharge** — `partialShortFullLong` (RAW); the class-features doc text is stale.
- **`incapacitated` condition has no attack/AC effects** — correct for 2024 (no 2014 "attackers advantage" creep); it only blocks actions + breaks concentration.
- **Skills/checks/passives** — passive ±5 for adv/disadv, 18 skills + passives on the sheet, Help grants advantage, contests exist, exhaustion/proficiency/advantage layered correctly.
- **Duration/time model** — `durationRounds` / `durationMinutes` + in-game clock + `planExpireSpellDurations` + concentration; coherent (the only gap is rest not advancing the clock, Area 8).
- **Breath-weapon recharge economy + per-target save/half** — RAW-correct; only the cone's target *selection* is consumer-supplied (Area 3).
- **Vision senses / Opportunity-Attack dispatch / blinded-deafened sense-gated auto-fail** — by-design consumer seams per [engine-scope.md](engine-scope.md).
