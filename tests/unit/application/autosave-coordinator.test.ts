import { afterEach, describe, expect, it, vi } from 'vitest';

import { AutosaveCoordinator } from '@application/project/autosave-coordinator';

afterEach(() => vi.useRealTimers());

describe('AutosaveCoordinator', () => {
  it('debounces changes and resets the delay after each semantic edit', async () => {
    vi.useFakeTimers();
    const task = vi.fn(() => Promise.resolve());
    const autosave = new AutosaveCoordinator(task);

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(2_000);
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(2_999);
    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledOnce();
  });

  it('uses maxWait to persist continuous edits', async () => {
    vi.useFakeTimers();
    const task = vi.fn(() => Promise.resolve());
    const autosave = new AutosaveCoordinator(task);

    autosave.schedule();
    for (let index = 0; index < 14; index += 1) {
      await vi.advanceTimersByTimeAsync(2_000);
      autosave.schedule();
    }
    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(task).toHaveBeenCalledOnce();
  });

  it('flushes immediately and preserves failed work for an explicit retry', async () => {
    const task = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('disk unavailable'))
      .mockResolvedValue();
    const autosave = new AutosaveCoordinator(task);

    autosave.schedule();
    await expect(autosave.flush()).rejects.toThrow('disk unavailable');
    expect(autosave.hasPendingWork()).toBe(true);
    await expect(autosave.flush()).resolves.toBeUndefined();
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('serializes a new save requested while a write is in flight', async () => {
    vi.useFakeTimers();
    let finishFirst!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const task = vi.fn<() => Promise<void>>().mockReturnValueOnce(firstWrite).mockResolvedValue();
    const autosave = new AutosaveCoordinator(task);

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(task).toHaveBeenCalledOnce();
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(task).toHaveBeenCalledOnce();

    finishFirst();
    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(task).toHaveBeenCalledTimes(2);
  });
});
