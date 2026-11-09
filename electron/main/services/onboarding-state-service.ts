import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import type {
  CompleteOnboardingInput,
  OnboardingErrorCode,
  OnboardingSnapshot,
} from '@application/onboarding/onboarding';
import { parseStoredJson, serializeJson } from '@electron/main/persistence/json-storage';

const adbStatusSchema = z.enum([
  'not-checked',
  'available',
  'no-device',
  'permission-issue',
  'not-found',
  'error',
]);

const storedStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    completed: z.boolean(),
    acceptedTermsVersion: z.string().min(1).nullable(),
    acceptedPrivacyVersion: z.string().min(1).nullable(),
    analyticsOptIn: z.boolean().nullable(),
    completedAt: z.string().datetime().nullable(),
    projectRoot: z.string().min(1).nullable(),
    adbStatus: adbStatusSchema,
  })
  .strict();

const completeInputSchema = z
  .object({
    acceptedTermsVersion: z.string().min(1).max(100),
    acceptedPrivacyVersion: z.string().min(1).max(100),
    analyticsOptIn: z.boolean(),
    workspaceCapability: z.string().uuid().nullable(),
    adbStatus: adbStatusSchema,
  })
  .strict();

type StoredState = z.infer<typeof storedStateSchema>;

const emptyState: StoredState = {
  schemaVersion: 1,
  completed: false,
  acceptedTermsVersion: null,
  acceptedPrivacyVersion: null,
  analyticsOptIn: null,
  completedAt: null,
  projectRoot: null,
  adbStatus: 'not-checked',
};

export class OnboardingError extends Error {
  constructor(
    readonly code: OnboardingErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'OnboardingError';
  }
}

export class OnboardingStateService {
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'config', 'onboarding.json');
  }

  async getState(): Promise<OnboardingSnapshot> {
    let state = emptyState;
    try {
      state = storedStateSchema.parse(parseStoredJson(await readFile(this.filePath, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new OnboardingError('ONBOARDING_STATE_INVALID', 'Onboarding state is invalid.');
      }
    }
    return this.snapshot(state);
  }

  async complete(
    rawInput: unknown,
    projectRoot: string | null,
    policies: { terms: string; privacy: string },
  ): Promise<OnboardingSnapshot> {
    const parsed = completeInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new OnboardingError('ONBOARDING_INPUT_INVALID', 'Onboarding choices are invalid.');
    }
    const input: CompleteOnboardingInput = parsed.data;
    if (!policies.terms || !policies.privacy) {
      throw new OnboardingError(
        'ONBOARDING_CONFIGURATION_INVALID',
        'Policy versions are not configured.',
      );
    }
    if (
      input.acceptedTermsVersion !== policies.terms ||
      input.acceptedPrivacyVersion !== policies.privacy
    ) {
      throw new OnboardingError(
        'ONBOARDING_INPUT_INVALID',
        'The accepted policy version is no longer current.',
      );
    }

    const state: StoredState = {
      schemaVersion: 1,
      completed: true,
      acceptedTermsVersion: input.acceptedTermsVersion,
      acceptedPrivacyVersion: input.acceptedPrivacyVersion,
      analyticsOptIn: input.analyticsOptIn,
      completedAt: new Date().toISOString(),
      projectRoot,
      adbStatus: input.adbStatus,
    };
    await this.write(state);
    return this.snapshot(state);
  }

  private snapshot(state: StoredState): OnboardingSnapshot {
    return {
      completed: state.completed,
      completedAt: state.completedAt,
      acceptedTermsVersion: state.acceptedTermsVersion,
      acceptedPrivacyVersion: state.acceptedPrivacyVersion,
      analyticsOptIn: state.analyticsOptIn,
      workspaceLabel: state.projectRoot,
      adbStatus: state.adbStatus,
    };
  }

  private async write(state: StoredState) {
    const directory = path.dirname(this.filePath);
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const handle = await open(temporaryPath, 'wx', 0o600);
      try {
        await handle.writeFile(serializeJson(state), 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporaryPath, this.filePath);
    } catch {
      throw new OnboardingError(
        'ONBOARDING_WRITE_FAILED',
        'Onboarding settings could not be saved.',
        true,
      );
    }
  }
}
