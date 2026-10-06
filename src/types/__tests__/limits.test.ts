import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TEXT_LIMITS } from '../limits';

/**
 * The screens stop typing at these lengths so the database never has to refuse an entry as "access denied".
 * That only works while the numbers match firestore.rules, so this reads the rules file and compares.
 */
const rules = fs.readFileSync(path.resolve(__dirname, '../../../firestore.rules'), 'utf8');

/** The N in `isNonEmptyString(request.resource.data.<field>, N)` inside the `match /<collection>/...` block. */
function limitInRules(collection: string, field: string): number {
  const start = rules.indexOf(`match /${collection}/`);
  expect(start, `firestore.rules has no block for ${collection}`).toBeGreaterThan(-1);
  const next = rules.indexOf('match /', start + 1);
  const block = rules.slice(start, next === -1 ? undefined : next);
  const found = block.match(new RegExp(`isNonEmptyString\\(request\\.resource\\.data\\.${field},\\s*(\\d+)\\)`));
  expect(found, `firestore.rules sets no length limit for ${collection}.${field}`).not.toBeNull();
  return Number(found![1]);
}

describe('TEXT_LIMITS mirror the security rules', () => {
  it('card name', () => expect(TEXT_LIMITS.cardName).toBe(limitInRules('funds', 'name')));
  it('income source', () => expect(TEXT_LIMITS.incomeSource).toBe(limitInRules('incomes', 'source')));
  it('expense category', () => expect(TEXT_LIMITS.expenseCategory).toBe(limitInRules('expenses', 'category')));
});
