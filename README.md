# SiteTrack

A comprehensive construction company management web application built with React, TypeScript, and Supabase. SiteTrack provides role-based dashboards for managing attendance tracking and logistics operations across multiple construction sites and stores.

![SiteTrack](https://img.shields.io/badge/Built%20with-React%20%2B%20Supabase-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)
![Tailwind CSS](https://img.shields.io/badge/Styled%20with-Tailwind%20CSS-38bdf8)

## 🌟 Features

### Multi-Role Authentication System
- **Owner/HR/Project Manager**: Full system access with attendance overview and logistics management
- **Supervisor**: Site-specific attendance marking for grounds workers
- **Secretary**: Office worker attendance management

### 📊 Attendance Management
- Real-time attendance tracking with automatic timestamps
- Three status options: Present, Absent, Leave
- Site-based filtering and search functionality
- Prevents duplicate attendance marking for the same date
- Quick actions: "Mark All Present" button
- Live statistics dashboard showing daily attendance metrics

### 📦 Logistics Management
- **Inventory Tracking**: Monitor stock levels across three stores (Sunyani, Berekum, Techiman)
- **Low Stock Alerts**: Automatic alerts for items with quantity below 10
- **Goods Movement Log**: Track items sent and received between stores
- **Invoice Management**: Record purchase and sale invoices with supplier tracking
- **Real-time Updates**: All changes reflect immediately across the system

## 🚀 Quick Start

### Prerequisites
- A Supabase account and project
- Replit Secrets configured with:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

### Initial Setup

1. **Set up the database**:
   - Open your Supabase project dashboard
   - Go to SQL Editor
   - Copy and run the contents of `supabase-setup.sql`

2. **Create user accounts**:
   - Follow the detailed instructions in `SETUP-INSTRUCTIONS.md`
   - Create at least one user for each role to test the system

3. **Start the application**:
   - The app is already running in Replit
   - Navigate to the preview URL
   - Log in with your created credentials

## 👥 User Roles and Permissions

### Supervisor
**Access**: Attendance Portal Only
- View workers assigned to their specific construction site
- Mark daily attendance for grounds workers
- See real-time attendance statistics for their site

### Secretary
**Access**: Office Attendance Dashboard
- View all office workers
- Mark daily attendance for office staff
- Track office attendance metrics

### HR / Owner / Project Manager
**Access**: Full System Access
- View all attendance records (grounds + office workers)
- Filter by site, date, worker type
- Access complete logistics module
- Manage inventory across all stores
- Track goods movements and invoices
- Export data (future feature)

## 📱 User Interface

### Design Highlights
- **Clean, professional dashboard** with sidebar navigation
- **Real-time clock** displayed in the header
- **Responsive design** that works on desktop, tablet, and mobile
- **Accessible components** with proper focus states and keyboard navigation
- **Intuitive data tables** with zebra striping and search functionality
- **Modal dialogs** for data entry with clear validation

### Color Scheme
- Professional blue primary color (#1d4ed8)
- Semantic color tokens for status indicators
- Dark mode ready (can be enabled)
- WCAG compliant contrast ratios

## 🗄️ Database Schema

### Core Tables
- **users**: Authentication and role management
- **workers**: Employee records with contact information
- **sites**: Construction site locations
- **portfolios**: Job categories for grounds workers
- **positions**: Job positions for office workers
- **attendance**: Daily attendance records with timestamps

### Logistics Tables
- **stores**: Store locations (Sunyani, Berekum, Techiman)
- **inventory**: Stock tracking per store
- **goods_log**: Transfer records between stores
- **invoices**: Purchase and sale invoices

## 🔒 Security

### Row Level Security (RLS)
All tables have RLS policies enforcing role-based access:
- Supervisors can only access workers and attendance from their assigned site
- Secretaries can only access office workers and their attendance
- Management has full access to all data
- Users can only view their own profile information

### Authentication
- Powered by Supabase Auth
- Secure password hashing
- Session management with automatic token refresh
- Protected routes with role-based redirects

## 🛠️ Technical Stack

### Frontend
- **React 18** with TypeScript
- **Wouter** for lightweight routing
- **TanStack Query v5** for server state management
- **Shadcn UI** + **Radix UI** for accessible components
- **Tailwind CSS** for styling
- **date-fns** for date formatting
- **Zod** for schema validation

### Backend
- **Supabase** (Backend-as-a-Service)
  - PostgreSQL database
  - Authentication
  - Row Level Security
  - Real-time subscriptions
  - Automatic timestamps

### Development
- **Vite** for fast development and building
- **Express** server for serving the app
- **Hot Module Replacement** (HMR) for instant updates

## 📖 Usage Guide

### Marking Attendance

1. **Log in** with your credentials
2. **Select the date** using the date picker in the header
3. **Search for workers** using the search bar (if needed)
4. **Mark status** for each worker: Present, Absent, or Leave
5. **Submit attendance** by clicking the submit button
6. View confirmation toast notification

**Tips**:
- Use "Mark All Present" for quick entry
- Workers already marked for the date are grayed out
- Attendance is timestamped automatically

### Managing Logistics

1. **Navigate to Logistics** from the sidebar (management only)
2. **View inventory** across all stores
3. **Add new items** using the "Add Item" button
4. **Log transfers** between stores with "Log Transfer"
5. **Record invoices** with "Add Invoice"
6. **Monitor low stock alerts** at the top of the page

### Viewing Reports

1. **Go to Attendance** → **View Records** tab
2. **Select date range** (future feature)
3. **Filter by site or worker type**
4. **Export data** as CSV or PDF (future feature)

## 📁 Project Structure

```
├── client/                 # Frontend application
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   │   ├── ui/       # Shadcn UI components
│   │   │   └── app-sidebar.tsx
│   │   ├── pages/        # Page components
│   │   │   ├── login.tsx
│   │   │   ├── attendance.tsx
│   │   │   └── logistics.tsx
│   │   ├── lib/          # Utilities and configs
│   │   │   ├── supabase.ts
│   │   │   ├── auth.tsx
│   │   │   └── queryClient.ts
│   │   └── App.tsx       # Main app component
│   └── index.html
├── shared/
│   └── schema.ts          # Shared TypeScript types
├── supabase-setup.sql     # Database setup script
├── SETUP-INSTRUCTIONS.md  # Detailed setup guide
└── design_guidelines.md   # UI/UX design system
```

## 🔄 Workflow

### Daily Attendance Workflow
1. Supervisor/Secretary logs in
2. System shows today's date by default
3. Worker list loads based on role and site
4. Mark attendance for each worker
5. Submit and receive confirmation
6. Repeat for different dates if needed

### Inventory Management Workflow
1. Management logs in
2. Navigate to Logistics module
3. Check inventory levels across stores
4. Respond to low stock alerts
5. Record goods transfers between stores
6. Log purchase/sale invoices
7. Monitor stock movements over time

## 🚧 Future Enhancements

### Phase 2 Features
- [ ] CSV and PDF export for reports
- [ ] Advanced analytics dashboard
- [ ] Date range filtering and comparisons
- [ ] Payroll calculation based on attendance
- [ ] Worker profile management with documents
- [ ] Multi-site comparison reports
- [ ] Email notifications for low stock
- [ ] Attendance trends and insights

### Phase 3 Features
- [ ] Mobile app for field attendance
- [ ] Offline support with sync
- [ ] Barcode scanning for inventory
- [ ] Supplier management module
- [ ] Purchase order workflow
- [ ] Equipment tracking

## 🐛 Troubleshooting

### Common Issues

**"Missing Supabase environment variables"**
- Ensure secrets are set in Replit
- Restart the application

**"Failed to log in"**
- Verify user exists in Supabase Auth
- Check password is correct
- Ensure user has entry in users table

**"No workers found"**
- Check workers are added to database
- Verify RLS policies are correct
- For supervisors, ensure site_id matches

**"Permission denied" errors**
- Review RLS policies in Supabase
- Verify user role is correct
- Check table permissions

See `SETUP-INSTRUCTIONS.md` for detailed troubleshooting steps.

## 📝 License

This project is built for a specific construction company. All rights reserved.

## 🤝 Support

For setup help or questions:
1. Review `SETUP-INSTRUCTIONS.md`
2. Check the troubleshooting section above
3. Verify Supabase configuration
4. Check browser console for errors

## 🎯 Credits

Built with modern web technologies:
- React + TypeScript for type-safe development
- Supabase for backend infrastructure
- Shadcn UI for beautiful, accessible components
- Tailwind CSS for rapid styling

---

**Note**: This is an MVP (Minimum Viable Product). Features are continuously being improved based on user feedback.
