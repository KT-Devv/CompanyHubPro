import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  // First login as the supervisor (assuming username is string like supervisor@... or we can just fetch users)
  // Let's just bypass auth using service_role if available, or just query users table anonymously if RLS allows it.
  
  // Since we don't know the password, let's query the Database logic using the service_role key OR just check user profiles
  
  const { data: users, error: uErr } = await supabase.from('users').select('*').eq('role', 'supervisor');
  if (uErr) {
    console.log('Error fetching users:', uErr.message);
    return;
  }
  
  console.log('Supervisors found:', users?.length);
  if (users && users.length > 0) {
    console.log(users[0]);
    
    // Check if site_id matches any workers
    if (users[0].site_id) {
       const { data: workers, error: wErr } = await supabase.from('workers').select('*').eq('site_id', users[0].site_id);
       console.log(`Workers for site ${users[0].site_id}:`, workers?.length);
    } else {
       console.log('No site_id assigned to this supervisor.');
    }
  }
}

check();
