import { supabase } from './supabase';

// Stock movements are several writes (adjust stock, write the log, ...) and the
// browser has no transaction, so each helper undoes what it already did if a
// later step fails. Quantity changes are compare-and-set on the value we read,
// so two people adjusting the same row can't overwrite each other's change.

const MAX_ATTEMPTS = 5;

type Undo = () => Promise<unknown>;

async function runWithUndo<T>(steps: (onUndo: (fn: Undo) => void) => Promise<T>): Promise<T> {
  const undo: Undo[] = [];
  try {
    return await steps((fn) => undo.push(fn));
  } catch (error) {
    for (const fn of undo.reverse()) {
      // Promise.resolve().then: query builders are thenables with no .catch().
      await Promise.resolve()
        .then(fn)
        .catch((e) => console.error('Rollback step failed:', e));
    }
    throw error;
  }
}

// Adds `delta` (may be negative) to an inventory row's quantity.
export async function changeQuantity(rowId: string, delta: number): Promise<number> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: row, error } = await supabase
      .from('inventory')
      .select('id, quantity')
      .eq('id', rowId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error('Inventory item not found');

    const next = (row.quantity || 0) + delta;
    if (next < 0) throw new Error('Insufficient quantity in stock');

    const { data: updated, error: updateError } = await supabase
      .from('inventory')
      .update({ quantity: next })
      .eq('id', rowId)
      .eq('quantity', row.quantity)
      .select('id');
    if (updateError) throw updateError;
    if (updated?.length) return next;
    // Someone changed the quantity between our read and write: read again.
  }
  throw new Error('Stock is being changed by someone else right now. Please try again.');
}

// Adds stock for an item in a store, merging into the existing row if the store
// already holds that item (a plain insert would create duplicate rows).
export async function addToInventory(
  storeId: string,
  itemName: string,
  quantity: number,
  remarks?: string | null,
): Promise<{ rowId: string; created: boolean }> {
  const name = itemName.trim();
  if (!name) throw new Error('Item name is required');

  const { data: rows, error } = await supabase
    .from('inventory')
    .select('id')
    .eq('store_id', storeId)
    .eq('item_name', name)
    .limit(1);
  if (error) throw error;

  if (rows?.length) {
    await changeQuantity(rows[0].id, quantity);
    return { rowId: rows[0].id, created: false };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('inventory')
    .insert({ store_id: storeId, item_name: name, quantity, remarks: remarks || null })
    .select('id')
    .single();
  if (insertError) throw insertError;
  return { rowId: inserted.id, created: true };
}

export interface SendGoodsInput {
  itemId: string;
  fromStoreId: string;
  toStoreId: string;
  quantity: number;
  remarks?: string | null;
}

// Takes stock out of the sending store and logs a pending transfer.
export async function sendGoods({ itemId, fromStoreId, toStoreId, quantity, remarks }: SendGoodsInput): Promise<void> {
  if (!fromStoreId) throw new Error('Source store is required');
  if (!toStoreId) throw new Error('Destination store is required');
  if (fromStoreId === toStoreId) throw new Error('Source and destination store must be different');

  const { data: item, error } = await supabase
    .from('inventory')
    .select('id, store_id')
    .eq('id', itemId)
    .maybeSingle();
  if (error) throw error;
  if (!item) throw new Error('Item not found');
  if (item.store_id !== fromStoreId) throw new Error('Selected item does not belong to the chosen source store');

  await runWithUndo(async (onUndo) => {
    await changeQuantity(item.id, -quantity);
    onUndo(() => changeQuantity(item.id, quantity));

    const { error: logError } = await supabase.from('goods_log').insert({
      item_id: item.id,
      store_from: fromStoreId,
      store_to: toStoreId,
      quantity,
      type: 'sent',
      status: 'pending',
      remarks: remarks || null,
    });
    if (logError) throw logError;
  });
}

export interface ReceiveAgainstLogInput {
  pendingLog: { id: string; item_id: string; store_from: string | null; quantity: number };
  receivingStoreId: string;
  itemName: string;
  quantity: number;
  remarks?: string | null;
}

// Receives goods against a specific pending 'sent' log. Returns 'matched' when
// the counted quantity equals what was sent, 'error' when it doesn't (the stock
// is still added, and both logs are flagged for review).
export async function receiveAgainstLog({
  pendingLog,
  receivingStoreId,
  itemName,
  quantity,
  remarks,
}: ReceiveAgainstLogInput): Promise<'matched' | 'error'> {
  const status = pendingLog.quantity === quantity ? 'matched' : 'error';

  await runWithUndo(async (onUndo) => {
    // Claim the log first. Only one receiver can move it out of 'pending', so a
    // double-click, or two people receiving the same shipment, can't add the
    // stock twice.
    const { data: claimed, error: claimError } = await supabase
      .from('goods_log')
      .update({ status })
      .eq('id', pendingLog.id)
      .eq('status', 'pending')
      .select('id');
    if (claimError) throw claimError;
    if (!claimed?.length) {
      throw new Error('This transfer was already received or changed. Please refresh and check.');
    }
    onUndo(async () => {
      const { error } = await supabase.from('goods_log').update({ status: 'pending' }).eq('id', pendingLog.id);
      if (error) throw error;
    });

    const added = await addToInventory(receivingStoreId, itemName, quantity);
    onUndo(() => changeQuantity(added.rowId, -quantity));

    const { error: logError } = await supabase.from('goods_log').insert({
      item_id: pendingLog.item_id,
      store_from: pendingLog.store_from,
      store_to: receivingStoreId,
      quantity,
      type: 'received',
      status,
      reference_id: pendingLog.id,
      remarks: remarks || null,
    });
    if (logError) throw logError;
  });

  return status;
}

export interface ReceiveUnexpectedInput {
  itemId: string;
  itemName: string;
  receivingStoreId: string;
  quantity: number;
  remarks?: string | null;
}

// Receives goods that no pending 'sent' log accounts for. The stock is added and
// the receipt is flagged 'error' so it shows up for review.
export async function receiveUnexpected({
  itemId,
  itemName,
  receivingStoreId,
  quantity,
  remarks,
}: ReceiveUnexpectedInput): Promise<void> {
  await runWithUndo(async (onUndo) => {
    const added = await addToInventory(receivingStoreId, itemName, quantity);
    onUndo(() => changeQuantity(added.rowId, -quantity));

    const { error: logError } = await supabase.from('goods_log').insert({
      item_id: itemId,
      store_to: receivingStoreId,
      quantity,
      type: 'received',
      status: 'error',
      remarks: remarks || null,
    });
    if (logError) throw logError;
  });
}
