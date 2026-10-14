export function logMain(
  level: 'info' | 'error',
  event: string,
  fields: Record<string, boolean | number | string> = {},
) {
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    component: 'electron.main',
    event,
    fields,
  });
  console[level](record);
}
