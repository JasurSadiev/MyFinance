import { describe, it, expect, beforeEach } from 'vitest';
import { fakeDb, firestoreModule as fs } from '../fakeFirestore';

// The fake is only worth trusting if it is as strict as the real SDK about the things that break production.
describe('fake Firestore enforces the rules the app has to obey', () => {
  const db = {};
  beforeEach(() => fakeDb.reset());

  it('stores and lists documents by collection', async () => {
    await fs.setDoc(fs.doc(db, 'users', 'u', 'funds', 'a'), { name: 'A' });
    await fs.setDoc(fs.doc(db, 'users', 'u', 'funds', 'b'), { name: 'B' });
    await fs.setDoc(fs.doc(db, 'users', 'u', 'funds', 'b', 'child', 'x'), { name: 'nested' });
    const snap = await fs.getDocs(fs.collection(db, 'users', 'u', 'funds'));
    expect(snap.docs.map((d) => d.id).sort()).toEqual(['a', 'b']);
  });

  it('rejects undefined, NaN and Infinity field values, at any depth', async () => {
    const ref = fs.doc(db, 'users', 'u', 'funds', 'a');
    await expect(fs.setDoc(ref, { name: 'A', note: undefined })).rejects.toThrow(/undefined/);
    await expect(fs.setDoc(ref, { nested: { deep: [1, undefined] } })).rejects.toThrow(/undefined/);
    await expect(fs.setDoc(ref, { amount: NaN })).rejects.toThrow(/Non-finite/);
    await expect(fs.setDoc(ref, { amount: Infinity })).rejects.toThrow(/Non-finite/);
    expect(fakeDb.read('users/u/funds/a')).toBeUndefined();
  });

  it('requires every transaction read to happen before the first write', async () => {
    const ref = fs.doc(db, 'users', 'u', 'funds', 'a');
    fakeDb.seed('users/u/funds/a', { n: 1 });
    await expect(
      fs.runTransaction(db, async (tx) => {
        tx.set(ref, { n: 2 });
        await tx.get(ref); // read after write
      })
    ).rejects.toThrow(/all reads to be executed before all writes/);
    expect(fakeDb.read('users/u/funds/a')).toEqual({ n: 1 });
  });

  it('makes a transaction all-or-nothing', async () => {
    fakeDb.seed('users/u/funds/a', { n: 1 });
    // callback throws after staging a write -> nothing is applied
    await expect(
      fs.runTransaction(db, async (tx) => {
        tx.set(fs.doc(db, 'users', 'u', 'funds', 'a'), { n: 2 });
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(fakeDb.read('users/u/funds/a')).toEqual({ n: 1 });

    // update() of a missing document fails at commit -> the earlier set in the same transaction is rolled back too
    await expect(
      fs.runTransaction(db, async (tx) => {
        tx.set(fs.doc(db, 'users', 'u', 'funds', 'new'), { n: 3 });
        tx.update(fs.doc(db, 'users', 'u', 'funds', 'missing'), { n: 4 });
      })
    ).rejects.toThrow(/No document to update/);
    expect(fakeDb.read('users/u/funds/new')).toBeUndefined();
  });

  it('shows a transaction its own committed snapshot, and exposes writes only after commit', async () => {
    fakeDb.seed('users/u/funds/a', { n: 1 });
    await fs.runTransaction(db, async (tx) => {
      const before = await tx.get(fs.doc(db, 'users', 'u', 'funds', 'a'));
      tx.update(fs.doc(db, 'users', 'u', 'funds', 'a'), { n: (before.data() as { n: number }).n + 1 });
      expect(fakeDb.read('users/u/funds/a')).toEqual({ n: 1 }); // not visible until commit
    });
    expect(fakeDb.read('users/u/funds/a')).toEqual({ n: 2 });
  });
});
