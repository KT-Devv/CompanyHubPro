// Row shapes as returned by Supabase (snake_case, matching the database).

export type WorkerType = 'casual' | 'non_marking';
export type AttendanceStatus = 'Present' | 'Absent' | 'Leave' | 'Half Day';
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['Present', 'Absent', 'Leave', 'Half Day'];

export interface Sector { id: string; sector_name: string }
export interface Site { id: string; site_name: string; sector_id: string | null }
export interface Portfolio { id: string; portfolio_name: string; rate: number }
export interface Position { id: string; position_name: string; rate: number | null }
export interface Store { id: string; name: string; location: string }

export interface UserProfile {
  id: string;
  full_name: string;
  role: string;
  site_id: string | null;
  store_id: string | null;
}

export interface WorkerRow {
  id: string;
  name: string | null;
  dob: string | null;
  worker_type: WorkerType | null;
  portfolio_id: string | null;
  position_id: string | null;
  site_id: string | null;
  date_of_employment: string | null;
  phone_number: string | null;
  national_id: string | null;
  contact_person: string | null;
  cp_phone: string | null;
  cp_relation: string | null;
  hometown: string | null;
  current_location: string | null;
  account_location: string | null;
  account_number: string | null;
  created_at: string;
  // joined
  portfolios: { portfolio_name: string; rate: number } | null;
  positions: { position_name: string; rate: number | null } | null;
  site: { id: string; site_name: string } | null;
  account_site: { id: string; site_name: string } | null;
}

export interface AttendanceRow {
  id: string;
  worker_id: string;
  date: string;
  timestamp: string;
  status: AttendanceStatus;
  marked_by: string;
  worker_type: WorkerType;
}

export interface LedgerRow {
  id: string;
  worker_id: string;
  amount: number;
  month: string;
  date: string;
  notes: string | null;
  created_at: string;
}

export interface TransferRow {
  id: string;
  worker_id: string;
  from_site_id: string | null;
  to_site_id: string | null;
  effective_date: string;
  cleared_account: boolean | null;
  old_account_number: string | null;
  new_account_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface InventoryRow {
  id: string;
  store_id: string;
  item_name: string;
  quantity: number;
  remarks: string | null;
  last_updated: string;
  stores: { name: string; location: string } | null;
}

export type GoodsLogType = 'sent' | 'received';
export type GoodsLogStatus = 'pending' | 'matched' | 'error';

export interface GoodsLogRow {
  id: string;
  item_id: string;
  store_from: string | null;
  store_to: string | null;
  quantity: number;
  type: GoodsLogType;
  status: GoodsLogStatus;
  reference_id: string | null;
  remarks: string | null;
  date: string;
  inventory: { item_name: string } | null;
  from_store: { id: string; name: string } | null;
  to_store: { id: string; name: string } | null;
}
