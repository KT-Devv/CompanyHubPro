// Sample data for demo mode (VITE_DEMO=true). Deterministic, so screenshots and
// tests are repeatable. Nothing in here is real.
import { computePayroll, type AttendanceDay, type LedgerAmount } from '../lib/payroll';
import { lineToRow, payrollWorkersFrom } from './payroll';

export type Row = Record<string, any>;
export type Tables = Record<string, Row[]>;

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Small deterministic random generator (mulberry32)
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const uid = (prefix: string, n: number) => `${prefix}-${String(n).padStart(3, '0')}`;

const BANKS = ['GCB Bank', 'Ecobank Ghana', 'Fidelity Bank', 'Stanbic Bank'];
const FIRST = ['Kwame', 'Ama', 'Yaw', 'Akosua', 'Kofi', 'Abena', 'Kwesi', 'Efua', 'Nana', 'Adwoa', 'Kojo', 'Esi', 'Yaa', 'Kweku', 'Afia', 'Fiifi', 'Maame', 'Kobby', 'Araba', 'Papa'];
const LAST = ['Mensah', 'Boateng', 'Owusu', 'Asante', 'Osei', 'Appiah', 'Agyeman', 'Darko', 'Amoah', 'Quaye', 'Tetteh', 'Acheampong'];

export const DEMO_USER_IDS: Record<string, string> = {
  ceo: 'demo-ceo',
  hr: 'demo-hr',
  finance: 'demo-finance',
  system_manager: 'demo-system_manager',
  project_manager: 'demo-project_manager',
  supervisor: 'demo-supervisor',
  logistics_manager: 'demo-logistics_manager',
  store_manager: 'demo-store_manager',
  secretary: 'demo-secretary',
};

export function seedTables(now: Date = new Date()): Tables {
  const rand = rng(42);
  const today = isoDay(now);
  const month = today.slice(0, 7);
  const iso = (d: Date) => d.toISOString();

  const sectors = [{ id: 'sec-1', sector_name: 'Coastal', created_at: iso(now) }, { id: 'sec-2', sector_name: 'Ashanti', created_at: iso(now) }];
  const sites = [
    { id: 'site-1', site_name: 'Accra Central', sector_id: 'sec-1', created_at: iso(now) },
    { id: 'site-2', site_name: 'Tema Port', sector_id: 'sec-1', created_at: iso(now) },
    { id: 'site-3', site_name: 'Kumasi Ridge', sector_id: 'sec-2', created_at: iso(now) },
    { id: 'site-4', site_name: 'Takoradi Yard', sector_id: 'sec-1', created_at: iso(now) },
  ];
  const portfolios = [
    { id: 'pf-1', portfolio_name: 'Mason', rate: 120 },
    { id: 'pf-2', portfolio_name: 'Carpenter', rate: 110 },
    { id: 'pf-3', portfolio_name: 'Electrician', rate: 140 },
    { id: 'pf-4', portfolio_name: 'Labourer', rate: 80 },
    { id: 'pf-5', portfolio_name: 'Helper', rate: 70 },
  ];
  const positions = [
    { id: 'pos-1', position_name: 'Accountant', rate: 4200 },
    { id: 'pos-2', position_name: 'Secretary', rate: 2800 },
    { id: 'pos-3', position_name: 'Site Engineer', rate: 5200 },
    { id: 'pos-4', position_name: 'HR Officer', rate: 3800 },
  ];
  const stores = [
    { id: 'store-1', name: 'Accra Store', location: 'Accra Central', created_at: iso(now) },
    { id: 'store-2', name: 'Kumasi Store', location: 'Kumasi Ridge', created_at: iso(now) },
    { id: 'store-3', name: 'Tema Store', location: 'Tema Port', created_at: iso(now) },
  ];

  const users: Row[] = [
    ['ceo', 'Efua Danquah', null, null],
    ['hr', 'Kojo Amankwah', null, null],
    ['finance', 'Abena Sarpong', null, null],
    ['system_manager', 'Kwesi Nyarko', null, null],
    ['project_manager', 'Yaa Frimpong', null, null],
    ['supervisor', 'Kofi Adjei', 'site-1', null],
    ['logistics_manager', 'Nana Ofori', null, null],
    ['store_manager', 'Esi Bonsu', null, 'store-1'],
    ['secretary', 'Afia Kyei', null, null],
  ].map(([role, full_name, site_id, store_id]): Row => ({
    id: DEMO_USER_IDS[role as string],
    email: `${role}@demo.local`,
    full_name,
    role,
    site_id,
    store_id,
    is_active: true,
    created_at: iso(now),
  }));
  users.push(
    ...[
      ['demo-supervisor2', 'supervisor2@demo.local', 'Yaw Boadu', 'supervisor', 'site-2', null, true],
      ['demo-store_manager2', 'store_manager2@demo.local', 'Adwoa Tetteh', 'store_manager', null, 'store-2', true],
      ['demo-finance2', 'finance2@demo.local', 'Kojo Mintah', 'finance', null, null, false],
    ].map(([id, email, full_name, role, site_id, store_id, is_active]): Row => ({ id, email, full_name, role, site_id, store_id, is_active, created_at: iso(now) })),
  );

  // ---- workers: 36 casual across the four sites + 6 office staff
  const workers: Row[] = [];
  const casualPortfolios = ['pf-1', 'pf-2', 'pf-3', 'pf-4', 'pf-5'];
  for (let i = 0; i < 36; i++) {
    const site = sites[i % sites.length];
    const acct = sites[(i + 1) % sites.length];
    workers.push({
      id: uid('w', i + 1),
      name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
      dob: `${1978 + (i % 20)}-0${(i % 9) + 1}-1${i % 9}`,
      worker_type: 'casual',
      portfolio_id: casualPortfolios[i % casualPortfolios.length],
      position_id: null,
      site_id: site.id,
      date_of_employment: `202${i % 5}-0${(i % 9) + 1}-05`,
      phone_number: `024 ${String(1000000 + i * 7919).slice(0, 3)} ${String(1000 + i * 31).slice(0, 4)}`,
      national_id: `GHA-${72000000 + i * 1337}-${i % 9}`,
      contact_person: `${FIRST[(i + 3) % FIRST.length]} ${LAST[(i + 5) % LAST.length]}`,
      cp_phone: `055 ${String(2000000 + i * 4111).slice(0, 3)} ${String(2000 + i * 17).slice(0, 4)}`,
      cp_relation: ['Spouse', 'Sibling', 'Parent', 'Friend'][i % 4],
      hometown: ['Kumasi', 'Cape Coast', 'Tamale', 'Ho', 'Koforidua'][i % 5],
      current_location: site.site_name,
      account_location: acct.id,
      account_number: `10${String(20000000 + i * 90019).slice(0, 8)}`,
      bank_name: BANKS[i % BANKS.length],
      created_at: iso(now),
    });
  }
  const officeRoles = ['pos-1', 'pos-2', 'pos-3', 'pos-4', 'pos-3', 'pos-2'];
  for (let i = 0; i < 6; i++) {
    workers.push({
      id: uid('w', 100 + i),
      name: `${FIRST[(i + 9) % FIRST.length]} ${LAST[(i * 5 + 2) % LAST.length]}`,
      dob: `198${i}-04-1${i}`,
      worker_type: 'non_marking',
      portfolio_id: null,
      position_id: officeRoles[i],
      site_id: i < 4 ? 'site-1' : 'site-2',
      date_of_employment: `2021-0${i + 1}-01`,
      phone_number: `020 ${String(3000000 + i * 5077).slice(0, 3)} ${String(3000 + i * 91).slice(0, 4)}`,
      national_id: `GHA-${81000000 + i * 911}-${i}`,
      contact_person: `${FIRST[(i + 11) % FIRST.length]} ${LAST[(i + 1) % LAST.length]}`,
      cp_phone: `050 ${String(4000000 + i * 3001).slice(0, 3)} ${String(4000 + i * 13).slice(0, 4)}`,
      cp_relation: 'Spouse',
      hometown: 'Accra',
      current_location: 'Accra',
      account_location: 'site-1',
      // One office worker has no account on file, so the bank-file checks have something to flag.
      account_number: i === 5 ? null : `20${String(40000000 + i * 70031).slice(0, 8)}`,
      bank_name: i === 5 ? null : BANKS[(i + 1) % BANKS.length],
      created_at: iso(now),
    });
  }

  // ---- attendance: every past day this month for casual workers; ~65% of today
  const attendance: Row[] = [];
  const supervisorId = DEMO_USER_IDS.supervisor;
  const secretaryId = DEMO_USER_IDS.secretary;
  const dayOfMonth = now.getDate();
  let aid = 1;
  const monthBack = (n: number) => {
    const d = new Date(now.getFullYear(), now.getMonth() - n, 1);
    return { prefix: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, days: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() };
  };
  const previous = monthBack(1);
  const older = monthBack(2);
  const fillMonth = (prefix: string, lastDay: number) => {
    for (let d = 1; d <= lastDay; d++) {
      const date = `${prefix}-${pad(d)}`;
      if (new Date(`${date}T00:00:00`).getDay() === 0) continue; // no Sundays
      for (const w of workers.filter((x) => x.worker_type === 'casual')) {
        const r = rand();
        attendance.push({
          id: uid('a', aid++),
          worker_id: w.id,
          date,
          timestamp: `${date}T0${7 + Math.floor(rand() * 2)}:${pad(Math.floor(rand() * 60))}:00.000Z`,
          status: r < 0.82 ? 'Present' : r < 0.9 ? 'Half Day' : r < 0.96 ? 'Absent' : 'Leave',
          marked_by: supervisorId,
          worker_type: 'casual',
          created_at: iso(now),
        });
      }
    }
  };
  fillMonth(older.prefix, older.days);
  fillMonth(previous.prefix, previous.days);
  fillMonth(month, dayOfMonth - 1);
  for (const w of workers) {
    if (rand() < 0.65) {
      const r = rand();
      attendance.push({
        id: uid('a', aid++),
        worker_id: w.id,
        date: today,
        timestamp: new Date(now.getTime() - Math.floor(rand() * 3 * 3600_000)).toISOString(),
        status: r < 0.78 ? 'Present' : r < 0.86 ? 'Half Day' : r < 0.94 ? 'Absent' : 'Leave',
        marked_by: w.worker_type === 'non_marking' ? secretaryId : supervisorId,
        worker_type: w.worker_type,
        created_at: iso(now),
      });
    }
  }

  // ---- stock
  const inventory = [
    ['store-1', 'Cement bags', 240, 'Grade 42.5'],
    ['store-1', 'Rebar 12mm', 86, null],
    ['store-1', 'Safety helmets', 8, 'Reorder soon'],
    ['store-1', 'Sand (tonnes)', 32, null],
    ['store-1', 'Paint 20L', 5, null],
    ['store-2', 'Cement bags', 130, null],
    ['store-2', 'Rebar 12mm', 44, null],
    ['store-2', 'Gloves (pairs)', 60, null],
    ['store-2', 'Nails 4"', 0, 'Out of stock'],
    ['store-3', 'Cement bags', 310, null],
    ['store-3', 'Gravel (tonnes)', 18, null],
    ['store-3', 'Safety boots', 12, null],
  ].map(([store_id, item_name, quantity, remarks], i) => ({
    id: uid('inv', i + 1),
    store_id,
    item_name,
    quantity,
    remarks,
    min_quantity: item_name === 'Cement bags' ? 50 : item_name === 'Safety helmets' ? 15 : 10,
    low_alerted_at: null,
    last_updated: new Date(now.getTime() - i * 5400_000).toISOString(),
  }));

  const ago = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();
  const goods_log = [
    { id: 'gl-1', item_id: 'inv-006', store_from: 'store-2', store_to: 'store-1', quantity: 40, type: 'sent', status: 'pending', reference_id: null, remarks: 'For the Accra Central slab pour', date: ago(3) },
    { id: 'gl-2', item_id: 'inv-010', store_from: 'store-3', store_to: 'store-1', quantity: 60, type: 'sent', status: 'pending', reference_id: null, remarks: null, date: ago(20) },
    { id: 'gl-3', item_id: 'inv-002', store_from: 'store-1', store_to: 'store-2', quantity: 20, type: 'sent', status: 'matched', reference_id: null, remarks: null, date: ago(50) },
    { id: 'gl-4', item_id: 'inv-002', store_from: 'store-1', store_to: 'store-2', quantity: 20, type: 'received', status: 'matched', reference_id: 'gl-3', remarks: null, date: ago(46) },
    { id: 'gl-5', item_id: 'inv-004', store_from: 'store-3', store_to: 'store-1', quantity: 15, type: 'sent', status: 'error', reference_id: null, remarks: null, date: ago(90) },
    { id: 'gl-6', item_id: 'inv-004', store_from: 'store-3', store_to: 'store-1', quantity: 12, type: 'received', status: 'error', reference_id: 'gl-5', remarks: '3 bags damaged in transit', date: ago(80) },
  ].map((l) => ({ ...l, created_at: l.date }));

  // ---- finance entries for the current month
  const salary_advances = [
    ['w-003', 200, 'Medical'], ['w-011', 150, null], ['w-017', 300, 'School fees'], ['w-104', 500, null],
  ].map(([worker_id, amount, notes], i) => ({ id: uid('adv', i + 1), worker_id, amount, month, date: `${month}-0${Math.min(dayOfMonth, 3 + i)}`, notes, created_at: iso(now) }));
  const loans = [['w-006', 800, 'Tools loan'], ['w-020', 1200, null]].map(([worker_id, amount, notes], i) => ({
    id: uid('loan', i + 1), worker_id, amount, month, date: `${month}-0${Math.min(dayOfMonth, 2 + i)}`, notes, created_at: iso(now),
  }));
  const deductions = [['w-009', 60, 'Lost helmet'], ['w-025', 40, 'Late penalty']].map(([worker_id, amount, notes], i) => ({
    id: uid('ded', i + 1), worker_id, amount, month, date: `${month}-0${Math.min(dayOfMonth, 4 + i)}`, notes, created_at: iso(now),
  }));

  const worker_transfers = [
    { id: 'tr-1', worker_id: 'w-004', from_site_id: 'site-2', to_site_id: 'site-1', effective_date: `${month}-01`, cleared_account: true, old_account_number: '1020000123', new_account_number: '1044550098', notes: 'Project ramp-up', created_by: DEMO_USER_IDS.hr, created_at: ago(200) },
    { id: 'tr-2', worker_id: 'w-101', from_site_id: 'site-2', to_site_id: 'site-1', effective_date: `${month}-01`, cleared_account: false, old_account_number: null, new_account_number: null, notes: null, created_by: DEMO_USER_IDS.system_manager, created_at: ago(300) },
  ];

  // Entries for the two months before this one (this month's are above).
  const priorLedger = (prefix: string, tag: string) => ({
    advances: [['w-002', 250, 'Rent'], ['w-009', 100, null], ['w-103', 400, null]].map(([worker_id, amount, notes], i) => ({ id: `adv-${tag}-${i}`, worker_id, amount, month: prefix, date: `${prefix}-0${5 + i}`, notes, created_at: iso(now) })),
    loans: [['w-014', 600, 'Tools loan']].map(([worker_id, amount, notes], i) => ({ id: `loan-${tag}-${i}`, worker_id, amount, month: prefix, date: `${prefix}-04`, notes, created_at: iso(now) })),
    deductions: [['w-021', 30, 'Late penalty']].map(([worker_id, amount, notes], i) => ({ id: `ded-${tag}-${i}`, worker_id, amount, month: prefix, date: `${prefix}-06`, notes, created_at: iso(now) })),
  });
  const prevLedger = priorLedger(previous.prefix, 'p1');
  const oldLedger = priorLedger(older.prefix, 'p2');
  salary_advances.push(...prevLedger.advances, ...oldLedger.advances);
  loans.push(...prevLedger.loans, ...oldLedger.loans);
  deductions.push(...prevLedger.deductions, ...oldLedger.deductions);

  // The month before last is already closed, so the demo shows a frozen month; last month is still open to close.
  const payrollWorkers = payrollWorkersFrom({ workers, portfolios, positions, sites });
  const olderLines = computePayroll({
    workers: payrollWorkers,
    attendance: attendance.filter((a) => a.date.startsWith(older.prefix)) as AttendanceDay[],
    advances: oldLedger.advances as unknown as LedgerAmount[], loans: oldLedger.loans as unknown as LedgerAmount[], deductions: oldLedger.deductions as unknown as LedgerAmount[],
  });
  const payroll_lines = olderLines.map((l) => lineToRow(older.prefix, l));
  const sum = (key: 'gross' | 'totalDeductions' | 'net') => Math.round(olderLines.reduce((t, l) => t + l[key] * 100, 0)) / 100;
  const payroll_periods = [{
    month: older.prefix, closed_at: new Date(now.getFullYear(), now.getMonth() - 1, 2, 10, 15).toISOString(), closed_by: DEMO_USER_IDS.finance,
    workers: olderLines.length, gross: sum('gross'), total_deductions: sum('totalDeductions'), net: sum('net'),
  }];

  const invoices = [
    ['store-1', 'inv-001', 7200, 120, 'Dangote Cement Ltd', 'purchase', 'INV-2026-0412', 18],
    ['store-1', 'inv-002', 3150, 40, 'Accra Steel Works', 'purchase', 'INV-2026-0419', 12],
    ['store-2', 'inv-006', 2600, 50, 'Kumasi Building Supplies', 'purchase', 'KBS-8841', 9],
    ['store-3', 'inv-010', 5400, 90, 'Tema Aggregates', 'purchase', 'TA-2207', 30],
    ['store-1', 'inv-005', 480, 6, 'Colour Centre', 'sale', 'S-0091', 5],
  ].map(([store_id, item_id, amount, quantity, supplier_name, type, invoice_number, hours], i) => ({
    id: uid('invc', i + 1), store_id, item_id, amount, quantity, supplier_name, type, invoice_number,
    created_by: DEMO_USER_IDS.store_manager, date: ago(Number(hours) * 8), created_at: ago(Number(hours) * 8),
  }));

  const audit_log = [
    { id: 1, hours: 70, by: 'hr', table: 'workers', row: 'w-005', action: 'UPDATE', oldD: { phone_number: '024 100 1155' }, newD: { phone_number: '024 100 9921' } },
    { id: 2, hours: 52, by: 'finance', table: 'salary_advances', row: 'adv-009', action: 'INSERT', oldD: null, newD: { worker_id: 'w-011', amount: 150, month } },
    { id: 3, hours: 30, by: 'system_manager', table: 'users', row: 'demo-supervisor2', action: 'UPDATE', oldD: { site_id: 'site-1' }, newD: { site_id: 'site-2' } },
    { id: 4, hours: 9, by: 'hr', table: 'portfolios', row: 'pf-5', action: 'UPDATE', oldD: { rate: 65 }, newD: { rate: 70 } },
  ].map((e) => ({
    id: e.id, changed_at: ago(e.hours), changed_by: DEMO_USER_IDS[e.by], table_name: e.table, row_id: e.row, action: e.action, old_data: e.oldD, new_data: e.newD,
  }));

  return {
    sectors, sites, portfolios, positions, stores, users, workers, attendance, inventory, goods_log,
    salary_advances, loans, deductions, worker_transfers, salary_schedules: [], invoices,
    payroll_periods, payroll_lines, payroll_reopens: [], audit_log,
    app_settings: [{ key: 'require_mfa', value: 'false', updated_at: iso(now) }],
  };
}
