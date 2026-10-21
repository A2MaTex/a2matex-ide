import fs from 'node:fs/promises';
import path from 'node:path';

import { safeStorage } from 'electron';
import { z } from 'zod';

import type {
  AuthScope,
  RefreshTokenVault,
  SessionPersistence,
  StoredRefreshCredential,
} from '../../../../src/application/auth/auth-session.js';

const storedCredentialSchema = z.object({
  schemaVersion: z.literal(1),
  server: z.string().min(1),
  account: z.string().min(1),
  encryptedRefreshToken: z.string().min(1),
});

export class SecureRefreshTokenVault implements RefreshTokenVault {
  private readonly credentialPath: string;

  constructor(userDataPath: string) {
    this.credentialPath = path.join(userDataPath, 'credentials', 'auth-session.json');
  }

  async read(): Promise<StoredRefreshCredential | null> {
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      const source = await fs.readFile(this.credentialPath, 'utf8');
      const parsed = storedCredentialSchema.safeParse(JSON.parse(source));
      if (!parsed.success) return null;
      const refreshToken = safeStorage.decryptString(
        Buffer.from(parsed.data.encryptedRefreshToken, 'base64'),
      );
      if (!refreshToken) return null;
      return {
        scope: { server: parsed.data.server, account: parsed.data.account },
        refreshToken,
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return null;
      return null;
    }
  }

  async replace(scope: AuthScope, refreshToken: string): Promise<SessionPersistence> {
    if (!safeStorage.isEncryptionAvailable()) {
      await this.clear();
      return 'session-only';
    }

    const directory = path.dirname(this.credentialPath);
    const temporaryPath = `${this.credentialPath}.tmp`;
    const payload = {
      schemaVersion: 1,
      server: scope.server,
      account: scope.account,
      encryptedRefreshToken: safeStorage.encryptString(refreshToken).toString('base64'),
    } as const;

    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.writeFile(temporaryPath, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporaryPath, this.credentialPath);
    return 'secure';
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.credentialPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
