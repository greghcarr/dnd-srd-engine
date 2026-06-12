# Slice 841 — `disease-generic-condition` is NOT A BUG (stale 2014 finding)

**Type:** Audit reconciliation + a durable guard test. No engine, content, or schema change.

## The finding, and why it's wrong

The L7 audit row `disease-generic-condition` claimed: *"No generic `diseased` condition; each disease (Death Dog) is bespoke."* The implied gap — that the engine *should* have a shared `diseased` condition — is **2014-based**.

Canon-verifying against `references/srd-markdown/` (the only valid source):

- **SRD 5.2.1 removed diseases as a general mechanic.** "Diseased" is **not** one of the 15 conditions (Exhaustion as a numeric track + the 14 condition rows: Blinded, Charmed, Deafened, Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious). There is no 15th "Diseased" row.
- **"Disease" appears nowhere as a rule.** It's absent from the rules glossary and from every monster's traits. The only spell that names it is **Detect Poison and Disease** — a *detection* divination, not a cure or a status.
- **There is no generic disease cure.** **Lesser Restoration** ends only **Blinded, Deafened, Paralyzed, or Poisoned** — the 2014 "or one disease" arm is gone. Greater Restoration / Heal likewise enumerate conditions, not diseases.
- **The lone in-scope disease-flavored effect** — the **Death Dog**'s bite — is correctly modeled as a **Poisoned-variant**: a `category: 'disease'` condition (`death-dog-disease-active`, the taxonomic mirror of `category: 'curse'`) that **is** the Poisoned condition's effects plus its **own** RAW cure rider (the 24h-recurring CON save). That's a *per-disease* model because 2024 has no shared disease mechanism to model against.

**Adding a generic `diseased` condition would be edition drift** — reintroducing a 2014 mechanic absent from the 2024 canon, the exact class of bug the SRD-canon discipline exists to prevent. So the row is resolved as NOT A BUG, struck through and moved to "Confirmed correct / by-design."

## The guard

`tests/audit/slice-841-disease-generic-condition.test.ts` (2) pins the conclusion so a future edit can't silently re-introduce the 2014 disease mechanic:

- The 14 standard RAW conditions are all present as pack condition rows, **`diseased` is not** (neither as an id nor a name), and "diseased" is deliberately not in the RAW-condition set.
- The **only** `category: 'disease'` condition is the Death Dog's (`death-dog-disease-active`), and it carries its own `recurringSave` cure path — confirming diseases stay bespoke rather than routing through a generic shared mechanism.

## Verification

`npx tsc --noEmit` clean; the 2-test guard + doc-size/links green; no source change. No new condition/effect kind/weapon → no doc-counts bump.
