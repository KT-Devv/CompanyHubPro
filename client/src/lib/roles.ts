export type UserRole =
  | 'ceo'
  | 'hr'
  | 'finance'
  | 'system_manager'
  | 'project_manager'
  | 'supervisor'
  | 'logistics_manager'
  | 'store_manager'
  | 'secretary';

export const ALL_ROLES: readonly UserRole[] = [
  'ceo',
  'hr',
  'finance',
  'system_manager',
  'project_manager',
  'supervisor',
  'logistics_manager',
  'store_manager',
  'secretary',
];

export const ROLE_LABEL: Record<UserRole, string> = {
  ceo: 'CEO',
  hr: 'HR Manager',
  finance: 'Finance Officer',
  system_manager: 'System Manager',
  project_manager: 'Project Manager',
  supervisor: 'Supervisor',
  logistics_manager: 'Logistics Manager',
  store_manager: 'Store Manager',
  secretary: 'Secretary',
};

export function isUserRole(role: string | null | undefined): role is UserRole {
  return !!role && (ALL_ROLES as readonly string[]).includes(role);
}

export function roleLabel(role: string | null | undefined): string {
  return isUserRole(role) ? ROLE_LABEL[role] : 'Unknown role';
}

// Which roles may open which page. The router, sidebar and dashboard all read
// from here so they can't drift apart. This only controls the UI; what a role
// can actually read or write is enforced by RLS in the database.
export const ROUTE_ROLES = {
  '/': ALL_ROLES,
  '/workers': ['ceo', 'hr', 'system_manager', 'project_manager'],
  '/attendance': ['supervisor', 'secretary', 'store_manager'],
  '/attendance/records': ['ceo', 'hr', 'project_manager', 'system_manager'],
  '/finance': ['ceo', 'hr', 'system_manager', 'finance'],
  '/insights': ['ceo', 'hr', 'finance', 'system_manager', 'project_manager', 'logistics_manager'],
  '/audit': ['ceo', 'system_manager', 'hr'],
  '/accounts': ['ceo', 'system_manager'],
  '/security': ALL_ROLES,
  '/logistics': ['ceo', 'hr', 'system_manager', 'project_manager', 'logistics_manager', 'store_manager'],
  '/transfers': ['ceo', 'hr', 'system_manager', 'project_manager'],
} as const satisfies Record<string, readonly UserRole[]>;

export type AppRoute = keyof typeof ROUTE_ROLES;

export function canAccess(role: string | null | undefined, path: AppRoute): boolean {
  return !!role && (ROUTE_ROLES[path] as readonly string[]).includes(role);
}

// Every recognised role lands on the dashboard; an unknown role has no portal.
export function homePathForRole(role: string | null | undefined): AppRoute | null {
  return isUserRole(role) ? '/' : null;
}

// Actions, separate from page access. These mirror the RLS write policies (the
// CEO is read-only in the UI even where the database would allow more), so the
// app never offers a button the database will reject.
export const CAN = {
  editWorkers: ['hr', 'system_manager'],
  transferWorkers: ['ceo', 'hr', 'system_manager'],
  addAdvanceOrLoan: ['hr', 'finance'],
  addDeduction: ['hr', 'finance', 'system_manager'],
  manageStock: ['system_manager', 'project_manager', 'logistics_manager', 'store_manager'],
  addInvoice: ['system_manager', 'project_manager', 'logistics_manager', 'store_manager'],
  closePayroll: ['ceo', 'hr', 'finance'],
  reopenPayroll: ['ceo'],
  manageAccounts: ['ceo', 'system_manager'],
  requireMfa: ['ceo'],
  markHalfDay: ['supervisor'],
  // Sections of the Insights page, matching who can read the underlying tables.
  viewPeopleInsights: ['ceo', 'hr', 'finance', 'system_manager', 'project_manager'],
  viewCostInsights: ['ceo', 'hr', 'finance', 'system_manager'],
  viewStockInsights: ['ceo', 'hr', 'finance', 'system_manager', 'project_manager', 'logistics_manager'],
} as const satisfies Record<string, readonly UserRole[]>;

export type Action = keyof typeof CAN;

export function can(role: string | null | undefined, action: Action): boolean {
  return !!role && (CAN[action] as readonly string[]).includes(role);
}

// Roles that must use two-step sign-in once the CEO switches it on (mirrors mfa_ok() in the database).
export const MFA_ROLES: readonly UserRole[] = ['ceo', 'hr', 'finance', 'system_manager'];

// Bookmarks and links from the previous version of the app.
export const LEGACY_REDIRECTS: Record<string, AppRoute> = {
  '/welcome-management': '/',
  '/welcome-secretary': '/',
  '/welcome-supervisor': '/',
  '/workers-management': '/workers',
  '/attendance-management': '/attendance/records',
  '/salaries-management': '/finance',
  '/store-logistics': '/logistics',
  '/system-management': '/transfers',
  '/worker-transfer': '/transfers',
};
