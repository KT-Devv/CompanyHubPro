import fs from 'fs';
import path from 'path';

// Parse .env manually
const envPath = path.join(process.cwd(), '.env');
const env = fs.readFileSync(envPath, 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const supabaseKey = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

async function run() {
  console.log('Querying Supabase API directly...');

  // Get users (only works if RLS allows anon access, but here we can't assume anon can read users unless RLS is open)
  // Let's see if RLS for users is `true` for SELECT
  console.log('Fetching users...');
  const usersRes = await fetch(`${supabaseUrl}/rest/v1/users?role=eq.supervisor&select=*`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });
  
  if (!usersRes.ok) {
    console.error('Error fetching users:', await usersRes.text());
    return;
  }
  
  const users = await usersRes.json();
  console.log(`Found ${users.length} supervisor(s):`);
  
  for (const user of users) {
    console.log(`- ${user.username} (ID: ${user.id}), Site ID: ${user.site_id}`);
    
    if (user.site_id) {
       // Check site
       const siteRes = await fetch(`${supabaseUrl}/rest/v1/sites?id=eq.${user.site_id}&select=site_name`, {
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
       });
       const sites = await siteRes.json();
       console.log(`  Site Name: ${sites[0]?.site_name || 'NOT FOUND'}`);
       
       // Check workers
       const workerRes = await fetch(`${supabaseUrl}/rest/v1/workers?site_id=eq.${user.site_id}&select=id,name`, {
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
       });
       const workers = await workerRes.json();
       console.log(`  Workers at this site: ${workers.length}`);
    } else {
       console.log('  No site_id ASSIGNED to this supervisor!');
    }
  }
}

run().catch(console.error);
