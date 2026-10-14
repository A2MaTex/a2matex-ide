import { describe, expect, it } from 'vitest';

import { createLogger, type LogRecord } from '@shared/logging/logger';

describe('createLogger', () => {
  it('emits a structured record with component and event fields', () => {
    const records: LogRecord[] = [];
    const logger = createLogger('test.component', (record) => records.push(record));

    logger.info('foundation_ready', { phase: 0 });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      level: 'info',
      component: 'test.component',
      event: 'foundation_ready',
      fields: { phase: 0 },
    });
    expect(Number.isNaN(Date.parse(records[0].timestamp))).toBe(false);
  });
});
