# SiteTrack

## Overview
A comprehensive construction company management system built with React, TypeScript, and Supabase. SiteTrack provides role-based dashboards for managing attendance tracking across multiple construction sites and logistics management for inventory across three stores (Sunyani, Berekum, Techiman).

## Purpose
This application serves a construction company with both grounds workers and office workers across multiple sites and stores. It streamlines daily operations including:
- Site-based attendance tracking with automatic timestamps
- Office staff attendance management
- Multi-store inventory management
- Goods transfer logging between stores
- Invoice tracking for purchases and sales

## User Roles and Access Control

### Supervisor
- Access: Attendance marking page only
- Permissions: Can view and mark attendance for grounds workers at their assigned site
- Dashboard: Simplified attendance marking interface filtered to their specific site

### Secretary
- Access: Office attendance dashboard
- Permissions: Can view and mark attendance for office workers
- Dashboard: Streamlined attendance marking for office staff

### HR / Owner / Project Manager
- Access: Full system access (Attendance + Logistics modules)
- Permissions: 
  - View all attendance records across all sites and worker types
  - Filter and export attendance data
  - Manage logistics including inventory, goods transfers, and invoices
- Dashboard: Comprehensive view with tabs for Attendance and Logistics

## Features

### Attendance Module
- Unified attendance table for all workers (office and grounds)
- Automatic timestamp generation when marking attendance
- Three status options: Present, Absent, Leave
- Date-based filtering
- Site-based filtering for management roles
- Worker type filtering (office/grounds)
- Search functionality for workers
- Quick actions: "Mark All Present"
- Real-time stats display (total, present, absent, on leave)
- Prevention of duplicate attendance marking for the same date

### Logistics Module
#### Inventory Management
- Track inventory levels across three stores
- Real-time stock quantity display
- Low stock alerts (items with quantity < 10)
- Search and filter by store
- Add new inventory items with store assignment

#### Goods Movement Log
- Record goods sent between stores
- Record goods received at stores
- Timeline-style display with direction indicators
- Quantity tracking
- Automatic timestamp logging

#### Invoice Management
- Track purchase and sale invoices
- Store-specific invoice recording
- Supplier/customer name tracking
- Amount tracking with formatted display
- Type classification (purchase/sale)
- Date-based sorting

## Technical Architecture

### Frontend
- **Framework**: React with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query (React Query) v5 for server state
- **UI Components**: Shadcn UI with Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens
- **Forms**: React Hook Form with Zod validation
- **Date Handling**: date-fns
- **Notifications**: Sonner for toast notifications

### Backend
- **Platform**: Supabase (Backend-as-a-Service)
- **Database**: PostgreSQL (via Supabase)
- **Authentication**: Supabase Auth
- **Real-time**: Supabase real-time subscriptions
- **Row Level Security**: Enabled for role-based data access

### Database Schema

#### Users
- Authentication and role management
- Fields: id, email, password, full_name, role, site_id (for supervisors)

#### Workers
- Employee records
- Fields: id, name, dob, worker_type, site_id, portfolio_id, position_id, date_of_employment, phone_number, national_id, contact_person, cp_phone, cp_relation

#### Sites
- Construction site management
- Fields: id, site_name, is_main

#### Portfolios
- Job categories for grounds workers
- Fields: id, portfolio_name, ratio

#### Positions
- Job positions for office workers
- Fields: id, position_name

#### Stores
- Store locations (Sunyani, Berekum, Techiman)
- Fields: id, name, location

#### Inventory
- Stock tracking per store
- Fields: id, store_id, item_name, quantity, last_updated

#### Goods Log
- Transfer tracking between stores
- Fields: id, item_id, store_from, store_to, quantity, type, date

#### Invoices
- Purchase and sale tracking
- Fields: id, store_id, item_id, amount, supplier_name, type, date

#### Attendance
- Daily attendance records
- Fields: id, worker_id, site_id, date, timestamp, status, marked_by, worker_type

## Design System
The application follows a professional dashboard design system inspired by Linear with Material Design patterns:

- **Colors**: Professional blue primary with semantic color tokens
- **Typography**: Inter font family with clear hierarchy
- **Layout**: Sidebar navigation (240px) with responsive main content area
- **Spacing**: Consistent 4/6/8 spacing scale
- **Components**: Shadcn UI components with custom theming
- **Interactions**: Subtle hover states and smooth transitions
- **Accessibility**: WCAG compliant with proper focus states and ARIA labels

## Environment Variables
- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Supabase anonymous/public key
- `SESSION_SECRET`: Express session secret (for backend if needed)

## Development Workflow
1. The app uses Vite for development with hot module replacement
2. Express server serves both frontend and backend on the same port
3. Supabase handles all data persistence and authentication
4. Role-based routing automatically redirects users to appropriate dashboards

## Future Enhancements
- CSV/PDF export functionality for attendance and logistics reports
- Advanced analytics dashboard with trends and insights
- Payroll calculation module based on attendance and position ratios
- Worker profile management with document uploads
- Multi-site comparison reports
- Mobile-responsive optimizations for field use
- Offline support for attendance marking in remote sites
