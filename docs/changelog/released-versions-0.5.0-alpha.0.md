# Released versions: 0.5.0-alpha.0

Frozen release narrative for `0.5.0-alpha.0` (2026-06-05), evicted from the live [CHANGELOG.md](../../CHANGELOG.md) in slice 701 per the active-cycle invariant (the live file holds only the active cycle + the newest release). Sibling archives: [released-versions-0.4.0-alpha.0.md](released-versions-0.4.0-alpha.0.md), [released-versions-0.2.0-alpha.0.md](released-versions-0.2.0-alpha.0.md), [released-versions-alpha-15.md](released-versions-alpha-15.md), [released-versions-alpha-14.md](released-versions-alpha-14.md), [released-versions-alpha-6-13.md](released-versions-alpha-6-13.md). Per-slice detail lives in the `slice-NNN.md` files alongside this one.

---

## 0.5.0-alpha.0 - 2026-06-05

**Release (slice 696): bump to 0.5.0-alpha.0**

Promotes the post-0.4.0 cohort (slices 689-695) to a tagged release: the cross-repo sibling-consumer infrastructure (689-692) and tactical movement support for the combat fuzz (693-695). `package.json` bumps `0.4.0-alpha.0` → `0.5.0-alpha.0`; `package-lock.json` updated to match. `SCHEMA_VERSION` stays 1: the location / positioned-encounter / movement event shapes this cohort exercises shipped additively in the 0.4.0 spatial cycle (slices 683-685).

**Breaking:** none. `runBattle` gains an optional `movement` parameter defaulting to `'none'`, byte-identical to the prior positionless path; no engine `src/` surface changed.

**RNG stream:** `'none'` battles are byte-identical (the fuzz-matrix + replay-equivalence suites pass unchanged). Tactical movement is new behavior behind the option, not a shift to existing seeds.

**Feat (slice 695): tactical movement policy + opportunity-attack resolution**
Completes the tactical fuzz mode: combatants now move intelligently (melee close + corner, ranged kite / reposition for line of sight, low-HP flee + break LoS + Disengage), and a move that provokes is fully resolved as an opportunity attack. New pure `planTacticalMove` (`scripts/tactical/policy.ts`) runs a flee/kite/close/stay cascade over `reachableCells`/`hasLineOfSight`, RNG-free, with every choice forced through an explicit `(score, x, y)` total order. New `makeTacticalMovePolicy` (`scripts/tactical/move-policy.ts`) captures `resolveContent` once (tactical-only), commits the move, and resolves provoked OAs in emitted order using a melee-capable reactor weapon (skipping ranged-only reactors). `runBattle` selects it in one line. `'none'` byte-identical; tactical logs replay-equivalent + seed-deterministic. Diagnostic over 80 battles: 680 moves, OAs resolved in 25/80, zero throws.
Detail: [slice-695.md](slice-695.md).

**Feat (slice 694): arena map generation + spread placement for the tactical fuzz**
Tactical mode now spawns combatants spread out on a deterministically-generated arena with scattered impassable cover. New pure `generateArenaMap(seed, teamSize)` (`scripts/tactical/arena.ts`) forks its RNG from `seededRNG(seed).fork(MAP_SALT)` (independent of the engine roll stream), scales dims with team size, and places cover as isolated pillars so an A↔B path is structural (no regenerate loop). New `emitTacticalSetup` emits `LocationCreated` → per-combatant `CharacterLocationChanged` → positioned `EncounterCreated`; `runBattle` branches once on `movement` and sets `result.locationId`. No movement yet (slice 695). `'none'` byte-identical. Tactical logs replay-equivalent + seed-deterministic.
Detail: [slice-694.md](slice-694.md).

**Feat (slice 693): movement option + no-op move-policy seam on the combat fuzz**
Adds `movement: 'none' | 'tactical'` to `runBattle` (default `'none'`) plus the strategy seam the tactical policy plugs into: a `MovePolicy` injected once per turn, with `NO_MOVE` (identity) for `'none'`. No behavior change yet — `'none'` is proven byte-identical (fuzz-matrix + replay-equivalence + flags suites pass unchanged, plus a new default-guard test). Also adds the `normalizeEvents` test helper (interns ulids + blanks wall-clock `at`) as the correct cross-run determinism oracle, since two same-seed runs differ only in volatile ids/timestamps. First of three; slices 694-695 fill in the tactical arm.
Detail: [slice-693.md](slice-693.md).

**Doc (slice 692): clean-agent tune-up after the slice-689/690/691 cross-repo cycle**
Surfaces the sibling-consumer arrangement + slice-690 pre-push hook in the two places a fresh agent will look first: a new "Sibling-consumer awareness" subsection in CLAUDE.md (auto-loaded) names greghcarr/dndbnb + greghcarr/dnd-web, explains the pre-push hook, restates the engine-only conversation-scope rule, and notes that engine `main` IS the consumers' deploy pin; README's "What lives in this repo" gets a `.githooks/` row + a new "Sibling consumers" subsection with live URLs. Architecture.md was checked and needed no changes (zero stale refs; consumer-integration concerns live in DEVELOPMENT.md already). Doc-only.
Detail: [slice-692.md](slice-692.md).

**Infra (slice 691): revert the cross-repo `notify-dndbnb` auto-dispatch**
Removes the engine-side `.github/workflows/notify-dndbnb.yml` workflow added in slice 689. The user prefers the symmetric "consumers rebuild only on their own main commits" model — engine slices no longer auto-fan-out to consumer deploys. The slice-690 pre-push hook (verifying both consumers' builds when pushing engine main) is preserved; local pre-push verification is independent of the cross-repo auto-rebuild trigger. Slice 689's doc gets a closure annotation. No engine-API change.
Detail: [slice-691.md](slice-691.md).

**Infra (slice 690): pre-push hook verifying sibling consumers + `+dirty` engine-SHA marker in consumers**
New `.githooks/pre-push` runs `npm run typecheck` + `npm run build` in any sibling consumer it finds (`../dndbnb`, `../dnd-web`) and aborts the push if either fails. Triggers only when pushing the local `main` ref. Activates via `npm install` (`prepare` script sets `core.hooksPath .githooks`). Escape hatch: `SKIP_CONSUMER_CHECKS=1 git push`. Plus: both consumer apps' Vite configs now append `+dirty` to the engine SHA in the version-badge when the engine working tree has uncommitted changes — catches the "I demoed a local build with unpushed engine code" failure mode. Closes both new failure modes the slice-689 sibling-checkout structure introduced. No engine-API change.
Detail: [slice-690.md](slice-690.md).

**Infra (slice 689): extract dndbnb into its own sibling project + repo**
Moves the in-repo dndbnb consumer app (~6093 LOC) + `supabase/migrations/` (13 migrations) to a sibling [greghcarr/dndbnb](https://github.com/greghcarr/dndbnb) repo, mirroring how `dnd-web` already works. The engine is consumed as a sibling source checkout via Vite alias. Deletes `dndbnb/`, `supabase/`, `vite.dndbnb.config.ts`, and `.github/workflows/deploy-dndbnb.yml`; prunes 10 dndbnb-only devDeps from `package.json` (68 packages removed); adds `.github/workflows/notify-dndbnb.yml` that fires `repository_dispatch: engine-updated` at the dndbnb repo on every push to main. No engine-API change; engine surface byte-identical.
Detail: [slice-689.md](slice-689.md).

**Release (slice 688): bump to 0.4.0-alpha.0**
Promotes the spatial combat support cycle (slices 683-685) + the in-repo web-demo retirement (slice 686) to a tagged release. Back-to-back with the slice-687 v0.3 cut; v0.3 marked strict-RAW completeness, v0.4 marks spatial combat support shipped + GUI moved out of the engine repo. `SCHEMA_VERSION` stays 1.
Detail: [slice-688.md](slice-688.md).
