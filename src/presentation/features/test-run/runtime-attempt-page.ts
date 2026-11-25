import type { RuntimeNodeAttempt } from '@application/runtime/runtime.types';

export function mergeRuntimeAttemptPage(
  current: RuntimeNodeAttempt[],
  incoming: RuntimeNodeAttempt[],
) {
  const savedById = new Map(current.map((attempt) => [attempt.id, attempt]));
  return incoming.map((attempt) => {
    const saved = savedById.get(attempt.id);
    return saved && saved.status !== 'RUNNING' && attempt.status === 'RUNNING' ? saved : attempt;
  });
}
