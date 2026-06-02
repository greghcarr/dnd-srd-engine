# Archive: slices 567-568

Per-slice detail extracted from the live [CHANGELOG.md](../../CHANGELOG.md) (slice 576, to keep the live file under the 60 KB single-Read ceiling). These slices closed the highest-impact L1 RAW drifts surfaced by the deep audit: condition effect-list completeness on 5 of 15 RAW conditions (567) + three attack-resolution gates (within-5-ft auto-crit, Prone asymmetric attacker advantage, Grappled non-grappler disadvantage) (568).

**Engine + content (slice 568): three attack-resolution gates — within-5-ft auto-crit, Prone asymmetric attacker advantage, Grappled non-grappler disadvantage**

Closes three of the engine-side RAW drifts surfaced by the deep audit (slice 567 was the content-side companion). Each gate adds a new attack-resolution behavior that was missing:

**1. Paralyzed / Unconscious within-5-ft auto-crit** (RAW Paralyzed + Unconscious: "Any attack that hits the creature is a critical hit if the attacker is within 5 feet of the creature.")

[src/engine/plan/attack.ts](../../src/engine/plan/attack.ts): the `critical` computation now considers `targetAutoCritsFromMelee` as a second source (alongside the existing `usedRoll >= critThreshold`). The check fires when the attack is melee (proxy for "within 5 feet" — the common case; reach weapons at 10 ft over-grant under this approximation until positional state is modeled) AND the target carries one of: `paralyzed`, `held-paralyzed-active` (Hold Person / Hold Monster — composes Paralyzed per RAW), `unconscious`, or HP <= 0 (synthetic-unconscious case `findActorBlockingCondition` returns).

**2. Prone asymmetric attacker advantage** (RAW Prone: melee attacks against the bearer have Advantage; ranged attacks have Disadvantage.)

[src/engine/plan/attack.ts](../../src/engine/plan/attack.ts): a new `targetSideAttackerFacts` map is built early (carries `event.attackKind` from `weaponDef.attackKind`) and passed to `targetEffects.grantsAdvantageToAttackers(...)` — the existing read site already supported a facts argument (slice 262) but no prior caller used it. The pre-existing `attackerFacts` map (consumed by `imposesDisadvantageOnAttackers`) gains the same `event.attackKind` entry for symmetry. Prone's content now carries two predicate-gated entries: `GrantAdvantageToAttackers { condition: event.attackKind == 'melee' }` and `ImposeDisadvantageOnAttackers { condition: event.attackKind == 'ranged' }`. The bearer-side attack disadvantage stays.

**3. Grappled disadvantage on attacks vs non-grappler** (RAW Grappled: the bearer's attacks have Disadvantage on creatures other than the grappler.)

[src/engine/plan/attack.ts](../../src/engine/plan/attack.ts): `attackerSelfAdvantageFacts` gains a new fact `bearer.targetIsNotGrappler` (computed inline: true iff the attacker carries a `grappled` condition whose `sourceCharacterId !== input.targetId`). Grappled's content gains a predicate-gated `SetAdvantage { on: 'attack', mode: 'disadvantage', condition: bearer.targetIsNotGrappler == true }`. Attacking the grappler itself still rolls 'none' (the predicate evaluates false).

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): Prone gains 2 effect entries (melee-advantage + ranged-disadvantage); Grappled gains 1 entry (non-grappler disadvantage). Pre-existing arms preserved.

**Tests** ([tests/unit/engine/slice-568-attack-gates.test.ts](../../tests/unit/engine/slice-568-attack-gates.test.ts), 11 cases): per-arm assertions —
- within-5-ft auto-crit: melee hit vs paralyzed / unconscious / held-paralyzed-active / synthetic-unconscious (HP <= 0) all → critical = true; ranged hit vs paralyzed → NOT crit (RAW "within 5 ft"); melee hit vs Stunned → NOT crit (RAW exempts Stunned from auto-crit).
- Prone asymmetric: melee attack → 'advantage'; ranged attack → 'disadvantage'.
- Grappled: bearer attacking grappler → 'none'; bearer attacking non-grappler → 'disadvantage'; non-Grappled attacker → 'none' (control).

**Audit:**
- **Names:** `targetAutoCritsFromMelee` is the predicate at the read site; `targetSideAttackerFacts` mirrors the existing `attackerFacts` / `attackerSelfAdvantageFacts` naming axis; `bearer.targetIsNotGrappler` follows the slice-272 / 273 `bearer.<predicate>` fact-path convention.
- **DRY:** the `event.attackKind` fact is populated in both fact maps with the same string source (`weaponDef.attackKind`); a hypothetical shared constant would add one line and read less clearly.
- **SRP:** within-5-ft auto-crit adds ~10 lines around the existing `critical` line; Prone wiring is one new fact + one new call argument; Grappled wiring is one new fact and an inline closure to derive it.
- **Magic numbers:** none.
- **at-threading:** unchanged.
- **Mechanical outcomes asserted:** 11 per-gate cases, plus negative controls for ranged (auto-crit doesn't fire) and Stunned (RAW exempt), plus the grappler-as-target negative for Grappled.

**Pattern-check:** the within-5-ft proxy is "melee attack ⇒ within 5 ft" — an over-grant for reach weapons at 10 ft. Positional state is the right long-term primitive; until then, the approximation matches existing planner patterns (e.g., Sneak Attack's flank arm uses ally-adjacent facts, not exact distances). The two new facts (`event.attackKind`, `bearer.targetIsNotGrappler`) are predicate paths future content can reuse without re-wiring the planner.

---

**Content (slice 567): condition effect-list completeness sweep — RAW drift on 5 of 15 conditions**

Closes a class of RAW drift surfaced by the post-cycle deep L1 audit (the audit fanned across 6 agents; condition-effects was the highest-impact dimension found). Pre-slice 5 of the 15 RAW conditions had under-modeled effect arrays:
- **Blinded**: missing `GrantAdvantageToAttackers`.
- **Paralyzed**: missing `GrantAdvantageToAttackers`.
- **Stunned**: missing `ModifySpeed walk:0` AND `GrantAdvantageToAttackers`.
- **Unconscious**: missing `GrantAdvantageToAttackers`.
- **Petrified**: missing `GrantAdvantageToAttackers` AND auto-fail STR/DEX saves (RAW: Petrified composes Paralyzed).

Only `restrained` carried `GrantAdvantageToAttackers` pre-slice. The drift meant attackers got no Advantage against a Paralyzed (Hold Person'd), Stunned, Unconscious, Petrified, or Blinded target — a major L1 combat under-modeling, since the whole *point* of these debuffs is to weaponize the bearer's vulnerability.

RAW sources ([references/srd-markdown/rules-glossary.md](../../references/srd-markdown/rules-glossary.md)):
- Blinded: "...Attack rolls against the creature have advantage..."
- Paralyzed: "...Attack rolls against the creature have advantage. Any attack that hits the creature is a critical hit if the attacker is within 5 feet of the creature."
- Stunned: "...the creature has Speed 0... Attack rolls against the creature have advantage."
- Unconscious: "...The creature has Speed 0... Attack rolls against the creature have advantage. Any attack that hits the creature is a critical hit if the attacker is within 5 feet of the creature."
- Petrified (composes Paralyzed): "...auto-fails STR and DEX saving throws... Attack rolls against the creature have advantage."

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): the 5 condition entries gain the missing effect-array members. Every change is additive (no removed entries; existing arms are preserved).

**Deferred to follow-up slices** (each its own engine work, not pure content):
- **Paralyzed + Unconscious within-5-ft auto-crit** → slice 568 (needs attack-resolution range check; the existing crit pipeline doesn't gate on attacker-target distance).
- **Prone asymmetric attacker advantage** (melee Advantage, ranged Disadvantage) → folded into slice 568 since the `event.attackKind` fact has to be added to the attacker-side facts map.
- **Grappled disadvantage on attacks vs non-grappler** → folded into slice 568 (needs `bearer.targetIsGrappler` fact derived from the bearer's condition source).
- Incapacitated composition arms (action / bonus / reaction block) stay engine-hardcoded via [`_actor-state.ts`'s `ACTION_BLOCKING_CONDITIONS`](../../src/engine/plan/_actor-state.ts) — already wired for paralyzed / stunned / petrified / unconscious, no slice work needed.

**Tests** ([tests/unit/engine/slice-567-condition-effect-completeness.test.ts](../../tests/unit/engine/slice-567-condition-effect-completeness.test.ts), 14 cases): each new arm asserted at pack-declaration level (GrantAdvantageToAttackers on each of the 5 conditions; Stunned Speed 0; Petrified auto-fail STR + DEX); pre-existing arms regression-smoke-checked (bearer-side attack disadvantage on Blinded; resistance + immunity on Petrified; existing Speed 0 + auto-fails on Paralyzed / Unconscious / Stunned).

**Audit:**
- **Names:** all added entries reuse the canonical effect-kind names (`GrantAdvantageToAttackers`, `ModifySpeed walk:0`, `SetAdvantage mode:'auto-fail'`).
- **DRY:** 5 conditions get the same shape (`{ kind: 'GrantAdvantageToAttackers' }`); not factored into a shared snippet because content is JSON and inlining is clearest at this scale.
- **SRP:** pure content edit — no engine code touched. The 14 tests assert pack declarations, not behavior (which is exercised by the engine's existing attack-roll resolution path through `targetEffects.grantsAdvantageToAttackers()` — slice 262 wired this read site).
- **Magic numbers:** none added.
- **at-threading:** N/A (no new event emission).
- **Mechanical outcomes asserted:** 14 per-condition pack-declaration assertions plus 5 regression-smoke checks for pre-existing arms.

**Pattern-check:** the under-modeled-condition class likely has more instances in the rider variants (~125). Future slice 582 (condition behavior tests) will sweep the entire condition catalog — both RAW + rider variants — and surface any other missed effect entries.

---
