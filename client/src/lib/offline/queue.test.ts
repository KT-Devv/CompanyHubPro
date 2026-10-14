import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { clearQueueForTests, enqueueMark, getQueue, loadQueue, markFailed, removeMark, retryMark } from './queue';

// In Node there is no IndexedDB, so the queue runs on its in-memory fallback:
// the same code paths the browser uses, minus the disk.
const mark = (workerId: string, date = '2026-10-14', markedBy = 'u1') => ({
  workerId, workerName: workerId.toUpperCase(), workerType: 'casual' as const, date, status: 'Present' as const, markedBy,
});

beforeEach(async () => {
  await loadQueue();
  await clearQueueForTests();
});

test('a mark is kept with the time it was made and starts pending', async () => {
  const before = Date.now();
  const m = await enqueueMark(mark('w1'));
  assert.equal(getQueue().length, 1);
  assert.equal(m.state, 'pending');
  assert.equal(m.key, 'w1|2026-10-14');
  assert.ok(Date.parse(m.queuedAt) >= before - 1000);
});

test('marking the same worker and day again replaces the entry instead of duplicating it', async () => {
  await enqueueMark(mark('w1'));
  await enqueueMark({ ...mark('w1'), status: 'Absent' });
  assert.equal(getQueue().length, 1);
  assert.equal(getQueue()[0].status, 'Absent');
});

test('the same worker on different days is two entries; the queue is ordered by when it was marked', async () => {
  await enqueueMark(mark('w2', '2026-10-13'));
  await new Promise((r) => setTimeout(r, 5));
  await enqueueMark(mark('w1', '2026-10-14'));
  assert.deepEqual(getQueue().map((m) => m.key), ['w2|2026-10-13', 'w1|2026-10-14']);
});

test('a refused mark stays visible with its reason, can be retried, and can be removed', async () => {
  const m = await enqueueMark(mark('w1'));
  await markFailed(m.key, 'That day is closed');
  assert.equal(getQueue()[0].state, 'failed');
  assert.equal(getQueue()[0].error, 'That day is closed');
  assert.equal(getQueue()[0].attempts, 1);
  await retryMark(m.key);
  assert.equal(getQueue()[0].state, 'pending');
  assert.equal(getQueue()[0].error, undefined);
  await removeMark(m.key);
  assert.equal(getQueue().length, 0);
});

test('removing or failing something that is not there does nothing', async () => {
  await removeMark('nope|2026-10-14');
  await markFailed('nope|2026-10-14', 'x');
  await retryMark('nope|2026-10-14');
  assert.equal(getQueue().length, 0);
});
