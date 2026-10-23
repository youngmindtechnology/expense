import Dexie from 'dexie';
import { createClient } from '@supabase/supabase-js';
import { PROFILE } from '../profiles';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseKey);

// Each person has their own local database and their own rows in the cloud
export const OWNER = PROFILE?.id || null;
export const db = new Dexie(PROFILE?.dbName || 'CampusExpenseDB');
db.version(1).stores({
  transactions: 'id, type, amount, category, created_at, synced'
});
// v2: queue of deletions that still have to reach the cloud
db.version(2).stores({
  transactions: 'id, type, amount, category, created_at, synced',
  pendingDeletes: 'id'
});
// v3: spending goals (trips)
db.version(3).stores({
  transactions: 'id, type, amount, category, created_at, synced',
  pendingDeletes: 'id',
  trips: 'id, status, created_at, synced'
});

const TABLES = ['transactions', 'trips'];
let syncing = false;

async function pushDeletes() {
  const dels = await db.pendingDeletes.toArray();
  for (const table of TABLES) {
    const ids = dels.filter((d) => (d.table || 'transactions') === table).map((d) => d.id);
    if (ids.length === 0) continue;
    const { error } = await supabase.from(table).delete().in('id', ids);
    if (error) console.error(`Cloud delete error (${table}):`, error);
    else await db.pendingDeletes.bulkDelete(ids);
  }
}

async function syncTable(table) {
  const local = db[table];
  try {
    // Push new and edited records
    const unsynced = await local.where('synced').equals(0).toArray();
    if (unsynced.length > 0) {
      const payload = unsynced.map(({ synced, ...rest }) => ({ ...rest, synced: true, owner: OWNER }));
      const { error } = await supabase.from(table).upsert(payload);
      if (error) {
        console.error(`Cloud push error (${table}):`, error);
      } else {
        // Only mark a record synced if it was not edited again while uploading
        for (const item of unsynced) {
          await db.transaction('rw', local, async () => {
            const current = await local.get(item.id);
            if (current && JSON.stringify(current) === JSON.stringify(item)) {
              await local.update(item.id, { synced: 1 });
            }
          });
        }
      }
    }

    // Pull the cloud down without overwriting anything still waiting to upload
    let query = supabase.from(table).select('*');
    query = PROFILE?.adoptsUnowned
      ? query.or(`owner.eq.${OWNER},owner.is.null`)
      : query.eq('owner', OWNER);
    const { data, error } = await query;
    if (error || !data) return;

    const pending = new Set(
      (await db.pendingDeletes.toArray())
        .filter((d) => (d.table || 'transactions') === table)
        .map((d) => d.id)
    );
    const dirty = new Set(await local.where('synced').equals(0).primaryKeys());
    const cloudIds = new Set(data.map((r) => r.id));

    const incoming = data
      .filter((r) => !dirty.has(r.id) && !pending.has(r.id))
      .map((r) => ({ ...r, synced: 1 }));
    await local.bulkPut(incoming);

    // Records that were deleted from another device
    const localSynced = await local.where('synced').equals(1).primaryKeys();
    const gone = localSynced.filter((id) => !cloudIds.has(id));
    if (gone.length > 0) {
      // A response that would wipe most of the local data is more likely a mistake than a real delete
      const suspicious = gone.length > 5 && gone.length > localSynced.length / 2;
      if (suspicious) console.warn(`Skipped removing ${gone.length} ${table} records after sync`);
      else await local.bulkDelete(gone);
    }
  } catch (err) {
    // A problem with one table (for example a missing cloud table) must not stop the others
    console.error(`Cloud sync error (${table}):`, err);
  }
}

export async function syncWithCloud() {
  if (!OWNER || !navigator.onLine || syncing) return;
  syncing = true;
  try {
    await pushDeletes();
    for (const table of TABLES) await syncTable(table);
  } catch (err) {
    console.error('Cloud sync error:', err);
  } finally {
    syncing = false;
  }
}

/* ---------- transactions ---------- */

export async function deleteTransaction(t) {
  await db.transaction('rw', db.transactions, db.pendingDeletes, async () => {
    await db.transactions.delete(t.id);
    await db.pendingDeletes.put({ id: t.id, table: 'transactions' });
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

/* ---------- spending goals ---------- */

export async function deleteTrip(trip) {
  await db.transaction('rw', db.trips, db.pendingDeletes, async () => {
    await db.trips.delete(trip.id);
    await db.pendingDeletes.put({ id: trip.id, table: 'trips' });
  });
  syncWithCloud();
}

// Turns everything spent on a goal into real expenses (one per category)
// and closes the goal. This is the moment the main balance goes down.
export async function settleTrip(trip) {
  if (trip.status === 'settled') return;
  const byCategory = {};
  for (const e of trip.expenses || []) {
    if (!byCategory[e.category]) byCategory[e.category] = [];
    byCategory[e.category].push(e);
  }
  const now = Date.now();
  await db.transaction('rw', db.transactions, db.trips, async () => {
    let i = 0;
    for (const [category, list] of Object.entries(byCategory)) {
      await db.transactions.add({
        id: crypto.randomUUID(),
        type: 'expense',
        amount: Math.round(list.reduce((s, e) => s + Number(e.amount), 0) * 100) / 100,
        category,
        items: list.map((e) => ({ name: e.name, qty: e.qty, unitPrice: e.unitPrice })),
        note: `Goal: ${trip.name}`,
        created_at: new Date(now + i++).toISOString(),
        synced: 0
      });
    }
    await db.trips.update(trip.id, {
      status: 'settled',
      settled_at: new Date(now).toISOString(),
      synced: 0
    });
  });
  syncWithCloud();
}

window.addEventListener('online', syncWithCloud);