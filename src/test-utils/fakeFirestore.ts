/**
 * A strict, in-memory stand-in for the parts of `firebase/firestore` that the app's real writers use
 * (`addIncomeToFirestore`, `undoIncomeInFirestore`, `addExpenseToFirestore`, ...).
 *
 * Use it from a test with:
 *
 *   vi.mock('../firebaseConfig', () => ({ app: {}, auth: {}, db: {}, appCheck: null }));
 *   vi.mock('firebase/firestore', async () => (await import('../../test-utils/fakeFirestore')).firestoreModule);
 *
 * It is not Firestore, but it enforces the rules of the real SDK that decide whether the app's code is correct:
 *  - inside a transaction every read must come before the first write;
 *  - `undefined` (and NaN / Infinity) is rejected as a field value; the app does not enable
 *    `ignoreUndefinedProperties`, so the real service would reject it too;
 *  - a transaction's writes become visible only when it commits, and are all dropped if the callback throws;
 *  - `update()` on a document that does not exist fails.
 */
type Data = Record<string, unknown>;

interface DocRef {
  kind: 'doc';
  path: string;
  id: string;
}
interface CollectionRef {
  kind: 'collection';
  path: string;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function assertStorable(value: unknown, where: string, field = ''): void {
  if (value === undefined) {
    throw new Error(`Unsupported field value: undefined (found in field "${field}" of ${where})`);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`Non-finite number (${value}) in field "${field}" of ${where}`);
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new Error(`Unsupported field value: ${typeof value} (field "${field}" of ${where})`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertStorable(item, where, `${field}[${i}]`));
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) assertStorable(v, where, field ? `${field}.${k}` : k);
  }
}

export class FakeFirestore {
  docs = new Map<string, Data>();

  reset(): void {
    this.docs = new Map();
  }

  /** Document at an exact path, or undefined. */
  read(path: string): Data | undefined {
    const stored = this.docs.get(path);
    return stored === undefined ? undefined : clone(stored);
  }

  /** Direct children of a collection path, e.g. `users/u1/funds`. */
  list<T = Data>(collectionPath: string): Array<T & { id: string }> {
    const prefix = `${collectionPath}/`;
    return [...this.docs.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, data]) => ({ ...(clone(data) as T), id: path.slice(prefix.length) }));
  }

  /** Put a document in place without going through the app (test setup). */
  seed(path: string, data: Data): void {
    assertStorable(data, path);
    this.docs.set(path, clone(data));
  }
}

/** The one shared instance the mocked module talks to. Tests import this to inspect or reset state. */
export const fakeDb = new FakeFirestore();

const snapshotOf = (path: string) => {
  const data = fakeDb.read(path);
  return {
    id: path.slice(path.lastIndexOf('/') + 1),
    exists: () => data !== undefined,
    data: () => data,
  };
};

type StagedWrite =
  | { op: 'set'; path: string; data: Data }
  | { op: 'update'; path: string; data: Data }
  | { op: 'delete'; path: string };

function applyWrites(target: Map<string, Data>, writes: StagedWrite[]): void {
  for (const w of writes) {
    if (w.op === 'set') target.set(w.path, clone(w.data));
    else if (w.op === 'delete') target.delete(w.path);
    else {
      const current = target.get(w.path);
      if (current === undefined) throw new Error(`NOT_FOUND: No document to update: ${w.path}`);
      target.set(w.path, { ...current, ...clone(w.data) });
    }
  }
}

export const firestoreModule = {
  collection: (_db: unknown, ...segments: string[]): CollectionRef => ({
    kind: 'collection',
    path: segments.join('/'),
  }),

  doc: (_db: unknown, ...segments: string[]): DocRef => ({
    kind: 'doc',
    path: segments.join('/'),
    id: segments[segments.length - 1],
  }),

  getDocs: async (col: CollectionRef) => ({
    docs: fakeDb.list(col.path).map((d) => snapshotOf(`${col.path}/${d.id}`)),
  }),

  setDoc: async (ref: DocRef, data: Data) => {
    assertStorable(data, ref.path);
    fakeDb.docs.set(ref.path, clone(data));
  },

  deleteDoc: async (ref: DocRef) => {
    fakeDb.docs.delete(ref.path);
  },

  runTransaction: async <T>(
    _db: unknown,
    update: (tx: {
      get: (ref: DocRef) => Promise<ReturnType<typeof snapshotOf>>;
      set: (ref: DocRef, data: Data) => unknown;
      update: (ref: DocRef, data: Data) => unknown;
      delete: (ref: DocRef) => unknown;
    }) => Promise<T>
  ): Promise<T> => {
    const staged: StagedWrite[] = [];
    let wrote = false;

    const tx = {
      get: async (ref: DocRef) => {
        if (wrote) {
          throw new Error('Firestore transactions require all reads to be executed before all writes.');
        }
        return snapshotOf(ref.path);
      },
      set: (ref: DocRef, data: Data) => {
        wrote = true;
        assertStorable(data, ref.path);
        staged.push({ op: 'set', path: ref.path, data: clone(data) });
        return tx;
      },
      update: (ref: DocRef, data: Data) => {
        wrote = true;
        assertStorable(data, ref.path);
        staged.push({ op: 'update', path: ref.path, data: clone(data) });
        return tx;
      },
      delete: (ref: DocRef) => {
        wrote = true;
        staged.push({ op: 'delete', path: ref.path });
        return tx;
      },
    };

    const result = await update(tx);

    // Commit atomically: apply to a copy first so a failing write leaves the store untouched.
    const next = new Map(fakeDb.docs);
    applyWrites(next, staged);
    fakeDb.docs = next;
    return result;
  },

  // Live listeners are not exercised by these tests.
  onSnapshot: () => () => {},
};
