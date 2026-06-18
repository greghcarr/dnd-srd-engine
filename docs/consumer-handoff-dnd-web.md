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

### 1. `lightLevel` — HIGH
**Engine field:** `AttackIntent.lightLevel: 'bright' | 'dim' | 'darkness'` (also on check intents).
**Status in dnd-web:** NOT wired (attack intents are `{ attackerId, targetId, weaponInstanceId }` only).
**Why it matters:** Kobold Sunlight Sensitivity (a CR 1/8 staple) gates Disadvantage on `bright`; unset → the monster silently keeps a too-good attack. Cloak of the Bat Stealth advantage gates on `dim`/`darkness`.
**Do:** derive the light at the target's cell from your scene and pass it on the attack/check intent. Audit rows: `lightlevel-packtactics-underfire`, `consumer-populate-lightlevel`.

### 2. Cover — HIGH
**Engine fields:** `AttackIntent.cover: 'none' | 'half' | 'three-quarters' | 'total'` (+2 / +5 AC & Dex saves; `'total'` → can't be targeted directly). For area spells, `CastSpellIntent.coverByTargetId: Record<targetId, CoverKind>` (per-target, applied to **Dex** spell saves). The same per-target map can be passed to `legalTargets(..., coverByTargetId)` so a `'total'`-cover candidate is pre-filtered (the engine already rejects it at the planner — slices 899/900).
**Status in dnd-web:** NOT wired (no `cover` / `coverByTargetId` on any intent).
**Why it matters:** a creature behind half cover currently gets no +2 AC / +2 Dex save; the engine never invents cover from intervening walls/creatures — that's your geometry call.
**Do:** classify cover from your scene (intervening obstacle vs. the attack's origin) and pass it. Audit rows: `cover-not-derived`, `consumer-supply-cover`.

### 3. Area-of-effect membership via `aim` — MEDIUM (row is now stale in your favor)
**Engine field:** `CastSpellIntent.aim: { x, y }` (in **feet**) — the opt-in flag (slice 787) that makes the planner derive *which creatures are in the cone/sphere/line/cube* from the engine's own rasterizer (`coveredCells` / `engine.query.creaturesInSpellArea`, slice 786), line-of-effect filtered, and own that membership.
**Status in dnd-web:** NOT wired. You pass hand-picked `targetIds` (trusted as-is) and, for persistent zones, `targetPosition` — **note `targetPosition` is the zone *center* for zone mechanics, a different field from `aim`**; it does not trigger membership derivation.
**Why it matters:** the audit row `consumer-aoe-geometry` was written "until the engine ships an AoE helper" — **it shipped.** Adopting `aim` moves the cone/sphere "who's actually hit" decision out of your UI and into the engine's expert-correct template (corner inclusion, diagonals, line of effect around walls — now corner-aware per slice 901), eliminating the divergence-risk the row flags. Audit row: `consumer-aoe-geometry`.
**Do:** for area spells, set `aim` to the burst point / direction instead of (or alongside) curating `targetIds`.

### 4. Sight facts — MEDIUM (defaults are RAW-safe)
**Engine fields:** `AttackIntent.attackerCanSeeTarget` (`false` → Disadvantage vs. an unseen target), `AttackIntent.targetCanSeeAttacker` (`false` → attacker Advantage + suppresses the target's Dodge disadvantage), `bearerCanSeeFearSource` (Frightened's disadvantage/can't-approach). The engine support shipped (slice 886 generalized the unseen-attacker rule beyond the Invisible condition).
**Status in dnd-web:** NOT wired (attacks carry no visibility context; LoS is only post-filtered for bonus-action targets).
**Why it matters:** these default the **safe** direction — `targetCanSeeAttacker` unset → Dodge disadvantage fires broadly (over-strict, never under; row `frightened-dodge-facts-overstrict-default`). So this is about *precision* once darkness / Blinded / Invisible / obscurement is in play, not a silent wrong result today.
**Do:** when your scene has obscurement/blindness/invisibility, set the relevant sight booleans per attack. Audit row: `frightened-dodge-facts-overstrict-default`.

### 5. Weapon-instance validation in `legalTargets` — LOW
`legalTargets` computes reach off the **main-hand** weapon only. If your UI lets a player choose an off-hand / unequipped weapon for an attack, validate the weapon choice at dispatch. Audit row: `weaponinstance-not-validated`.

### 6. Group ability checks — NEW AFFORDANCE
No engine helper exists (`no-group-check-helper`, owner Consumer): the SRD group check ("if at least half the group succeeds, the group succeeds") is consumer math over the per-character checks the engine already resolves. This also needs ability checks surfaced as a player action in your UI (today only the AI and the engine's own death saves roll checks). Audit row: `no-group-check-helper`.

---

## Not dnd-web's job (engine-side residuals)

Two open Area-9 rows are **engine-repo** tasks, not consumer work — they stay here:

- `engine-scope-encumbrance-doc` (Docs) — reconcile [engine-scope.md](engine-scope.md)'s "encumbrance not modeled" line with the encumbrance/carry derivations that now exist.
- `verify-reaction-registry-l1-7` (Engine `[verify]`) — confirm `reactionsForTrigger` covers every L1–7 reaction an expert expects (e.g. Hellish Rebuke), or document the event-stream-only ones.

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
