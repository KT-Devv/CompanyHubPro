// Sample data for demo mode (VITE_DEMO=true). Deterministic, so screenshots and
// tests are repeatable. Nothing in here is real.
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

  const users = [
    ['ceo', 'Efua Danquah', null, null],
    ['hr', 'Kojo Amankwah', null, null],
    ['finance', 'Abena Sarpong', null, null],
    ['system_manager', 'Kwesi Nyarko', null, null],
    ['project_manager', 'Yaa Frimpong', null, null],
    ['supervisor', 'Kofi Adjei', 'site-1', null],
    ['logistics_manager', 'Nana Ofori', null, null],
    ['store_manager', 'Esi Bonsu', null, 'store-1'],
    ['secretary', 'Afia Kyei', null, null],
  ].map(([role, full_name, site_id, store_id]) => ({
    id: DEMO_USER_IDS[role as string],
    email: `${role}@demo.local`,
    full_name,
    role,
    site_id,
    store_id,
    created_at: iso(now),
  }));

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
      account_location: null,
      account_number: null,
      created_at: iso(now),
    });
  }

  // ---- attendance: every past day this month for casual workers; ~65% of today
  const attendance: Row[] = [];
  const supervisorId = DEMO_USER_IDS.supervisor;
  const secretaryId = DEMO_USER_IDS.secretary;
  const dayOfMonth = now.getDate();
  let aid = 1;
  for (let d = 1; d < dayOfMonth; d++) {
    const date = `${month}-${pad(d)}`;
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

  return { sectors, sites, portfolios, positions, stores, users, workers, attendance, inventory, goods_log, salary_advances, loans, deductions, worker_transfers, salary_schedules: [], invoices: [] };
}
