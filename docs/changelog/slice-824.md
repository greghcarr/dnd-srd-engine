# Slice 824 — Young Red Dragon Rend +1d6 Fire (dragon-rend rider close + RAW correction)

**Type:** Content (one `onHit` rider) + a durable invariant test. No engine change. **Closes** the [L7 audit](../l7-completion-audit.md) `dragon-rend-no-elemental-rider` divergence.

## The fix — and what verifying caught

The audit filed this as "Dragon Rend weapons miss the RAW +1dX elemental on-hit rider" (plural). SRD-verifying **every** in-pack dragon's Rend against `monsters-A-Z.md` corrected that:

- The **chromatic** dragons (Black/Blue/Green/Red/White) carry the Rend elemental rider at **all** ages — wyrmling *and* young. These were already wired (Black +acid, Blue +lightning, Green +poison, Red +fire, White +cold), **except** the Young Red Dragon, whose Rend was missing its +1d6 Fire.
- The **metallic** dragons (Brass/Copper/Bronze/Silver/Gold) gain the Rend elemental rider only at **Adult+** (e.g., Young Brass Rend is "2d10 + 4 Slashing" with no "plus"; Adult Brass adds Fire). The in-scope **metallic wyrmling/young** Rends therefore correctly have **no** rider — wiring one would be edition drift, which the broad "Dragon Rend weapons" framing would have invited.

So the lone genuine divergence was **`young-red-dragon-rend`** — added `onHit: [{ dice: "1d6", damageType: "fire" }]`, matching RAW (Young Red Dragon: "13 (2d6 + 6) Slashing damage plus 3 (1d6) Fire damage").

## Tests

`tests/unit/engine/slice-824-dragon-rend-fire.test.ts` (2): a **content invariant** pinning all **18** in-pack dragon Rends to their exact RAW rider state (the 10 chromatic wyrmling/young → their element; the 8 metallic wyrmling/young → none) — so neither a lost chromatic rider nor a wrongly-added metallic one can regress; and an end-to-end check that the Young Red Dragon's Rend deals Fire damage on a hit.

## Golden transcript

The showcase golden (`tests/golden/transcripts/showcase.transcript.md`) features a Young Red Dragon ("Stoneheart"), so its Rend now reads "slashing + fire" and the downstream HP totals / RNG stream shift (the new Fire die consumes RNG, so subsequent rolls cascade) — inspected and intended, updated with `-u`.

## Verification

`npx tsc --noEmit` clean; pack-integrity + coverage green; the showcase golden updated for the dragon's Fire damage; `npm run test:fast` green.
