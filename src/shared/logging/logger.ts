export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = Record<string, boolean | null | number | string | undefined>;

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  component: string;
  event: string;
  fields?: LogFields;
}

export type LogSink = (record: LogRecord) => void;

const consoleSink: LogSink = (record) => {
  const method = record.level === 'debug' ? 'debug' : record.level;
  console[method](JSON.stringify(record));
};

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export function createLogger(component: string, sink: LogSink = consoleSink): Logger {
  const write = (level: LogLevel, event: string, fields?: LogFields) => {
    sink({
      timestamp: new Date().toISOString(),
      level,
      component,
      event,
      ...(fields ? { fields } : {}),
    });
  };

  return {
    debug: (event, fields) => write('debug', event, fields),
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
  };
}
