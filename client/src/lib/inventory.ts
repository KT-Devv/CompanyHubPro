import { supabase } from './supabase';

// Each of these used to be 2-4 separate REST calls stitched together in the
// browser (read a row, decide, write, write again), with a manual best-effort
// rollback if a later step failed. A dropped connection or closed tab between
// steps could leave real, silent gaps — stock debited with no shipment ever
// logged, or two rows created for the same item by a race between two
// concurrent "add stock" calls.
//
// They now each call a single Postgres function (see
// migrations/harden_transactions_and_integrity_migration.sql) that does the
// whole thing as one atomic, server-side transaction: if anything inside it
// fails, everything it did is rolled back, so there is no partial outcome to
// reason about. The functions run as the calling user (SECURITY INVOKER), so
// every RLS policy still applies exactly as if these were plain table calls.

export async function addToInventory(
  storeId: string,
  itemName: string,
  quantity: number,
  remarks?: string | null,
): Promise<{ rowId: string; created: boolean }> {
  const { data, error } = await supabase
    .rpc('rpc_add_stock', {
      p_store_id: storeId,
      p_item_name: itemName,
      p_quantity: quantity,
      p_remarks: remarks || null,
    })
    .single();
  if (error) throw error;
  return { rowId: data.id, created: data.created };
}

export interface SendGoodsInput {
  itemId: string;
  fromStoreId: string;
  toStoreId: string;
  quantity: number;
  remarks?: string | null;
}

export async function sendGoods(input: SendGoodsInput): Promise<void> {
  const { error } = await supabase.rpc('rpc_send_goods', {
    p_item_id: input.itemId,
    p_from_store_id: input.fromStoreId,
    p_to_store_id: input.toStoreId,
    p_quantity: input.quantity,
    p_remarks: input.remarks || null,
  });
  if (error) throw error;
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
  const { data, error } = await supabase
    .rpc('rpc_receive_against_log', {
      p_log_id: pendingLog.id,
      p_receiving_store_id: receivingStoreId,
      p_item_name: itemName,
      p_quantity: quantity,
      p_remarks: remarks || null,
    })
    .single();
  if (error) throw error;
  return data.receive_status;
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
  const { error } = await supabase.rpc('rpc_receive_unlisted', {
    p_item_id: itemId,
    p_item_name: itemName,
    p_receiving_store_id: receivingStoreId,
    p_quantity: quantity,
    p_remarks: remarks || null,
  });
  if (error) throw error;
}
