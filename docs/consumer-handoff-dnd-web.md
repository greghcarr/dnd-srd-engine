# Consumer hand-off — dnd-web (L7 audit, consumer-owned rows)

**For:** the dnd-web session (the React/Phaser consumer that bundles this engine from source via the `../dnd-srd-engine` Vite alias; the former dndbnb app is now a merged React subtree at `dnd-web/src/dndbnb/`, not a separate consumer).

**Why this exists.** The engine half of the [L7 SRD-completion audit](l7-completion-audit.md) is **done** — every engine fix, edition-drift correction, spell arm, and geometry primitive through level 7 has shipped (the last engine row, corner-aware line of sight, closed at slice 901). What's left are the **consumer-coordinated seams**: table-level facts the rules *consume* but the engine deliberately never *derives* — positions, light, cover, sight lines, area-of-effect membership — because they live in your scene model, not in a die roll ([engine-scope.md](engine-scope.md)). This doc distils the open audit rows into a prioritized, grounded task list, with each seam's **current wiring status verified against the dnd-web checkout (2026-06-18)**.

## How a seam works

Every seam is an **optional field on an intent** (or an argument to a query). Omit it → the engine falls back to a safe default (usually "no effect" / "as if unobstructed", or, for a couple, the conservative direction that is RAW-safe but over-strict). Wire it → the corresponding rule fires. Nothing here is a breaking change; it's additive precision. The engine validates the *well-formedness* of these enums (slice 900) but cannot validate their *truth* without owning positions — that judgment is yours.

---

## Already wired — no action (verified in dnd-web today)

These audit rows are **satisfied** by the current dnd-web code; listed so the dnd-web session doesn't re-do them:

| Seam | Audit row(s) | Where in dnd-web |
|---|---|---|
| Combatant `position` + location `map` + `cellSizeFeet` | `positionless-range-los-trusts-consumer`, `consumer-populate-positions` | `src/spatial/engine-positions.ts`, `src/engine/engine-bridge.ts` (map), `src/game/duel-session.ts` (cell size). Range / LoS / OA enforcement is live. |
| `recentEvents` → `reactionsForTrigger` | `reaction-recentevents-required`, `consumer-reaction-recentevents` | `src/game/duel-session.ts` (post-damage window passes the triggering `AttackRolled`). Deflect Attacks / Countercharm correlate. |
| Reaction dispatch (each reaction intent committed, not just shown) | `reaction-economy-sequencing` | `src/game/reaction-dispatch.ts` routes each `CorrelatedReaction` to its planner and commits — the reaction economy is actually spent. |
| Scene model is the cover/light/position authority | `consumer-scene-state-authority`, `encounterview-omits-scene-state` | dnd-web owns the scene; `buildEncounterView` intentionally omits these — by design. |

---

## Gaps to wire (priority order)

> **Consumer status — dnd-web (2026-06-21).** Gaps #1, #2, #3, #7 are **WIRED** in dnd-web (per-gap notes below; each its own commit on dnd-web's `dev`, `typecheck` + `build` green). #4 and #5 are **verified not actionable** against dnd-web's current scene model. #6 remains open. Audit-row effect: `consumer-populate-lightlevel`, `cover-not-derived` / `consumer-supply-cover`, and `consumer-aoe-geometry` are now consumer-satisfied; `frightened-dodge-facts-overstrict-default` and `weaponinstance-not-validated` are consumer-N/A until a darkness model / weapon picker exists; `no-group-check-helper` stays open.

### 1. `lightLevel` — HIGH
**Engine field:** `AttackIntent.lightLevel: 'bright' | 'dim' | 'darkness'` (also on check intents).
**Status in dnd-web:** WIRED (previously: attack intents were `{ attackerId, targetId, weaponInstanceId }` only).
**Why it matters:** Kobold Sunlight Sensitivity (a CR 1/8 staple) gates Disadvantage on `bright`; unset → the monster silently keeps a too-good attack. Cloak of the Bat Stealth advantage gates on `dim`/`darkness`.
**Do:** derive the light at the target's cell from your scene and pass it on the attack/check intent. Audit rows: `lightlevel-packtactics-underfire`, `consumer-populate-lightlevel`.
> **WIRED in dnd-web (2026-06-21, commit 99a8809).** `src/spatial/scene-light.ts` is the lighting authority (uniform `'bright'` — the arena map carries no light data); `DuelSession.resolveAttack` enriches every attack. dnd-web issues no check intents, so the attack intent is the only home. Closes `consumer-populate-lightlevel`.

### 2. Cover — HIGH
**Engine fields:** `AttackIntent.cover: 'none' | 'half' | 'three-quarters' | 'total'` (+2 / +5 AC & Dex saves; `'total'` → can't be targeted directly). For area spells, `CastSpellIntent.coverByTargetId: Record<targetId, CoverKind>` (per-target, applied to **Dex** spell saves). The same per-target map can be passed to `legalTargets(..., coverByTargetId)` so a `'total'`-cover candidate is pre-filtered (the engine already rejects it at the planner — slices 899/900).
**Status in dnd-web:** WIRED (previously: no `cover` / `coverByTargetId` on any intent).
**Why it matters:** a creature behind half cover currently gets no +2 AC / +2 Dex save; the engine never invents cover from intervening walls/creatures — that's your geometry call.
**Do:** classify cover from your scene (intervening obstacle vs. the attack's origin) and pass it. Audit rows: `cover-not-derived`, `consumer-supply-cover`.
> **WIRED in dnd-web (2026-06-21, commit 4ec867e).** `src/spatial/cover.ts` is the cover authority: total cover delegated to the engine's `hasLineOfEffect`, half vs three-quarters via the standard corner-count over the engine's blockers (impassable terrain, closed/locked doors). `DuelSession.resolveAttack` sets `AttackIntent.cover`; `commitSpell` sets `CastSpellIntent.coverByTargetId` for explicitly-targeted creatures (caster origin). The `legalTargets` pre-filter was intentionally skipped — its existing `hasLineOfSight` filter already drops exactly the `'total'`-cover set. Cover for `aim`-derived area targets is left at the engine's safe no-cover default (a noted follow-up). Closes `cover-not-derived` / `consumer-supply-cover`.

### 3. Area-of-effect membership via `aim` — MEDIUM (row is now stale in your favor)
**Engine field:** `CastSpellIntent.aim: { x, y }` (in **feet**) — the opt-in flag (slice 787) that makes the planner derive *which creatures are in the cone/sphere/line/cube* from the engine's own rasterizer (`coveredCells` / `engine.query.creaturesInSpellArea`, slice 786), line-of-effect filtered, and own that membership.
**Status in dnd-web:** WIRED (previously: hand-picked `targetIds`, and `targetPosition` for persistent zones — **the zone *center*, a different field from `aim`** — which did not trigger membership derivation).
**Why it matters:** the audit row `consumer-aoe-geometry` was written "until the engine ships an AoE helper" — **it shipped.** Adopting `aim` moves the cone/sphere "who's actually hit" decision out of your UI and into the engine's expert-correct template (corner inclusion, diagonals, line of effect around walls — now corner-aware per slice 901), eliminating the divergence-risk the row flags. Audit row: `consumer-aoe-geometry`.
**Do:** for area spells, set `aim` to the burst point / direction instead of (or alongside) curating `targetIds`.
> **WIRED in dnd-web (2026-06-21, commit ca00ac3).** A `points`-targeted cast (`DuelController.onCellClick`) now passes the picked point as `aim` (alongside `targetPosition` for zone mechanics); `commitSpell` threads it onto `CastSpellIntent`. Instantaneous area spells (Fireball / Burning Hands / Thunderwave / Sleep) previously hit nobody (empty `targetIds`); the engine now derives membership. Verified end-to-end against a tactical duel: with `aim`, an in-blast enemy rolled its Dex save and took Fireball damage; with `aim` omitted, zero. Closes `consumer-aoe-geometry`.

### 4. Sight facts — MEDIUM (defaults are RAW-safe)
**Engine fields:** `AttackIntent.attackerCanSeeTarget` (`false` → Disadvantage vs. an unseen target), `AttackIntent.targetCanSeeAttacker` (`false` → attacker Advantage + suppresses the target's Dodge disadvantage), `bearerCanSeeFearSource` (Frightened's disadvantage/can't-approach). The engine support shipped (slice 886 generalized the unseen-attacker rule beyond the Invisible condition).
**Status in dnd-web:** NOT wired (attacks carry no visibility context; LoS is only post-filtered for bonus-action targets).
**Why it matters:** these default the **safe** direction — `targetCanSeeAttacker` unset → Dodge disadvantage fires broadly (over-strict, never under; row `frightened-dodge-facts-overstrict-default`). So this is about *precision* once darkness / Blinded / Invisible / obscurement is in play, not a silent wrong result today.
**Do:** when your scene has obscurement/blindness/invisibility, set the relevant sight booleans per attack. Audit row: `frightened-dodge-facts-overstrict-default`.
> **NOT ACTIONABLE YET in dnd-web (verified 2026-06-21).** These booleans add value only for **darkness / heavy obscurement**, which dnd-web's scene doesn't model (light is uniformly `'bright'`). The other triggers — **Invisible** (condition + the engine's blindsight/tremorsense/truesight sense model) and **Blinded** (condition) — are already folded into the engine's advantage math from `appliedConditions`, so deriving these booleans from those conditions would be redundant and risk double/incorrect handling. `frightened-dodge-facts-overstrict-default` stays at its RAW-safe default until a darkness/obscurement scene model lands.

### 5. Weapon-instance validation in `legalTargets` — LOW
`legalTargets` computes reach off the **main-hand** weapon only. If your UI lets a player choose an off-hand / unequipped weapon for an attack, validate the weapon choice at dispatch. Audit row: `weaponinstance-not-validated`.
> **NOT ACTIONABLE in dnd-web (verified 2026-06-21).** dnd-web has no weapon picker — `DuelSession.commitAttack` always attacks with the main-hand weapon (the exact weapon `legalTargets` reaches off). Nothing to validate (`weaponinstance-not-validated`) until a weapon picker exists.

### 6. Group ability checks — NEW AFFORDANCE
No engine helper exists (`no-group-check-helper`, owner Consumer): the SRD group check ("if at least half the group succeeds, the group succeeds") is consumer math over the per-character checks the engine already resolves. This also needs ability checks surfaced as a player action in your UI (today only the AI and the engine's own death saves roll checks). Audit row: `no-group-check-helper`.
> **OPEN in dnd-web — net-new feature, not a seam wire (2026-06-21).** Unlike the other rows this isn't an optional intent field; it needs new UI (an ability-check player action) plus the group-check tally, and fits a 1v1/2v2 duel poorly (no party). Deferred; `no-group-check-helper` remains open.

### 7. Storm's Thunder reaction dispatch — LOW (new in slice 904)
The engine now surfaces the Goliath **Storm's Thunder** reaction via `reactionsForTrigger` (it was wired as a planner long ago but never discoverable). Your `src/game/reaction-dispatch.ts` switch handles `StonesEndurance` but not `StormsThunder`, so a Storm's Thunder Goliath's reaction currently falls to the no-op `default` (no typecheck break — `CorrelatedReaction` is a `ReturnType`, and the default is graceful — just no effect). Add a `case 'StormsThunder': return { events: engine.plan.stormsThunder(state, intent).events, prevented: false };` (mirroring the `StonesEndurance` case). The planner already exists.
> **WIRED in dnd-web (2026-06-21, commit 0c03feb).** Added the `case 'StormsThunder'` to `src/game/reaction-dispatch.ts` exactly as specified.

---

## Not dnd-web's job (engine-side residuals — both now closed)

Both engine-repo residuals are done, so **every remaining open audit row is consumer work**:

- `verify-reaction-registry-l1-7` — **closed (slice 904).** Surfaced one real engine gap (Storm's Thunder, now wired) and confirmed the reaction-cast spells are by-design event-stream-only. Created the small dnd-web follow-up in gap #7 above.
- `engine-scope-encumbrance-doc` — **closed (slice 905).** [engine-scope.md](engine-scope.md) now describes the carry/encumbrance derivations under "What the engine tracks."

---

## Quick reference — seam → intent field

| Fact | Field | On | Default when omitted |
|---|---|---|---|
| Ambient light | `lightLevel: 'bright'\|'dim'\|'darkness'` | `AttackIntent`, check intents | predicate false (light-gated traits no-op) |
| Cover (single target) | `cover: 'none'\|'half'\|'three-quarters'\|'total'` | `AttackIntent` | no cover bonus |
| Cover (per AoE target) | `coverByTargetId: Record<id, CoverKind>` | `CastSpellIntent` | no cover bonus on Dex saves |
| Cover pre-filter | `coverByTargetId` arg | `legalTargets(...)` | no total-cover filtering |
| AoE membership | `aim: { x, y }` (feet) | `CastSpellIntent` | trusts explicit `targetIds` |
| Attacker sees target | `attackerCanSeeTarget: boolean` | `AttackIntent` | no change |
| Target sees attacker | `targetCanSeeAttacker: boolean` | `AttackIntent` | true (Dodge disadvantage applies) |
| Frightened sees source | `bearerCanSeeFearSource: boolean` | attack/check intents | true (disadvantage applies) |

See [api-overview.md](api-overview.md) and [engine-scope.md](engine-scope.md) for the full surfaces.
