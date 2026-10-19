import type { SQLiteDatabase } from 'expo-sqlite';

export type Item = {
  id: number;
  description: string | null;
  price_cents: number;
  quantity: number;
};

export type PurchaseSummary = {
  id: number;
  finished_at: number;
  total_cents: number;
  item_count: number;
};

export const DATABASE_NAME = 'precosoma.db';

const DATABASE_VERSION = 1;

/** Schema versioning via PRAGMA user_version. Add `if (version < N)` blocks for future migrations. */
export async function migrate(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= DATABASE_VERSION) return;

  if (version < 1) {
    await db.execAsync(`
      PRAGMA journal_mode = 'wal';
      CREATE TABLE purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        finished_at INTEGER
      );
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER NOT NULL,
        description TEXT,
        price_cents INTEGER NOT NULL,
        quantity INTEGER NOT NULL
      );
      CREATE INDEX items_purchase_id ON items (purchase_id);
    `);
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

/** The purchase in progress (not finished yet), if any. */
export async function getCurrentPurchaseId(db: SQLiteDatabase): Promise<number | null> {
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM purchases WHERE finished_at IS NULL ORDER BY id DESC LIMIT 1',
  );
  return row?.id ?? null;
}

export function listItems(db: SQLiteDatabase, purchaseId: number): Promise<Item[]> {
  return db.getAllAsync<Item>(
    'SELECT id, description, price_cents, quantity FROM items WHERE purchase_id = ? ORDER BY id DESC',
    purchaseId,
  );
}

/** Adds an item to the purchase in progress, starting one if needed. */
export async function addItem(
  db: SQLiteDatabase,
  item: { description: string | null; priceCents: number; quantity: number },
) {
  await db.withTransactionAsync(async () => {
    let purchaseId = await getCurrentPurchaseId(db);
    if (purchaseId === null) {
      const res = await db.runAsync('INSERT INTO purchases (created_at) VALUES (?)', Date.now());
      purchaseId = res.lastInsertRowId;
    }
    await db.runAsync(
      'INSERT INTO items (purchase_id, description, price_cents, quantity) VALUES (?, ?, ?, ?)',
      purchaseId,
      item.description,
      item.priceCents,
      item.quantity,
    );
  });
}

export async function deleteItem(db: SQLiteDatabase, itemId: number) {
  await db.runAsync('DELETE FROM items WHERE id = ?', itemId);
}

export async function finishPurchase(db: SQLiteDatabase, purchaseId: number) {
  await db.runAsync('UPDATE purchases SET finished_at = ? WHERE id = ?', Date.now(), purchaseId);
}

export function listFinishedPurchases(db: SQLiteDatabase): Promise<PurchaseSummary[]> {
  return db.getAllAsync<PurchaseSummary>(`
    SELECT p.id AS id,
           p.finished_at AS finished_at,
           COALESCE(SUM(i.price_cents * i.quantity), 0) AS total_cents,
           COUNT(i.id) AS item_count
    FROM purchases p
    LEFT JOIN items i ON i.purchase_id = p.id
    WHERE p.finished_at IS NOT NULL
    GROUP BY p.id
    ORDER BY p.finished_at DESC
  `);
}

export function getPurchase(db: SQLiteDatabase, purchaseId: number) {
  return db.getFirstAsync<{ id: number; finished_at: number | null }>(
    'SELECT id, finished_at FROM purchases WHERE id = ?',
    purchaseId,
  );
}

export async function deletePurchase(db: SQLiteDatabase, purchaseId: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM items WHERE purchase_id = ?', purchaseId);
    await db.runAsync('DELETE FROM purchases WHERE id = ?', purchaseId);
  });
}

export function totalCents(items: Item[]): number {
  return items.reduce((sum, i) => sum + i.price_cents * i.quantity, 0);
}
