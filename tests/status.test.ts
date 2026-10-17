import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StatusEffect } from '../src/engine/status.ts';

describe('StatusEffect state machine', () => {
  it('starts ACTIVE and ends in exactly one terminal state', () => {
    const s = new StatusEffect(1, { type: 'STUN', durationMs: 1000, source: 'p1' });
    assert.equal(s.lifecycle, 'ACTIVE');
    s.end('EXPIRED');
    assert.equal(s.lifecycle, 'EXPIRED');
    assert.throws(() => s.end('PURGED'), /Invalid status transition/);
    assert.throws(() => s.advance(50), /Invalid status transition/);
  });

  it('fires periodic ticks on its interval and expires on time', () => {
    const burn = new StatusEffect(1, { type: 'DOT', durationMs: 4000, intervalMs: 1000, value: 2, source: 'p1' });
    let fired = 0;
    for (let t = 0; t < 4000; t += 50) fired += burn.advance(50);
    assert.equal(fired, 4);
    assert.equal(burn.expired, true);
  });

  it('refresh rule keeps the longer remaining duration', () => {
    const s = new StatusEffect(1, { type: 'BLOCK', durationMs: 5000, source: 'p1' });
    s.advance(3000);
    s.reapply(1000, undefined);
    assert.equal(s.remainingMs, 2000);
    s.reapply(4000, undefined);
    assert.equal(s.remainingMs, 4000);
  });

  it('stack rule adds stacks up to the cap and resets the timer', () => {
    const rage = new StatusEffect(1, { type: 'RAGE', durationMs: 10_000, value: 0.25, maxStacks: 3, source: 'p1' });
    rage.advance(5000);
    for (let i = 0; i < 5; i++) rage.reapply(10_000, 0.25);
    assert.equal(rage.stacks, 3);
    assert.equal(rage.remainingMs, 10_000);
  });

  it('classifies polarity and control rules', () => {
    const stun = new StatusEffect(1, { type: 'STUN', durationMs: 1, source: null });
    const silence = new StatusEffect(2, { type: 'SILENCE', durationMs: 1, source: null });
    const root = new StatusEffect(3, { type: 'ROOT', durationMs: 1, source: null });
    assert.equal(stun.polarity, 'DEBUFF');
    assert.deepEqual([stun.rule.blocksSkill, stun.rule.blocksSwap], [true, true]);
    assert.deepEqual([silence.rule.blocksSkill, silence.rule.blocksSwap], [true, false]);
    assert.deepEqual([root.rule.blocksSkill, root.rule.blocksSwap], [false, true]);
    assert.equal(new StatusEffect(4, { type: 'DODGE', durationMs: 1, source: null }).polarity, 'BUFF');
  });
});
