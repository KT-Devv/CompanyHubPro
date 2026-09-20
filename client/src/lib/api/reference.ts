import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { Portfolio, Position, Site, Store, UserProfile } from '../types';
import { qk } from './util';

// Small, slow-changing lookup tables.
const REFERENCE_STALE = 5 * 60 * 1000;

export function useSites() {
  return useQuery({
    queryKey: qk.sites,
    staleTime: REFERENCE_STALE,
    queryFn: async () => {
      const { data, error } = await supabase.from('sites').select('*').order('site_name');
      if (error) throw error;
      return data as Site[];
    },
  });
}

export function usePortfolios() {
  return useQuery({
    queryKey: qk.portfolios,
    staleTime: REFERENCE_STALE,
    queryFn: async () => {
      const { data, error } = await supabase.from('portfolios').select('id, portfolio_name, rate').order('portfolio_name');
      if (error) throw error;
      return data as Portfolio[];
    },
  });
}

export function usePositions() {
  return useQuery({
    queryKey: qk.positions,
    staleTime: REFERENCE_STALE,
    queryFn: async () => {
      const { data, error } = await supabase.from('positions').select('id, position_name, rate').order('position_name');
      if (error) throw error;
      return data as Position[];
    },
  });
}

export function useStores() {
  return useQuery({
    queryKey: qk.stores,
    staleTime: REFERENCE_STALE,
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('*').order('name');
      if (error) throw error;
      return data as Store[];
    },
  });
}

// Profiles are readable by every signed-in user; used to show who did what.
export function useUsers() {
  return useQuery({
    queryKey: qk.users,
    staleTime: REFERENCE_STALE,
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('id, full_name, role, site_id, store_id').order('full_name');
      if (error) throw error;
      return data as UserProfile[];
    },
  });
}
