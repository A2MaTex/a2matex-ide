import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { AdbSetupStatus, WorkspaceChoice } from '@application/onboarding/onboarding';
import {
  createPolicyManifest,
  type PolicyDocument,
  type PolicyManifest,
} from '@application/onboarding/policy-manifest';
import URL from '@app/constants/url';
import { FinishStep } from '@presentation/features/onboarding/FinishStep';
import { OnboardingShell } from '@presentation/features/onboarding/OnboardingShell';
import { OptionalSetupStep } from '@presentation/features/onboarding/OptionalSetupStep';
import { PoliciesStep, type PolicyChoices } from '@presentation/features/onboarding/PoliciesStep';
import { PolicyDialog } from '@presentation/features/onboarding/PolicyDialog';
import { WelcomeStep } from '@presentation/features/onboarding/WelcomeStep';
import { WorkspaceStep } from '@presentation/features/onboarding/WorkspaceStep';
import { useHostStatus } from '@presentation/features/host-status/use-host-status';
import { toast } from '@presentation/components/ui/toast-store';

interface OnboardingPageProps {
  manifest?: PolicyManifest;
}

const initialChoices: PolicyChoices = {
  accepted: { terms: false, privacy: false },
  analyticsOptIn: false,
};

function bundledPolicyManifest() {
  return createPolicyManifest({
    VITE_TERMS_VERSION: import.meta.env.VITE_TERMS_VERSION,
    VITE_TERMS_URL: import.meta.env.VITE_TERMS_URL,
    VITE_PRIVACY_VERSION: import.meta.env.VITE_PRIVACY_VERSION,
    VITE_PRIVACY_URL: import.meta.env.VITE_PRIVACY_URL,
  });
}

export function OnboardingPage({ manifest: suppliedManifest }: OnboardingPageProps) {
  const navigate = useNavigate();
  const { info } = useHostStatus();
  const [manifest, setManifest] = useState(suppliedManifest ?? bundledPolicyManifest());
  const [policyLoading, setPolicyLoading] = useState(
    Boolean(!suppliedManifest && window.studioHost),
  );
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyDocument | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [choices, setChoices] = useState(initialChoices);
  const [useDefault, setUseDefault] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceChoice | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [adbStatus, setAdbStatus] = useState<AdbSetupStatus>('not-checked');
  const [adbBusy, setAdbBusy] = useState(false);
  const [finishBusy, setFinishBusy] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const exit = () => {
    if (!window.confirm('Exit and close A2MaTeX Studio?')) return;
    if (window.studioHost) void window.studioHost.system.quit();
    else navigate(URL.Login, { replace: true });
  };

  const retryPolicies = async () => {
    if (!window.studioHost) return;
    setPolicyLoading(true);
    const result = await window.studioHost.onboarding.getPolicies();
    setPolicyLoading(false);
    if (result.ok) {
      setManifest(result.value);
      toast.success('Policies refreshed');
    } else {
      setManifest({ configured: false, documents: [], error: result.error.message });
      toast.error('Policy refresh failed', { description: result.error.message });
    }
  };

  useEffect(() => {
    const host = window.studioHost;
    if (suppliedManifest || !host) return;
    let active = true;
    void host.onboarding.getPolicies().then((result) => {
      if (!active) return;
      setPolicyLoading(false);
      if (result.ok) setManifest(result.value);
      else setManifest({ configured: false, documents: [], error: result.error.message });
    });
    return () => {
      active = false;
    };
  }, [suppliedManifest]);

  const chooseWorkspace = async () => {
    setWorkspaceError(null);
    if (!window.studioHost) {
      const message = 'Folder selection is available in the desktop app.';
      setWorkspaceError(message);
      toast.error('Workspace selection failed', { description: message });
      return;
    }
    setWorkspaceBusy(true);
    const result = await window.studioHost.onboarding.chooseWorkspace();
    setWorkspaceBusy(false);
    if (!result.ok) {
      setWorkspaceError(result.error.message);
      toast.error('Workspace selection failed', { description: result.error.message });
      return;
    }
    if (result.value) {
      setWorkspace(result.value);
      setUseDefault(false);
      toast.success('Workspace selected', { description: result.value.label });
    } else {
      toast.info('Workspace selection cancelled');
    }
  };

  const checkAdb = async () => {
    if (!window.studioHost) {
      setAdbStatus('not-found');
      toast.error('ADB check failed', { description: 'Desktop host is unavailable.' });
      return;
    }
    setAdbBusy(true);
    const result = await window.studioHost.androidInspector.listDevices();
    setAdbBusy(false);
    if (!result.ok) {
      setAdbStatus(result.error.code === 'ADB_NOT_FOUND' ? 'not-found' : 'error');
      toast.error('ADB check failed', { description: result.error.message });
      return;
    }
    if (result.value.some((device) => device.usable)) {
      setAdbStatus('available');
      toast.success('ADB is ready');
    } else if (result.value.some((device) => ['offline', 'unauthorized'].includes(device.status))) {
      setAdbStatus('permission-issue');
      toast.warning('ADB needs device permission');
    } else {
      setAdbStatus('no-device');
      toast.warning('ADB is available, but no device was found');
    }
  };

  const finish = async () => {
    const terms = manifest.documents.find((document) => document.id === 'terms');
    const privacy = manifest.documents.find((document) => document.id === 'privacy');
    if (!terms || !privacy || !manifest.configured) {
      const message = 'Policy configuration is incomplete. Go back and review the policies.';
      setFinishError(message);
      toast.error('Setup could not be completed', { description: message });
      return;
    }
    if (!window.studioHost) {
      toast.success('Setup completed');
      navigate(URL.Login, { replace: true });
      return;
    }
    setFinishBusy(true);
    setFinishError(null);
    const result = await window.studioHost.onboarding.complete({
      acceptedTermsVersion: terms.version,
      acceptedPrivacyVersion: privacy.version,
      analyticsOptIn: choices.analyticsOptIn,
      workspaceCapability: useDefault ? null : (workspace?.capability ?? null),
      adbStatus,
    });
    setFinishBusy(false);
    if (!result.ok) {
      setFinishError(result.error.message);
      toast.error('Setup could not be completed', { description: result.error.message });
      return;
    }
    toast.success('Setup completed');
    navigate(URL.Login, { replace: true });
  };

  const termsVersion =
    manifest.documents.find((document) => document.id === 'terms')?.version ?? '—';
  const privacyVersion =
    manifest.documents.find((document) => document.id === 'privacy')?.version ?? '—';

  return (
    <OnboardingShell step={step}>
      {step === 1 ? (
        <WelcomeStep version={info?.appVersion} onContinue={() => setStep(2)} onExit={exit} />
      ) : step === 2 ? (
        <PoliciesStep
          manifest={manifest}
          value={choices}
          onChange={setChoices}
          loading={policyLoading}
          onOpenDocument={setSelectedPolicy}
          onRetry={() => void retryPolicies()}
          onBack={() => setStep(1)}
          onContinue={() => setStep(3)}
          onExit={exit}
        />
      ) : step === 3 ? (
        <WorkspaceStep
          useDefault={useDefault}
          workspace={workspace}
          busy={workspaceBusy}
          error={workspaceError}
          onUseDefault={() => {
            setUseDefault(true);
            setWorkspaceError(null);
          }}
          onChoose={() => void chooseWorkspace()}
          onBack={() => setStep(2)}
          onContinue={() => setStep(4)}
          onExit={exit}
        />
      ) : step === 4 ? (
        <OptionalSetupStep
          status={adbStatus}
          busy={adbBusy}
          onCheck={() => void checkAdb()}
          onBack={() => setStep(3)}
          onContinue={() => setStep(5)}
          onExit={exit}
        />
      ) : (
        <FinishStep
          termsVersion={termsVersion}
          privacyVersion={privacyVersion}
          analytics={choices.analyticsOptIn}
          workspaceLabel={useDefault ? 'Ask when exporting' : (workspace?.label ?? 'Not selected')}
          adbStatus={adbStatus}
          busy={finishBusy}
          error={finishError}
          onBack={() => setStep(4)}
          onFinish={() => void finish()}
          onExit={exit}
        />
      )}
      <PolicyDialog policy={selectedPolicy} onClose={() => setSelectedPolicy(null)} />
    </OnboardingShell>
  );
}
