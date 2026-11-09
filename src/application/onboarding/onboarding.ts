export type AdbSetupStatus =
  'not-checked' | 'available' | 'no-device' | 'permission-issue' | 'not-found' | 'error';

export interface WorkspaceChoice {
  capability: string;
  label: string;
}

export interface OnboardingSnapshot {
  completed: boolean;
  completedAt: string | null;
  acceptedTermsVersion: string | null;
  acceptedPrivacyVersion: string | null;
  analyticsOptIn: boolean | null;
  workspaceLabel: string | null;
  adbStatus: AdbSetupStatus;
}

export interface CompleteOnboardingInput {
  acceptedTermsVersion: string;
  acceptedPrivacyVersion: string;
  analyticsOptIn: boolean;
  workspaceCapability: string | null;
  adbStatus: AdbSetupStatus;
}

export type OnboardingErrorCode =
  | 'ONBOARDING_CONFIGURATION_INVALID'
  | 'ONBOARDING_POLICY_UNAVAILABLE'
  | 'ONBOARDING_INPUT_INVALID'
  | 'ONBOARDING_STATE_INVALID'
  | 'ONBOARDING_WRITE_FAILED'
  | 'ONBOARDING_WORKSPACE_INVALID';
