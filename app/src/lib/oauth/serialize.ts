// In-process write serialization for the OAuth JSON stores. Both clients.ts and
// tokens.ts do read→modify→write on a whole file; two concurrent operations in
// the one server process could interleave and lose an update (observed as an
// e2e race: parallel registrations overwrote each other). All triggers run in
// this single long-running process — same argument as the staleness run-guard —
// so a module-level promise chain is a complete fix, no lock file needed.
const queues = new Map<string, Promise<unknown>>();

export function serialized<T>(queueName: string, fn: () => Promise<T>): Promise<T> {
  const tail = queues.get(queueName) ?? Promise.resolve();
  const next = tail.then(fn, fn);
  // Park a settled continuation so one failure never wedges the queue.
  queues.set(queueName, next.catch(() => undefined));
  return next;
}
