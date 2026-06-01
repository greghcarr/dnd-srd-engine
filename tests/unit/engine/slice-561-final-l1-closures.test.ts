// Slice 561: Final L1 SRD closure pass.
//
// Three things ship together since each is small + closely related to
// the deep-audit (final L1 SRD compliance pass) findings:
//
// 1. Druid Magician cantrip choice (RAW: "one extra cantrip from the
//    Druid spell list" — pre-slice hardcoded druidcraft). Replaced
//    with an OfferChoice over the 11 Druid cantrips.
// 2. Audit-clarifications: the deep audit flagged Heavy weapon
//    Small-creature disadvantage AND the Loading property cap as
//    "unwired" — verified BOTH were already wired in attack.ts
//    (`heavyForSmall` at the disadvantage-stack site, `weaponIsLoading`
//    at line 1514). This slice documents that finding in CHANGELOG so
//    a future audit doesn't re-flag them. Test below is a smoke check
//    confirming the constants / variables still live where expected.
// 3. Tiefling Fiendish Legacy spellcasting ability (RAW: INT/WIS/CHA
//    choice; pack hardcodes CHA): deferred and documented as a future
//    slice — requires a per-cast ability-override or restructure of
//    the existing slice-530 Fiendish Legacy choice. Tracked in the
//    CHANGELOG entry.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { loadStarterPack } from '../../../src/content/packs/starter.js';

const PACK = loadStarterPack();
const ATTACK_TS = readFileSync(resolve(__dirname, '../../../src/engine/plan/attack.ts'), 'utf8');

describe('Druid Magician cantrip choice (slice 561)', () => {
  const findDruidPrimalOrder = () => {
    const druid = PACK.classes?.find((c) => c.id === 'druid') as { levelTable?: Record<string, { features?: Array<{ id: string; effects: Array<{ kind: string }> }> }> } | undefined;
    expect(druid).toBeDefined();
    const level1 = druid!.levelTable?.['1'];
    expect(level1).toBeDefined();
    const primalOrder = level1!.features?.find((f) => f.id === 'primal-order');
    expect(primalOrder).toBeDefined();
    const offer = primalOrder!.effects.find((e) => e.kind === 'OfferChoice') as unknown as {
      options: Array<{ id: string; effects: Array<{ kind: string; choiceId?: string; options?: Array<{ id: string }> }> }>;
    };
    return offer;
  };

  it('Magician option contains a nested OfferChoice for the extra cantrip', () => {
    const offer = findDruidPrimalOrder();
    const magician = offer.options.find((o) => o.id === 'magician');
    expect(magician).toBeDefined();
    const cantripChoice = magician!.effects.find(
      (e) => e.kind === 'OfferChoice' && e.choiceId === 'druid-magician-cantrip',
    );
    expect(cantripChoice).toBeDefined();
  });

  it("Magician's nested cantrip choice offers all 11 Druid cantrips", () => {
    const offer = findDruidPrimalOrder();
    const magician = offer.options.find((o) => o.id === 'magician')!;
    const cantripChoice = magician.effects.find(
      (e) => e.kind === 'OfferChoice' && e.choiceId === 'druid-magician-cantrip',
    ) as { options: Array<{ id: string }> };
    expect(cantripChoice.options.length).toBe(11);
    const ids = cantripChoice.options.map((o) => o.id);
    expect(ids).toContain('druidcraft');
    expect(ids).toContain('guidance');
    expect(ids).toContain('produce-flame');
    expect(ids).toContain('shillelagh');
    // Sanity: a non-cantrip Druid spell shouldn't appear
    expect(ids).not.toContain('cure-wounds');
  });

  it("Warden option (control: not touched) still grants martial weapon + medium armor", () => {
    const offer = findDruidPrimalOrder();
    const warden = offer.options.find((o) => o.id === 'warden')!;
    const martialWeapon = warden.effects.find(
      (e) => e.kind === 'GrantProficiency' && (e as { id?: string }).id === 'martial',
    );
    const mediumArmor = warden.effects.find(
      (e) => e.kind === 'GrantProficiency' && (e as { id?: string }).id === 'medium',
    );
    expect(martialWeapon).toBeDefined();
    expect(mediumArmor).toBeDefined();
  });
});

describe('Audit-clarification: Heavy weapon + Loading were already wired (slice 561)', () => {
  it('attack.ts still contains the heavyForSmall block', () => {
    expect(ATTACK_TS).toMatch(/const heavyForSmall = \(\(\): boolean =>/);
    // After slice 560 the lookup goes through creatureSize derive.
    expect(ATTACK_TS).toMatch(/creatureSize\(attacker, content\) === 'Small'/);
  });

  it('attack.ts still contains the weaponIsLoading block + per-turn cap', () => {
    expect(ATTACK_TS).toMatch(/const weaponIsLoading =/);
    expect(ATTACK_TS).toMatch(/loadedWeaponsFiredThisTurn/);
    expect(ATTACK_TS).toMatch(/cannot fire .* again this turn \(Loading property\)/);
  });
});
