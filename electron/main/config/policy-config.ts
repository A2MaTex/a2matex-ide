import path from 'node:path';

import { parseEnvFile } from '@electron/main/config/api-config';

export interface CurrentPolicyVersions {
  terms: string;
  privacy: string;
}

export function loadPolicyVersions(appPath: string, environment = process.env) {
  const fileValues = parseEnvFile(path.join(appPath, '.env'));
  return {
    terms: (environment.VITE_TERMS_VERSION ?? fileValues.VITE_TERMS_VERSION ?? '').trim(),
    privacy: (environment.VITE_PRIVACY_VERSION ?? fileValues.VITE_PRIVACY_VERSION ?? '').trim(),
  } satisfies CurrentPolicyVersions;
}
