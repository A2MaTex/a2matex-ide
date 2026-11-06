import { describe, expect, it } from 'vitest';

import { SerializedProjectWriteQueue } from '@electron/main/persistence/serialized-project-write-queue';

describe('SerializedProjectWriteQueue', () => {
  it('serializes writes for the same project even when an earlier write fails', async () => {
    const queue = new SerializedProjectWriteQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });

    const first = queue.run('project-1', async () => {
      events.push('first:start');
      markFirstStarted();
      await firstGate;
      events.push('first:end');
      throw new Error('expected failure');
    });
    const second = queue.run('project-1', () => {
      events.push('second');
    });

    await firstStarted;
    expect(events).toEqual(['first:start']);
    releaseFirst();
    await expect(first).rejects.toThrow('expected failure');
    await second;
    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });
});
