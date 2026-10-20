import Dexie from 'dexie';
import { createClient } from '@supabase/supabase-js';

// Supabase Cloud Client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseKey);

// Dexie IndexedDB (Local Browser Database)
export const db = new Dexie('CampusExpenseDB');

db.version(1).stores({
  transactions: 'id, type, amount, category, created_at, synced',
  balance: 'id, amount'
});

// Auto Sync function when internet connects
export async function syncOfflineData() {
  if (!navigator.onLine) return;

  try {
    // 1. Get unsynced local records
    const unsynced = await db.transactions.where('synced').equals(0).toArray();

    if (unsynced.length === 0) return;

    // 2. Prepare payload for cloud
    const payload = unsynced.map(({ synced, ...rest }) => ({
      ...rest,
      synced: true
    }));

    // 3. Upsert to Supabase
    const { error } = await supabase.from('transactions').upsert(payload);

    if (!error) {
      // 4. Mark local records as synced
      for (const item of unsynced) {
        await db.transactions.update(item.id, { synced: 1 });
      }
      console.log('Successfully synced offline data to Supabase!');
    }
  } catch (err) {
    console.error('Sync failed:', err);
  }
}

// Global window online event listener
window.addEventListener('online', syncOfflineData);