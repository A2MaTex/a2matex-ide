export interface AutosaveScheduler {
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
}

export interface AutosaveCoordinatorOptions {
  debounceMs?: number;
  maxWaitMs?: number;
  scheduler?: AutosaveScheduler;
}

const defaultScheduler: AutosaveScheduler = {
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
};

export class AutosaveCoordinator {
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly scheduler: AutosaveScheduler;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private pending = false;
  private runAfterFlight = false;
  private readonly task: () => Promise<void>;

  constructor(task: () => Promise<void>, options: AutosaveCoordinatorOptions = {}) {
    this.task = task;
    this.debounceMs = options.debounceMs ?? 3_000;
    this.maxWaitMs = options.maxWaitMs ?? 30_000;
    this.scheduler = options.scheduler ?? defaultScheduler;
  }

  schedule() {
    this.pending = true;
    this.clearDebounceTimer();
    this.debounceTimer = this.scheduler.setTimeout(() => {
      this.debounceTimer = null;
      this.trigger();
    }, this.debounceMs);
    this.maxWaitTimer ??= this.scheduler.setTimeout(() => {
      this.maxWaitTimer = null;
      this.trigger();
    }, this.maxWaitMs);
  }

  async flush() {
    this.clearTimers();
    while (this.inFlight || this.pending) {
      if (this.inFlight) await this.inFlight;
      else await this.start();
    }
  }

  cancel() {
    this.clearTimers();
    this.pending = false;
    this.runAfterFlight = false;
  }

  hasPendingWork() {
    return this.pending || this.inFlight !== null;
  }

  private trigger() {
    this.clearTimers();
    if (this.inFlight) {
      this.runAfterFlight = true;
      return;
    }
    void this.start().catch(() => undefined);
  }

  private start() {
    if (this.inFlight) return this.inFlight;
    if (!this.pending) return Promise.resolve();
    this.pending = false;

    const execution = Promise.resolve()
      .then(() => this.task())
      .catch((error: unknown) => {
        this.pending = true;
        throw error;
      })
      .finally(() => {
        if (this.inFlight === execution) this.inFlight = null;
        if (this.runAfterFlight) {
          this.runAfterFlight = false;
          if (this.pending) void this.start().catch(() => undefined);
        }
      });
    this.inFlight = execution;
    return execution;
  }

  private clearDebounceTimer() {
    if (this.debounceTimer === null) return;
    this.scheduler.clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
  }

  private clearTimers() {
    this.clearDebounceTimer();
    if (this.maxWaitTimer === null) return;
    this.scheduler.clearTimeout(this.maxWaitTimer);
    this.maxWaitTimer = null;
  }
}
