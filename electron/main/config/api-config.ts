import fs from 'node:fs';
import path from 'node:path';

import { AuthError } from '@application/auth/auth-session';

export interface ApiConfig {
  baseUrl: string;
  timeoutMs: number;
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};

  const values: Record<string, string> = {};
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function loadApiConfig(input: {
  appPath: string;
  isPackaged: boolean;
  environment?: NodeJS.ProcessEnv;
}): ApiConfig {
  const environment = input.environment ?? process.env;
  const fileValues = parseEnvFile(path.join(input.appPath, '.env'));
  const rawBaseUrl = environment.VITE_API_BASE_URL ?? fileValues.VITE_API_BASE_URL;

  if (!rawBaseUrl) {
    throw new AuthError('AUTH_CONFIGURATION_ERROR', 'VITE_API_BASE_URL is not configured.', false);
  }

  let url: URL;
  try {
    url = new URL(rawBaseUrl);
  } catch {
    throw new AuthError(
      'AUTH_CONFIGURATION_ERROR',
      'VITE_API_BASE_URL must be a valid URL.',
      false,
    );
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    (input.isPackaged && url.protocol !== 'https:')
  ) {
    throw new AuthError(
      'AUTH_CONFIGURATION_ERROR',
      input.isPackaged
        ? 'Production API connections require HTTPS.'
        : 'VITE_API_BASE_URL must use HTTP or HTTPS.',
      false,
    );
  }

  return { baseUrl: url.origin, timeoutMs: 10_000 };
}
