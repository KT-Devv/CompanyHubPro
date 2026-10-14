import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, ID, monthsAgo } from './harness.mjs';
import { computePayroll } from '../../client/src/lib/payroll.ts';

// Month close freezes what the database calculates; the Finance screen shows a
// live preview calculated in the browser. If those two ever disagree, a closed
// month would not match what finance saw. This runs both on the same random
// workers (including awkward half-pesewa roundings) and demands exact equality.

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('SQL and TypeScript payroll agree to the pesewa on 400 random workers', async () => {
  const db = await freshDb();
  const month = monthsAgo(1);
  const rand = rng(2026);
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

  const portfolios = Array.from({ length: 12 }, (_, i) => ({ id: `50000000-0000-0000-0000-0000000001${String(i).padStart(2, '0')}`, name: `P${i}`, rate: int(1, 400) }));
  const positions = Array.from({ length: 6 }, (_, i) => ({ id: `60000000-0000-0000-0000-0000000001${String(i).padStart(2, '0')}`, name: `Q${i}`, rate: int(500, 9000) }));
  for (const p of portfolios) await db.query(`INSERT INTO portfolios(id, portfolio_name, rate) VALUES ($1, $2, $3)`, [p.id, p.name, p.rate]);
  for (const p of positions) await db.query(`INSERT INTO positions(id, position_name, rate) VALUES ($1, $2, $3)`, [p.id, p.name, p.rate]);

  const workers = [], attendance = [], advances = [], loans = [], deductions = [];
  for (let i = 0; i < 400; i++) {
    const id = `70000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
    const office = rand() < 0.2;
    const portfolio = office ? null : portfolios[int(0, portfolios.length - 1)];
    const position = office ? positions[int(0, positions.length - 1)] : null;
    await db.query(
      `INSERT INTO workers(id, name, worker_type, portfolio_id, position_id) VALUES ($1, $2, $3, $4, $5)`,
      [id, `W${i}`, office ? 'non_marking' : 'casual', portfolio?.id ?? null, position?.id ?? null],
    );
    workers.push({
      id, name: `W${i}`, worker_type: office ? 'non_marking' : 'casual',
      portfolios: portfolio && { portfolio_name: portfolio.name, rate: portfolio.rate },
      positions: position && { position_name: position.name, rate: position.rate },
    });
    for (let d = 1; d <= 28; d++) {
      const r = rand();
      if (r < 0.55) continue;
      const status = r < 0.8 ? 'Present' : r < 0.9 ? 'Half Day' : r < 0.95 ? 'Absent' : 'Leave';
      await db.query(`INSERT INTO attendance(worker_id, date, status, marked_by, worker_type) VALUES ($1, $2, $3, $4, $5)`,
        [id, `${month}-${String(d).padStart(2, '0')}`, status, ID.sup, office ? 'non_marking' : 'casual']);
      attendance.push({ worker_id: id, status: status === 'Present' || status === 'Half Day' ? status : status });
    }
    for (const [table, list] of [['salary_advances', advances], ['loans', loans], ['deductions', deductions]]) {
      const n = rand() < 0.3 ? int(1, 3) : 0;
      for (let k = 0; k < n; k++) {
        const amount = int(1, 900);
        await db.query(`INSERT INTO ${table}(worker_id, amount, month, date) VALUES ($1, $2, $3, $4)`, [id, amount, month, `${month}-10`]);
        list.push({ worker_id: id, amount });
      }
    }
  }

  const ts = new Map(computePayroll({ workers, attendance, advances, loans, deductions }).map((l) => [l.workerId, l]));
  const sql = (await db.query(`SELECT * FROM payroll_compute($1) WHERE worker_id::text LIKE '70000000%'`, [month])).rows;
  assert.equal(sql.length, 400);

  let overdrawn = 0, halfCents = 0;
  for (const r of sql) {
    const t = ts.get(r.worker_id);
    const where = `${r.worker_name} (rate ${r.rate}, ${r.days_present} days)`;
    assert.equal(Number(r.days_present), t.daysPresent, `days: ${where}`);
    for (const [col, key] of [['gross', 'gross'], ['ssnit', 'ssnit'], ['tax', 'tax'], ['advances', 'advances'], ['loans', 'loans'],
      ['other_deductions', 'otherDeductions'], ['total_deductions', 'totalDeductions'], ['net', 'net']]) {
      assert.equal(Number(r[col]), t[key], `${col}: ${where}`);
    }
    assert.equal(r.overdrawn, t.overdrawn, `overdrawn: ${where}`);
    assert.equal(r.fixed, t.fixed);
    if (r.overdrawn) overdrawn++;
    if (Math.abs(Number(r.gross) * 0.055 * 1000 % 10 - 5) < 1e-6) halfCents++;
  }
  assert.ok(overdrawn > 0, 'the sample should include overdrawn workers');
  assert.ok(halfCents > 0, 'the sample should include exact half-pesewa roundings');
});
