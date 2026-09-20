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
  createdBy: string | null;
}

// Moves a worker to another site and records the transfer. There is no
// multi-statement transaction from the browser, so the worker is moved first
// and put back if the audit row can't be written; the two never disagree.
export async function transferWorker(input: TransferInput): Promise<void> {
  const { worker, toSiteId } = input;
  const isCasual = worker.worker_type === 'casual';
  const newAccountNumber = input.newAccountNumber?.trim() ?? '';

  if (worker.site_id === toSiteId) {
    throw new Error('The worker is already assigned to that site.');
  }
  if (isCasual && (!newAccountNumber || !input.newAccountLocation)) {
    throw new Error('Casual workers require a new account location and number upon transfer.');
  }

  const update: Record<string, unknown> = { site_id: toSiteId };
  if (isCasual) {
    update.account_number = newAccountNumber;
    update.account_location = input.newAccountLocation;
  }

  // .select() so a row silently filtered out by RLS shows up as "0 rows"
  // instead of being reported as success.
  const { data: updated, error: updateError } = await supabase
    .from('workers')
    .update(update)
    .eq('id', worker.id)
    .select('id');
  if (updateError) throw updateError;
  if (!updated?.length) {
    throw new Error('The transfer was not saved: you may not have permission, or the worker no longer exists.');
  }

  const { error: logError } = await supabase.from('worker_transfers').insert({
    worker_id: worker.id,
    from_site_id: worker.site_id,
    to_site_id: toSiteId,
    effective_date: input.effectiveDate,
    cleared_account: isCasual,
    old_account_number: worker.account_number,
    new_account_number: isCasual ? newAccountNumber : null,
    notes: input.notes?.trim() || null,
    created_by: input.createdBy,
  });

  if (logError) {
    const restore: Record<string, unknown> = { site_id: worker.site_id };
    if (isCasual) {
      restore.account_number = worker.account_number;
      restore.account_location = worker.account_location;
    }
    const { error: restoreError } = await supabase.from('workers').update(restore).eq('id', worker.id);
    if (restoreError) {
      throw new Error(
        `The transfer could not be logged (${logError.message}) and the worker could not be restored automatically. Please check this worker's site and account details.`,
      );
    }
    throw logError;
  }
}
