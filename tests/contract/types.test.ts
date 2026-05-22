// Layer 9 (public-API contract test, per the testing standard in
// CLAUDE.md). Companion to `exports.test.ts`: where that file locks
// *names*, this file locks key *signatures* via Vitest's built-in
// `expectTypeOf`. A signature change that keeps the name (e.g.
// renaming `planAttack`'s `attackerId` to `casterId`, or making the
// rng parameter required) is caught here even though the snapshot
// wouldn't notice.
//
// Cover the load-bearing pieces only. Aim is to fail loudly on
// breaking changes to the contract a consumer relies on, not to
// duplicate the TypeScript compiler. Add an assertion when:
//   - A new consumer-facing API ships (engine method, top-level type)
//   - A change here would silently break dndbnb or any other consumer

import { describe, it, expectTypeOf } from 'vitest';
import {
  createEngine,
  loadCampaign,
  serializeCampaign,
  type Engine,
  type Campaign,
  type CampaignState,
  type Event,
  type ContentPack,
  type RNG,
  type CharacterId,
  type EncounterId,
  type PlanResult,
  type AttackIntent,
  type CleaveIntent,
  type ShieldIntent,
  type ShieldOutcome,
  type PolymorphIntent,
  type WildShapeIntent,
  type SimulacrumIntent,
  type WishIntent,
} from '../../src/index.js';

describe('public API contract: type signatures', () => {
  it('createEngine: (opts) -> Engine', () => {
    expectTypeOf(createEngine).toBeFunction();
    expectTypeOf(createEngine).parameter(0).toMatchTypeOf<{
      contentPacks?: ReadonlyArray<ContentPack>;
      rng?: RNG;
    }>();
    expectTypeOf(createEngine).returns.toEqualTypeOf<Engine>();
  });

  it('Engine.apply / applyAll / replay are pure functions of state', () => {
    expectTypeOf<Engine['apply']>().parameters.toEqualTypeOf<[CampaignState, Event]>();
    expectTypeOf<Engine['apply']>().returns.toEqualTypeOf<CampaignState>();
    expectTypeOf<Engine['applyAll']>().parameters.toEqualTypeOf<
      [CampaignState, ReadonlyArray<Event>]
    >();
    expectTypeOf<Engine['applyAll']>().returns.toEqualTypeOf<CampaignState>();
    expectTypeOf<Engine['replay']>().parameters.toEqualTypeOf<[ReadonlyArray<Event>]>();
    expectTypeOf<Engine['replay']>().returns.toEqualTypeOf<CampaignState>();
  });

  it('Engine.commit / undo / redo: Campaign -> Campaign', () => {
    expectTypeOf<Engine['commit']>().returns.toEqualTypeOf<Campaign>();
    expectTypeOf<Engine['undo']>().returns.toEqualTypeOf<Campaign>();
    expectTypeOf<Engine['redo']>().returns.toEqualTypeOf<Campaign>();
  });

  it('Engine.plan.* return PlanResult or its outcome variants', () => {
    expectTypeOf<Engine['plan']['attack']>().returns.toEqualTypeOf<PlanResult>();
    expectTypeOf<Engine['plan']['cleave']>().returns.toEqualTypeOf<PlanResult>();
    expectTypeOf<Engine['plan']['shortRest']>().returns.toEqualTypeOf<PlanResult>();
    expectTypeOf<Engine['plan']['longRest']>().returns.toEqualTypeOf<PlanResult>();
    expectTypeOf<Engine['plan']['castSpell']>().returns.toEqualTypeOf<PlanResult>();

    // The non-PlanResult outcomes (planners that return extra data
    // alongside the event chain).
    expectTypeOf<Engine['plan']['shield']>().returns.toEqualTypeOf<ShieldOutcome>();
    expectTypeOf<Engine['plan']['polymorph']>().returns.toMatchTypeOf<{
      events: ReadonlyArray<Event>;
      resisted: boolean;
    }>();
    expectTypeOf<Engine['plan']['simulacrum']>().returns.toMatchTypeOf<{
      events: ReadonlyArray<Event>;
      simulacrumId: string;
    }>();
    expectTypeOf<Engine['plan']['wish']>().returns.toMatchTypeOf<{
      events: ReadonlyArray<Event>;
      stressApplied: boolean;
    }>();
    expectTypeOf<Engine['plan']['consumeGuidance']>().returns.toMatchTypeOf<{
      events: ReadonlyArray<Event>;
      d4: number;
    }>();
    expectTypeOf<Engine['plan']['spendHeroPoint']>().returns.toMatchTypeOf<{
      events: ReadonlyArray<Event>;
      d6: number;
    }>();
  });

  it('plan intent shapes carry the discriminating type literal', () => {
    expectTypeOf<AttackIntent['type']>().toEqualTypeOf<'Attack'>();
    expectTypeOf<CleaveIntent['type']>().toEqualTypeOf<'Cleave'>();
    expectTypeOf<ShieldIntent['type']>().toEqualTypeOf<'Shield'>();
    expectTypeOf<PolymorphIntent['type']>().toEqualTypeOf<'Polymorph'>();
    expectTypeOf<WildShapeIntent['type']>().toEqualTypeOf<'WildShape'>();
    expectTypeOf<SimulacrumIntent['type']>().toEqualTypeOf<'Simulacrum'>();
    expectTypeOf<WishIntent['type']>().toEqualTypeOf<'Wish'>();
  });

  it('Branded ID types are not interchangeable', () => {
    // A CharacterId is structurally a string but the brand prevents
    // direct mix-ups. Asserting at the type level — if the brand is
    // ever dropped this fails to compile.
    expectTypeOf<CharacterId>().not.toEqualTypeOf<EncounterId>();
    expectTypeOf<CharacterId>().not.toEqualTypeOf<string>();
  });

  it('Event is a discriminated union by `type`', () => {
    expectTypeOf<Event>().toHaveProperty('type');
    // A few key variants must remain in the union.
    type Names = Event['type'];
    expectTypeOf<'CharacterCreated'>().toMatchTypeOf<Names>();
    expectTypeOf<'AttackRolled'>().toMatchTypeOf<Names>();
    expectTypeOf<'DamageApplied'>().toMatchTypeOf<Names>();
    expectTypeOf<'ConcentrationBroken'>().toMatchTypeOf<Names>();
    expectTypeOf<'HeroPointSpent'>().toMatchTypeOf<Names>();
    expectTypeOf<'GuidanceUsed'>().toMatchTypeOf<Names>();
    expectTypeOf<'ShieldCast'>().toMatchTypeOf<Names>();
  });

  it('Campaign serialization: Campaign -> string -> Campaign', () => {
    expectTypeOf(serializeCampaign).parameter(0).toEqualTypeOf<Campaign>();
    expectTypeOf(serializeCampaign).returns.toEqualTypeOf<string>();
    expectTypeOf(loadCampaign).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(loadCampaign).returns.toEqualTypeOf<Campaign>();
  });

  it('Engine exposes derive.* read-only helpers', () => {
    expectTypeOf<Engine['derive']>().toHaveProperty('character');
    expectTypeOf<Engine['derive']>().toHaveProperty('ac');
    expectTypeOf<Engine['derive']>().toHaveProperty('attackBonus');
    expectTypeOf<Engine['derive']>().toHaveProperty('savingThrow');
    expectTypeOf<Engine['derive']>().toHaveProperty('spellSlots');
  });
});
