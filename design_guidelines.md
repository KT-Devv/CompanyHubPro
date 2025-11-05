# Design Guidelines: SiteTrack

## Design Approach: Professional Dashboard System

**System Choice:** Linear-inspired minimalist dashboard design with Material Design data display patterns
**Rationale:** This is a utility-focused productivity tool requiring maximum clarity, efficiency, and data-dense layouts. Clean, professional aesthetic suited for daily operational use across construction sites.

---

## Core Design Elements

### Typography

**Font Family:** 
- Primary: Inter (via Google Fonts CDN)
- Monospace: JetBrains Mono (for IDs, timestamps, numbers)

**Hierarchy:**
- Dashboard Headers: text-2xl font-semibold
- Section Titles: text-lg font-semibold
- Data Table Headers: text-sm font-medium uppercase tracking-wide
- Body Text: text-base font-normal
- Helper Text/Labels: text-sm
- Timestamps/Metadata: text-xs font-mono

### Layout System

**Spacing Primitives:** Use Tailwind units of 2, 4, 6, and 8 consistently
- Component padding: p-4 or p-6
- Section gaps: gap-6 or gap-8
- Page margins: p-6 lg:p-8
- Card spacing: space-y-4

**Grid System:**
- Dashboard layout: Sidebar (240px fixed) + Main content (flex-1)
- Data cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
- Stats/metrics: grid-cols-2 md:grid-cols-4 gap-4

---

## Component Library

### Navigation Structure

**Top Bar:**
- Height: h-16
- Contains: SiteTrack logo (left), current date/time (center), user profile dropdown (right)
- Fixed position with subtle bottom border
- User avatar with role badge, logout option

**Sidebar:**
- Width: w-60 (240px)
- Collapsible on mobile to overlay
- Role-based menu items with icons (from Heroicons)
- Active state: subtle background with accent left border (border-l-2)
- Section groupings: "Attendance", "Logistics", "Settings"

### Dashboard Cards

**Stats Cards:**
- Compact grid layout: p-6, rounded-lg border
- Structure: Label (text-sm), Large number (text-3xl font-bold), Trend indicator (optional)
- Quick metrics: Total workers present today, Pending invoices, Low inventory alerts

**Data Tables:**
- Zebra striping on rows (even rows with subtle background)
- Headers: sticky top position, font-medium uppercase text-xs
- Row height: py-3 for comfortable scanning
- Actions column (right-aligned): Icon buttons for edit/delete
- Pagination: Bottom-aligned with page numbers and prev/next
- Search/filter bar above table: flex justify-between items-center

### Forms & Data Entry

**Attendance Marking:**
- Worker list with checkboxes/radio buttons for status (Present/Absent/Leave)
- Quick-select buttons: "Mark All Present", "Mark Selected"
- Grouped by site (for supervisors) with collapsible sections
- Timestamp displayed prominently (auto-generated, read-only)
- Submit button: prominent, full-width or right-aligned

**Logistics Forms (Modals):**
- Modal overlay: backdrop blur
- Modal content: max-w-2xl centered, p-6
- Form fields: space-y-4
- Labels above inputs (text-sm font-medium)
- Input fields: p-3 rounded-md border focus:ring-2
- Dropdowns for store selection, item selection
- Date pickers for goods log entries
- Action buttons: Cancel (ghost) + Submit (primary) in flex justify-end gap-3

### Data Visualization

**Inventory Status:**
- Progress bars showing stock levels per store
- Color-coded warnings (implemented via border/background intensity, not specific colors)
- Item name + quantity displayed inline

**Goods Movement Logs:**
- Timeline-style display with arrow indicators (store_from → store_to)
- Date grouping with subtle dividers
- Compact card format showing: Item, Quantity, Direction, Date

### Role-Specific Views

**Supervisor Dashboard:**
- Clean focus: Single-purpose attendance marking interface
- Site name prominently displayed at top
- Worker list with large touch-friendly checkboxes
- Minimal distractions, streamlined workflow

**Secretary Dashboard:**
- Similar structure to supervisor but filtered to office workers
- Department grouping instead of site grouping

**HR/Owner/Project Manager Dashboard:**
- Tab navigation: "Attendance Overview" | "Logistics"
- Multi-filter controls: Date range picker, Site dropdown, Worker type toggle
- Export buttons (CSV/PDF) in top-right of data tables
- Summary metrics row at top of each section

---

## Interaction Patterns

**Navigation:**
- Sidebar items: smooth transitions, clear active states
- Breadcrumbs for deep navigation (Logistics > Inventory > Sunyani Store)
- Back buttons where contextually appropriate

**Data Actions:**
- Inline edit: Click row to expand/edit in place
- Bulk actions: Checkbox selection + action dropdown
- Confirmations: Toast notifications (Heroicons check/x icons + message)
- Loading states: Skeleton screens for tables, spinner for buttons

**Filtering & Search:**
- Search: Persistent search bar with icon (magnifying glass)
- Filters: Dropdown pills that show active filter count
- Clear all filters button when filters applied

---

## Accessibility & Consistency

- All form inputs with proper labels and aria-attributes
- Focus visible states on all interactive elements (ring-2 on focus)
- Keyboard navigation fully supported
- Sufficient contrast ratios throughout
- Consistent spacing and alignment across all role dashboards
- Touch targets minimum 44x44px for mobile use

---

## No Hero Images

This is a dashboard application with no marketing/landing pages. All screens are authenticated, functional views focused on data display and interaction. No decorative imagery needed.