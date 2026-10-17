import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateDamage } from '../src/engine/damage.ts';
import { ELEMENT_MATRIX, getElementMultiplier } from '../src/engine/elements.ts';

describe('element matrix', () => {
  it('matches the PRD 4.2 table exactly (attacker rows, defender columns)', () => {
    assert.deepEqual(ELEMENT_MATRIX, {
      Air: { Air: 1, Earth: 1.25, Fire: 1, Water: 0.75 },
      Earth: { Air: 0.75, Earth: 1, Fire: 1.25, Water: 1 },
      Fire: { Air: 1, Earth: 0.75, Fire: 1, Water: 1.25 },
      Water: { Air: 1.25, Earth: 1, Fire: 0.75, Water: 1 },
    });
  });

  it('follows the Air > Earth > Fire > Water > Air cycle', () => {
    assert.equal(getElementMultiplier('Air', 'Earth'), 1.25);
    assert.equal(getElementMultiplier('Earth', 'Fire'), 1.25);
    assert.equal(getElementMultiplier('Fire', 'Water'), 1.25);
    assert.equal(getElementMultiplier('Water', 'Air'), 1.25);
    assert.equal(getElementMultiplier('Earth', 'Air'), 0.75);
  });
});

describe('calculateDamage', () => {
  it('applies Base x Element x Buff and rounds to an integer', () => {
    assert.equal(calculateDamage({ base: 15, elementMultiplier: 1.25, buffMultiplier: 1 }), 19);
    assert.equal(calculateDamage({ base: 15, elementMultiplier: 0.75, buffMultiplier: 1 }), 11);
    assert.equal(calculateDamage({ base: 20, elementMultiplier: 1.25, buffMultiplier: 1.25 }), 31);
  });

  it('applies skill bonus, crit and incoming reduction', () => {
    assert.equal(
      calculateDamage({ base: 10, elementMultiplier: 1, buffMultiplier: 1, skillBonusMultiplier: 2, critMultiplier: 2, incomingMultiplier: 0.75 }),
      30,
    );
  });

  it('never returns negative damage', () => {
    assert.equal(calculateDamage({ base: 10, elementMultiplier: 1, buffMultiplier: 1, incomingMultiplier: -1 }), 0);
  });
});
