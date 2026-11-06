export class SerializedProjectWriteQueue {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(projectKey: string, operation: () => Promise<T> | T): Promise<T> {
    const previous = this.tails.get(projectKey) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => current);
    this.tails.set(projectKey, tail);

    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.tails.get(projectKey) === tail) this.tails.delete(projectKey);
    }
  }
}
