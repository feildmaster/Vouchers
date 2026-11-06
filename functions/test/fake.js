const Module = require('node:module');

const wrap = (value) => (value instanceof Date
  ? { toDate: () => value, toMillis: () => value.getTime() }
  : value);

const unwrap = (value) => (value && typeof value.toDate === 'function' ? value.toDate() : value);

const unwrapAll = (data) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, unwrap(v)]));

const parentPath = (path) => path.split('/').slice(0, -1).join('/');

module.exports = () => {
  const store = new Map();
  const users = new Map();
  let autoId = 0;

  const snapshot = (path) => {
    const data = store.get(path);
    return {
      id: path.split('/').pop(),
      exists: data !== undefined,
      ref: docRef(path),
      data: () => data && Object.fromEntries(Object.entries(data).map(([k, v]) => [k, wrap(v)])),
      get: (field) => wrap(data && data[field]),
    };
  };

  const docRef = (path) => ({
    path,
    id: path.split('/').pop(),
    get parent() {
      const collection = parentPath(path);
      return {
        path: collection,
        parent: collection.includes('/') ? docRef(parentPath(collection)) : null,
      };
    },
    get: async () => snapshot(path),
    set: async (data, { merge = false } = {}) => {
      store.set(path, merge ? { ...store.get(path), ...unwrapAll(data) } : unwrapAll(data));
    },
    delete: async () => { store.delete(path); },
    update: async (fields) => {
      if (!store.has(path)) throw new Error(`No document: ${path}`);
      store.set(path, { ...store.get(path), ...unwrapAll(fields) });
    },
  });

  const firestore = () => ({
    doc: docRef,
    collection: (name) => {
      const query = (filters) => ({
        where: (field, op, value) => query([...filters, [field, value]]),
        get: async () => {
          const docs = [...store.keys()]
            .filter((path) => parentPath(path) === name
              && filters.every(([field, value]) => store.get(path)[field] === value))
            .map(snapshot);
          return { docs, size: docs.length, empty: docs.length === 0 };
        },
      });
      return {
        add: async (data) => {
          autoId += 1;
          const ref = docRef(`${name}/auto${autoId}`);
          await ref.set(data);
          return ref;
        },
        ...query([]),
      };
    },
    runTransaction: async (fn) => {
      const writes = [];
      const result = await fn({
        get: (ref) => ref.get(),
        set: (ref, data, options) => writes.push(() => ref.set(data, options)),
        update: (ref, fields) => writes.push(() => ref.update(fields)),
        delete: (ref) => writes.push(() => ref.delete()),
      });
      await Promise.all(writes.map((write) => write()));
      return result;
    },
  });

  const modules = {
    'firebase-admin/firestore': {
      getFirestore: firestore,
      FieldValue: { serverTimestamp: () => new Date() },
    },
    'firebase-admin/auth': {
      getAuth: () => ({
        getUser: async (uid) => {
          if (!users.has(uid)) throw Object.assign(new Error('not found'), { code: 'auth/user-not-found' });
          return { uid, customClaims: users.get(uid) };
        },
      }),
    },
  };

  const original = Module._load;
  Module._load = function load(request, ...rest) {
    return modules[request] || original.call(this, request, ...rest);
  };

  return {
    store,
    users,
    restore: () => { Module._load = original; },
  };
};
