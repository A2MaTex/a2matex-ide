import { RuntimeError } from '@application/runtime/runtime.error';
import { runtimeExecutionEventSchema } from '@application/runtime/runtime.schema';
import type { RuntimeExecutionEvent } from '@application/runtime/runtime.types';

export const MAX_SSE_FRAME_BYTES = 32 * 1024;

interface SseFrame {
  data: string[];
  event?: string;
  id?: string;
  hasComment: boolean;
}

function emptyFrame(): SseFrame {
  return { data: [], hasComment: false };
}

function protocolError(message: string, cause?: unknown) {
  return new RuntimeError('RUNTIME_INVALID_RESPONSE', message, false, { cause });
}

export class RuntimeSseParser {
  private readonly decoder = new TextDecoder('utf-8', { fatal: true });
  private buffered = '';
  private frame = emptyFrame();
  private frameBytes = 0;

  constructor(
    private readonly callbacks: {
      onEvent(event: RuntimeExecutionEvent): void;
      onHeartbeat(): void;
    },
  ) {}

  push(chunk: Uint8Array) {
    let decoded: string;
    try {
      decoded = this.decoder.decode(chunk, { stream: true });
    } catch (error) {
      throw protocolError('The Runtime event stream contained invalid UTF-8.', error);
    }
    this.buffered += decoded;
    this.consumeLines(false);
    if (Buffer.byteLength(this.buffered, 'utf8') + this.frameBytes > MAX_SSE_FRAME_BYTES) {
      throw protocolError('The Runtime event stream frame exceeded its local limit.');
    }
  }

  finish() {
    try {
      this.buffered += this.decoder.decode();
    } catch (error) {
      throw protocolError('The Runtime event stream ended with invalid UTF-8.', error);
    }
    this.consumeLines(true);
    // A frame without the final blank line is deliberately not acknowledged.
  }

  private consumeLines(flush: boolean) {
    while (true) {
      const newline = this.buffered.indexOf('\n');
      if (newline < 0) break;
      const rawLine = this.buffered.slice(0, newline);
      this.buffered = this.buffered.slice(newline + 1);
      this.consumeLine(rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine);
    }
    if (flush && this.buffered.length > 0) {
      this.frameBytes += Buffer.byteLength(this.buffered, 'utf8');
      this.buffered = '';
    }
  }

  private consumeLine(line: string) {
    this.frameBytes += Buffer.byteLength(line, 'utf8') + 1;
    if (this.frameBytes > MAX_SSE_FRAME_BYTES) {
      throw protocolError('The Runtime event stream frame exceeded its local limit.');
    }
    if (line === '') {
      this.emitFrame();
      return;
    }
    if (line.startsWith(':')) {
      this.frame.hasComment = true;
      return;
    }
    const separator = line.indexOf(':');
    const field = separator < 0 ? line : line.slice(0, separator);
    let value = separator < 0 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'id') this.frame.id = value;
    else if (field === 'event') this.frame.event = value;
    else if (field === 'data') this.frame.data.push(value);
    // Unknown fields and server retry hints are intentionally ignored.
  }

  private emitFrame() {
    const frame = this.frame;
    this.frame = emptyFrame();
    this.frameBytes = 0;
    if (frame.data.length === 0 && !frame.id && !frame.event) {
      if (frame.hasComment) this.callbacks.onHeartbeat();
      return;
    }
    if (!frame.id || !frame.event || frame.data.length === 0) {
      throw protocolError('The Runtime event stream returned an incomplete SSE frame.');
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(frame.data.join('\n'));
    } catch (error) {
      throw protocolError('The Runtime event stream returned invalid event JSON.', error);
    }
    const parsed = runtimeExecutionEventSchema.safeParse(decoded);
    if (!parsed.success || parsed.data.cursor !== frame.id || parsed.data.type !== frame.event) {
      throw protocolError('The Runtime event stream returned an event outside the A6 contract.');
    }
    this.callbacks.onEvent(parsed.data);
  }
}

export function compareRuntimeCursors(left: string, right: string) {
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}
