import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { fetchAllRows } from '../fetch-all';
import type { InvoiceRow, InvoiceType } from '../types';
import { qk } from './util';

// storeId scopes to one store (a store manager's own); omit it for all stores.
export function useInvoices(storeId?: string | null, enabled = true) {
  return useQuery({
    queryKey: [...qk.invoices, storeId ?? 'all'],
    enabled,
    queryFn: () =>
      fetchAllRows<InvoiceRow>(() => {
        let query = supabase.from('invoices').select('*, inventory(item_name), stores(name)');
        if (storeId) query = query.eq('store_id', storeId);
        return query.order('date', { ascending: false }).order('id');
      }),
  });
}

export interface NewInvoice {
  storeId: string;
  itemId: string;
  amount: number;
  quantity: number;
  supplierName: string;
  type: InvoiceType;
  invoiceNumber?: string;
}

// The database stamps who recorded it (created_by) itself; it is never sent from here.
export function useAddInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: NewInvoice) => {
      if (!Number.isInteger(v.amount) || v.amount <= 0) throw new Error('Amount must be a whole number above zero.');
      if (!Number.isInteger(v.quantity) || v.quantity <= 0) throw new Error('Quantity must be a whole number above zero.');
      if (!v.supplierName.trim()) throw new Error('Enter the supplier or customer name.');
      const { error } = await supabase.from('invoices').insert({
        store_id: v.storeId,
        item_id: v.itemId,
        amount: v.amount,
        quantity: v.quantity,
        supplier_name: v.supplierName.trim(),
        type: v.type,
        invoice_number: v.invoiceNumber?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.invoices }),
  });
}
