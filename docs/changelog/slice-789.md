# Slice 789 — monster `actions` + `multiattack`: CR 0-1 gate-safe subset

**Type:** Content (statblock `actions` + one `multiattack`), authored from the SRD via a verification workflow. First increment of the [L7 audit](../l7-completion-audit.md) `multiattack-unpopulated` sweep. The full sweep continues in later slices.

## What this is

A multi-agent workflow read the 2024 SRD markdown clone for all 66 CR ≤ 1 statblocks lacking `multiattack`, authored their `actions` + any `multiattack`, and adversarially re-verified each against the SRD (catching real misses — e.g. the Bandit's missing Light Crossbow). This slice applies the **gate-safe subset** of that output: statblocks whose attacks reuse **existing** weapon definitions, so no new content can drift.

Applied (9 statblocks):

- **Actions** (existing weapon defs): Commoner (Club), Noble (Rapier), Spy (Shortsword + Hand Crossbow), Tough (Mace + Heavy Crossbow), Dire Wolf (Bite), Quasit (Rend), Sphinx of Wonder (Rend), Goblin Minion (Dagger).
- **Multiattack**: Goblin Boss — "two attacks, Scimitar or Shortbow in any combination" → `scimitar ×2` (reuses the existing `scimitar` def), plus its `actions` (Scimitar + Shortbow). The band's one RAW multiattacker that needs no new weapon.

## What is deferred (and why) — tracked for the sweep

The workflow surfaced two reasons the rest of CR 0-1 can't be blindly applied:

1. **New natural-weapon defs need their onHit riders.** ~40 CR 0-1 monsters attack with a natural weapon the pack doesn't define yet (Magma Mephit Claw, Specter Life Drain, Shadow Draining Swipe, Giant Frog Bite, …). The SRD versions carry riders — secondary damage (`+1d6 fire`), conditions (Grappled, Prone), or drains (max-HP, Strength) — that the engine's existing natural weapons model via `onHit`. Shipping damage-only defs would **under-damage** these monsters, the exact drift the repo guards against. These need rider-aware authoring (the verified SRD text is captured), so they're deferred to focused content slices rather than a bulk apply.
2. **Fuzz-determinism reconciliation.** Slice 788 set the 25 combat-fuzz statblocks' `actions[0]` to the harness's historical stand-in weapon (e.g. Goblin Warrior → `shortsword`), but RAW is `scimitar`. Correcting those to RAW would change `actions[0]` and churn every combat-fuzz golden transcript — a separate, deliberate change, not folded in here.

So the CR 0-1 band's clean multiattack yield is small (Goblin Boss); the real multiattack payoff is in CR 2-11, where multiattackers cluster and more natural-weapon defs already exist. The remaining CR 0-1 `actions` (rider-bearing new weapons) ride along with that work.

## Tests

- `tests/audit/pack-integrity.test.ts` (slice 788's guard) validates every new `actions`/`multiattack` weaponId resolves to a pack weapon — all 9 pass.
- No new test file: this is content reusing existing primitives (the `multiattack` bridge is covered by slices 464/472). The 9 statblocks aren't combat-fuzz monsters, so no transcript changes.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (575 files, 4462 passed). JSON validates; all action/multiattack weaponIds resolve.
