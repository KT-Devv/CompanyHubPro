import { supabase } from './supabase';

export interface TransferInput {
  worker: {
    id: string;
    site_id: string | null;
    worker_type: string | null;
    account_number: string | null;
    account_location: string | null;
  };
  toSiteId: string;
  effectiveDate: string;
  notes?: string;
  // Casual workers are paid into a site-specific account, so a transfer resets it.
  newAccountNumber?: string;
  newAccountLocation?: string | null;
}

// Moves a worker to another site and records the transfer, as a single
// database transaction (see rpc_transfer_worker in
// migrations/harden_transactions_and_integrity_migration.sql). The worker's
// site/account and the audit-log row are written together or not at all — a
// dropped connection mid-transfer can no longer leave one without the other,
// the way the old two-separate-writes-plus-manual-rollback version could.
//
// Who performed the transfer (created_by) is set by the function from the
// caller's own authenticated identity, not from anything passed in here: the
// old code took it as a plain argument, which meant a request crafted outside
// the UI could attribute a transfer to a different, real user.
export async function transferWorker(input: TransferInput): Promise<void> {
  const { worker, toSiteId } = input;

  const { error } = await supabase.rpc('rpc_transfer_worker', {
    p_worker_id: worker.id,
    p_to_site_id: toSiteId,
    p_effective_date: input.effectiveDate,
    p_notes: input.notes?.trim() || null,
    p_new_account_number: input.newAccountNumber?.trim() || null,
    p_new_account_location: input.newAccountLocation || null,
  });
  if (error) throw error;
}
