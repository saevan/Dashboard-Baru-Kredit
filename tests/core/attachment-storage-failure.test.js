import { test } from 'node:test';
import assert from 'node:assert/strict';

test('application/document writes report quota failure and preserve previously saved data', async () => {
     const previous = globalThis.localStorage;
     const saved = new Map();
     let full = false;
     globalThis.localStorage = {
          getItem: key => saved.get(key) ?? null,
          setItem: (key, value) => { if (full) throw new Error('QuotaExceededError'); saved.set(key, value); },
          removeItem: key => saved.delete(key)
     };
     try {
          const storage = await import('../../src/data/storage.js?quota-regression');
          storage.upsertApplication({ id: 'a', status: 'draft', documents: [] });
          storage.addDocument('b', { id: 'd', nama: 'Saved' });
          full = true;
          assert.throws(() => storage.upsertApplication({ id: 'a', documents: [{ id: 'new' }] }), /gagal disimpan/);
          assert.throws(() => storage.addDocument('b', { id: 'new' }), /gagal disimpan/);
          assert.throws(() => storage.deleteDocument('d'), /gagal disimpan/);
          assert.deepEqual(storage.getApplication('a').documents, []);
          assert.equal(storage.getDocumentsForBorrower('b').length, 1);
     } finally {
          if (previous === undefined) delete globalThis.localStorage;
          else globalThis.localStorage = previous;
     }
});
