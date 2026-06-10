# Slice 805 — synthetic-Unconscious arms on a 0-HP drop

**Type:** Engine derivation (two synthetic checks). **Closes** the [L7 audit](../l7-completion-audit.md) Area 4 divergence `drop-to-0-no-unconscious-arms`.

## The gap

Dropping to 0 HP set HP + death-save state but applied none of the Unconscious condition's mechanical arms. The engine was *half*-synthetic: the within-5-ft **auto-crit** already keyed on `target.hp.current <= 0` (slice 568, attack.ts), but the **"attackers have Advantage"** and **"auto-fail STR/DEX saves"** arms live on the `unconscious` *condition*'s effects — which the HP-drop path never applies (the condition is applied only by Sleep). So a downed creature was auto-crit-eligible yet attacked without Advantage and rolled its STR/DEX saves normally — internally inconsistent (and, per the golden transcript, the dragon's attack on a downed PC *missed* because it lacked the Advantage that would have connected the auto-crit).

## The fix

Make the two missing arms synthetic too, keyed on `hp.current <= 0`, exactly like the auto-crit:

- **`engine/plan/attack.ts`** — `targetGrantsAdvantage ||= target.hp.current <= 0`.
- **`derive/save.ts`** — `hasAutoFail ||= (ability ∈ {STR, DEX}) && character.hp.current <= 0`.

This keeps `hp.current <= 0` the single source of truth for synthetic unconsciousness (no dual-tracking via an applied condition that would risk desync on heal), and composes with the explicit `unconscious` condition (Sleep) which still supplies the same arms through the effect stack. Prone / drop-items stay deferred — the same scoping the `unconscious` condition definition itself notes (the engine models neither held-item dropping nor unconscious-Prone posture).

## Tests

`tests/unit/engine/slice-805-unconscious-arms.test.ts` (4): an attack against a 0-HP target rolls with Advantage (two d20s, `used: 'advantage'`) while a conscious target grants none; a 0-HP creature auto-fails STR and DEX saves but not CON, while a conscious creature auto-fails nothing. Golden: `showcase.transcript.md` updated — the dragon's attack on the downed cleric now correctly lands with Advantage → the existing auto-crit fires (and the benign RNG cascade follows).

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (588 files, 4528 passed).
