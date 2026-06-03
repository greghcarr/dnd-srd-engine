# Breaking changes queued for the next release

Items that landed on `dev` after the most-recent tagged release ([0.1.0-alpha.15](changelog/released-versions-alpha-14.md), 2026-05-26) and constitute consumer-facing breaking changes. When the next release tag is cut, these become the release-notes "Breaking" section.

Per [VERSIONING.md](../VERSIONING.md), the pre-1.0 escape hatch is the minor bump: `0.1.0-alpha.N` may ship breaking API changes without a major bump as long as they're announced in the release notes. This doc keeps the announcement queue durable across slices.

## Public API changes

### Slice 603: `engine.plan.castSpell` on Produce Flame (and equivalent BA-cast + persistent + attack-mechanic spells) now requires Action available

**Pre-slice:** `engine.plan.castSpell({ spellId: 'produce-flame', targetIds: [...] })` succeeded if the caster had a Bonus Action available. The cast consumed only the BA but rolled the hurl-attack inline, so a consumer could "cast PF" while their Action was already used elsewhere.

**Post-slice:** the same call now throws if the caster's Action is already used when targets are supplied, with message: `"<Caster> cannot hurl <spell>: action already used this turn (RAW: a BA cast + Magic action hurl requires both unspent)"`. The cast consumes BOTH a Bonus Action AND an Action when targets are supplied (matching RAW: BA cast produces the flame, Magic action hurls). Cast-without-hurl (no targetIds) keeps the BA-only behavior.

**Why:** RAW correction. SRD 5.2.1 Produce Flame: "Casting Time: Bonus Action ... Until the spell ends, you can take a Magic action to hurl fire at a creature." The hurl IS a separate action. Pre-slice the engine collapsed cast + hurl into one BA, giving casters a free spell attack alongside their full Action.

**Migration:** consumers calling `castSpell` for Produce Flame inside a turn where Action is consumed should either:
- Cast without targets (BA only, no attack rolled) — gets the flame for light/utility.
- Wait until next turn to hurl — call `castSpell` separately when Action is free. (Note: the engine doesn't yet model the persistent-flame state across turns; the proper-RAW split planner is tracked as an open follow-up in [slice 603's archive entry](changelog/archive-slices-599-603.md).)

**Detection:** an existing campaign with a logged Produce Flame cast on a turn where Action was already used would still REPLAY correctly (replay-equivalence holds for committed events; the rejection happens at plan time only). The break only surfaces when new intents are planned.

## RNG-stream changes (per-seed reproducibility shifts)

Per [docs/determinism.md](determinism.md), per-seed RNG reproducibility is version-sensitive. The following slices in this cycle changed RNG consumption patterns:

- Slice 601: CON save on every damage to a concentrating creature.
- Slice 602: 2 d20 rolls on spell attacks vs advantage-granting targets.
- Slice 611: Halfling Luck reroll + Bless bonus dice on spell attacks.
- Slice 612: per-component CON saves (one per damage source instead of one totaled).
- Slice 614: 2 d20 rolls on off-hand attacks vs advantage-granting targets.

A transcript from `combat-fuzz --seed N` generated on 0.1.0-alpha.15 will NOT byte-match the same command on the next release if any of these paths fired. Consumers depending on cross-version per-seed reproducibility should snapshot the resulting `CampaignState` alongside the seed.

## Format

Future breaking changes append a new `### Slice N: <one-line headline>` section here. Each section: pre-slice behavior, post-slice behavior, why (with RAW citation if applicable), migration steps, detection guidance.

At the next release-tag cut, copy this file's content into the release notes' "Breaking" section, then clear the file.
