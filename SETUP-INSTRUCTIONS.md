# Setup Instructions for Company Management System

## Prerequisites
- A Supabase account (sign up at https://supabase.com)
- A Supabase project created

## Step 1: Set Up Supabase Database

1. Go to your Supabase project dashboard
2. Navigate to the **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy the entire contents of `supabase-setup.sql`
5. Paste it into the SQL Editor
6. Click **Run** to execute the SQL script

This will create:
- All database tables (sites, workers, attendance, stores, inventory, etc.)
- Row Level Security (RLS) policies for role-based access
- Indexes for query performance
- Sample data for sites, portfolios, positions, and stores

## Step 2: Create User Accounts

Since this app uses Supabase Auth, you need to create users through the Supabase dashboard:

### Method 1: Via Supabase Dashboard (Recommended for initial setup)

1. Go to **Authentication** → **Users** in your Supabase dashboard
2. Click **Add User**
3. Enter email and password
4. Click **Create User**
5. Copy the user's UUID from the users list

### Method 2: Via SQL (After creating auth user)

After creating a user via the dashboard, you need to add their profile data:

```sql
-- Replace the UUID with the actual ID from auth.users table
-- IMPORTANT: Do NOT store passwords in this table - they're managed by Supabase Auth
INSERT INTO users (id, email, full_name, role, site_id)
VALUES (
  'paste-user-uuid-here',
  'owner@company.com',
  'Company Owner',
  'owner',
  NULL  -- NULL for owner/hr/pm, specific site UUID for supervisors
);
```

### Sample Users to Create

Create these test users with different roles:

1. **Owner Account**
   - Email: `owner@company.com`
   - Password: `password123`
   - Role: `owner`
   - Site: NULL

2. **Supervisor Account**
   - Email: `supervisor@company.com`
   - Password: `password123`
   - Role: `supervisor`
   - Site: (Get site UUID from sites table for "Construction Site A")

3. **Secretary Account**
   - Email: `secretary@company.com`
   - Password: `password123`
   - Role: `secretary`
   - Site: NULL

4. **HR Account**
   - Email: `hr@company.com`
   - Password: `password123`
   - Role: `hr`
   - Site: NULL

## Step 3: Add Sample Workers (Optional)

To test the attendance system, add some sample workers:

```sql
-- Get site IDs first
SELECT id, site_name FROM sites;

-- Get portfolio IDs
SELECT id, portfolio_name FROM portfolios;

-- Get position IDs
SELECT id, position_name FROM positions;

-- Add sample grounds workers
INSERT INTO workers (name, dob, worker_type, site_id, portfolio_id, date_of_employment, phone_number, national_id, contact_person, cp_phone, cp_relation)
VALUES
  ('John Doe', '1990-05-15', 'grounds', 'site-a-uuid', 'mason-portfolio-uuid', '2022-01-10', '0241234567', 'GHA-123456-7', 'Jane Doe', '0241234568', 'Spouse'),
  ('Peter Smith', '1988-08-20', 'grounds', 'site-a-uuid', 'carpenter-portfolio-uuid', '2021-06-15', '0242345678', 'GHA-234567-8', 'Mary Smith', '0242345679', 'Spouse');

-- Add sample office workers
INSERT INTO workers (name, dob, worker_type, site_id, position_id, date_of_employment, phone_number, national_id, contact_person, cp_phone, cp_relation)
VALUES
  ('Sarah Johnson', '1992-03-25', 'office', 'main-office-uuid', 'accountant-position-uuid', '2020-09-01', '0243456789', 'GHA-345678-9', 'Michael Johnson', '0243456790', 'Spouse'),
  ('Emily Brown', '1995-11-30', 'office', 'main-office-uuid', 'secretary-position-uuid', '2023-02-14', '0244567890', 'GHA-456789-0', 'David Brown', '0244567891', 'Spouse');
```

## Step 4: Configure Environment Variables

Your Replit Secrets should already have these configured:
- `VITE_SUPABASE_URL`: Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anonymous/public key

These are automatically used by the application.

## Step 5: Test the Application

1. Run the application (it should start automatically)
2. Navigate to the login page
3. Try logging in with different user accounts to test role-based access:
   - **Owner/HR/PM**: Should see both Attendance and Logistics modules
   - **Supervisor**: Should only see Attendance page with workers from their assigned site
   - **Secretary**: Should only see Attendance page with office workers

## Step 6: Verify RLS Policies

The application uses Row Level Security to ensure users can only access data they're authorized to see. You can verify this by:

1. Logging in as a supervisor and checking you only see workers from your site
2. Logging in as a secretary and confirming you only see office workers
3. Logging in as management and verifying full access to all modules

## Troubleshooting

### "Missing Supabase environment variables" Error
- Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in Replit Secrets
- Restart the application after adding secrets

### "Failed to log in" Error
- Verify the user exists in Supabase Auth → Users
- Ensure the user has a corresponding entry in the `users` table
- Check the password is correct

### "No workers found" Error
- Verify workers are added to the database
- Check that the logged-in user's role and site_id match the RLS policies
- For supervisors, ensure their site_id matches workers' site_id

### RLS Policy Issues
- Make sure you ran the complete SQL setup script
- Verify policies exist: `SELECT * FROM pg_policies WHERE tablename IN ('users', 'workers', 'attendance', 'stores', 'inventory');`
- Check user role: `SELECT role, site_id FROM users WHERE id = auth.uid();`

## Database Maintenance

### View All Tables
```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public';
```

### Check User Roles
```sql
SELECT u.email, u.full_name, u.role, s.site_name 
FROM users u 
LEFT JOIN sites s ON u.site_id = s.id;
```

### View Attendance Summary
```sql
SELECT 
  w.name,
  s.site_name,
  a.date,
  a.status,
  a.timestamp
FROM attendance a
JOIN workers w ON a.worker_id = w.id
JOIN sites s ON a.site_id = s.id
ORDER BY a.date DESC, a.timestamp DESC;
```

### Check Inventory Levels
```sql
SELECT 
  i.item_name,
  s.name as store_name,
  i.quantity,
  i.last_updated
FROM inventory i
JOIN stores s ON i.store_id = s.id
ORDER BY s.name, i.item_name;
```
