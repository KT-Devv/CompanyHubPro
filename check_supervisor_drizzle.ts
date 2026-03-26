import { db } from './server/db';
import { users, workers, sites } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function test() {
  console.log("Fetching supervisors...");
  const supervisors = await db.select().from(users).where(eq(users.role, 'supervisor'));
  console.log("Supervisors:", supervisors.map(s => ({ id: s.id, username: s.username, site_id: s.siteId })));

  if (supervisors.length > 0) {
    for (const sup of supervisors) {
      if (sup.siteId) {
        const site = await db.select().from(sites).where(eq(sites.id, sup.siteId));
        console.log(`Supervisor ${sup.username} belongs to site: ${site[0]?.siteName || 'Unknown'}`);
        
        const siteWorkers = await db.select().from(workers).where(eq(workers.siteId, sup.siteId));
        console.log(`Site ${site[0]?.siteName || 'Unknown'} has ${siteWorkers.length} workers.`);
      } else {
        console.log(`Supervisor ${sup.username} does NOT have a siteId!`);
      }
    }
  }

  // Also check if RLS on workers is blocking by simulating supabase request
  console.log("\nDone checking DB direct access.");
  process.exit(0);
}

test().catch(console.error);
