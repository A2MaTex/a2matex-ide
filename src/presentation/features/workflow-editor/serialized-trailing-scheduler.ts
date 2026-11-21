export interface SchedulerClock {
  clearTimeout(timer: ReturnType<typeof globalThis.setTimeout>): void;
  now(): number;
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof globalThis.setTimeout>;
}

interface SerializedTrailingSchedulerOptions<T> {
  clock?: SchedulerClock;
  delayMs: number;
  execute(task: T): Promise<void>;
}

interface PendingTask<T> {
  editedAt: number;
  task: T;
}

const systemClock: SchedulerClock = {
  clearTimeout: (timer) => globalThis.clearTimeout(timer),
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
};

export class SerializedTrailingScheduler<T> {
  private readonly clock: SchedulerClock;
  private readonly delayMs: number;
  private execute: (task: T) => Promise<void>;
  private inFlight = false;
  private lastSettledAt: number | null = null;
  private pending: PendingTask<T> | null = null;
  private suspended = false;
  private timer: ReturnType<typeof globalThis.setTimeout> | null = null;

  constructor(options: SerializedTrailingSchedulerOptions<T>) {
    this.clock = options.clock ?? systemClock;
    this.delayMs = options.delayMs;
    this.execute = options.execute;
  }

  enqueue(task: T) {
    if (this.suspended) return false;
    this.pending = { editedAt: this.clock.now(), task };
    this.arm();
    return true;
  }

  setExecutor(execute: (task: T) => Promise<void>) {
    this.execute = execute;
  }

  beginImmediate() {
    if (this.inFlight) return false;
    this.clearTimer();
    this.pending = null;
    this.inFlight = true;
    return true;
  }

  settleImmediate() {
    if (!this.inFlight) return;
    this.settle();
  }

  reset() {
    this.clearTimer();
    this.pending = null;
  }

  resume() {
    this.suspended = false;
    this.arm();
  }

  suspend() {
    this.suspended = true;
    this.reset();
  }

  private arm() {
    this.clearTimer();
    if (this.suspended || this.inFlight || !this.pending) return;
    const editEligibleAt = this.pending.editedAt + this.delayMs;
    const settleEligibleAt =
      this.lastSettledAt === null ? editEligibleAt : this.lastSettledAt + this.delayMs;
    const eligibleAt = Math.max(editEligibleAt, settleEligibleAt);
    this.timer = this.clock.setTimeout(
      () => {
        this.timer = null;
        this.startPending();
      },
      Math.max(0, eligibleAt - this.clock.now()),
    );
  }

  private clearTimer() {
    if (this.timer === null) return;
    this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  private startPending() {
    if (this.suspended || this.inFlight || !this.pending) {
      this.arm();
      return;
    }
    const pending = this.pending;
    this.pending = null;
    this.inFlight = true;
    void Promise.resolve()
      .then(() => this.execute(pending.task))
      .catch(() => undefined)
      .finally(() => this.settle());
  }

  private settle() {
    this.lastSettledAt = this.clock.now();
    this.inFlight = false;
    this.arm();
  }
}
