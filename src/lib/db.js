import Dexie from 'dexie';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseKey);

export const db = new Dexie('CampusExpenseDB');
db.version(1).stores({
  transactions: 'id, type, amount, category, created_at, synced'
});
// v2 adds a queue of deletions that still have to reach the cloud
db.version(2).stores({
  transactions: 'id, type, amount, category, created_at, synced',
  pendingDeletes: 'id'
});

let syncing = false;

// Sync both ways: push local changes and deletions up, then pull the cloud down
export async function syncWithCloud() {
  if (!navigator.onLine || syncing) return;
  syncing = true;
  try {
    // 1. Push queued deletions
    const dels = await db.pendingDeletes.toArray();
    if (dels.length > 0) {
      const ids = dels.map((d) => d.id);
      const { error } = await supabase.from('transactions').delete().in('id', ids);
      if (!error) await db.pendingDeletes.bulkDelete(ids);
    }

    // 2. Push new and edited records
    const unsynced = await db.transactions.where('synced').equals(0).toArray();
    if (unsynced.length > 0) {
      const payload = unsynced.map(({ synced, ...rest }) => ({ ...rest, synced: true }));
      const { error } = await supabase.from('transactions').upsert(payload);
      if (!error) {
        await db.transactions.bulkUpdate(unsynced.map((item) => ({ key: item.id, changes: { synced: 1 } })));
      } else {
        console.error('Cloud push error:', error);
      }
    }

    // 3. Pull the cloud down, without overwriting anything still waiting to upload
    const { data, error } = await supabase.from('transactions').select('*');
    if (!error && data) {
      const pending = new Set((await db.pendingDeletes.toArray()).map((d) => d.id));
      const dirty = new Set(await db.transactions.where('synced').equals(0).primaryKeys());
      const cloudIds = new Set(data.map((r) => r.id));

      const incoming = data
        .filter((r) => !dirty.has(r.id) && !pending.has(r.id))
        .map((r) => ({ ...r, synced: 1 }));
      await db.transactions.bulkPut(incoming);

      // Records that were deleted from another device
      const localSynced = await db.transactions.where('synced').equals(1).primaryKeys();
      const gone = localSynced.filter((id) => !cloudIds.has(id));
      if (gone.length > 0) await db.transactions.bulkDelete(gone);
    }
  } catch (err) {
    console.error('Cloud sync error:', err);
  } finally {
    syncing = false;
  }
}

export async function deleteTransaction(t) {
  await db.transaction('rw', db.transactions, db.pendingDeletes, async () => {
    await db.transactions.delete(t.id);
    await db.pendingDeletes.put({ id: t.id });
  });
  syncWithCloud();
}

export async function restoreTransaction(t) {
  await db.transaction('rw', db.transactions, db.pendingDeletes, async () => {
    await db.pendingDeletes.delete(t.id);
    await db.transactions.put({ ...t, synced: 0 });
  });
  syncWithCloud();
}

window.addEventListener('online', syncWithCloud);