# ADR-004 — Desktop onboarding and Windows distribution boundary

Status: Proposed  
Date: 2026-10-15  
Owners: Desktop, Product, Release, Security, Privacy/Legal  
Related: D-025–D-026; Q-018–Q-023; Q-301; Q-304

## Context

A2MaTeX Studio needs a coherent path from obtaining the Windows installer through first launch and
later restarts. The onboarding guide proposes three distinct stages:

1. website/download portal;
2. Windows installer and optional EULA;
3. in-app first-run setup for policy, workspace and preferences.

The current architecture already gives Electron main ownership of filesystem authority, project
location capabilities and credentials. Onboarding must reuse those boundaries instead of adding a
second raw-path API or storing setup state in projects. It must also remain distinct from login,
license checks and the A2MaTeX automation package format.

The guide contains illustrative code and `electron-builder` configuration. Those snippets are
inputs, not proof that the repository already has the handlers, state service, installer dependency
or approved legal text.

## Proposed decision

### Distribution stages

- Windows MVP uses public download from an official release channel. A download gate may be added
  later, but a signed URL or website checkbox is not a license/anti-sharing boundary.
- Production uses a signed NSIS installer. Traditional mode is preferred when EULA display or
  install-directory selection is required. EULA content must be reviewed and versioned outside code.
- Studio installer and A2MaTeX Package are separate artifacts, outputs and trust chains. Installer
  metadata, desktop signing material and onboarding state never enter an automation package.

### Bootstrap and guard order

```text
desktop bootstrap
  → load current policy manifest + onboarding state
  → onboarding required? /onboarding
  → restore auth session
  → signed out? /login
  → load/revalidate catalog
  → protected return URL or /projects
```

Guards do not race. While either state is hydrating, UI shows a neutral splash. The original deep
link is preserved as a validated internal return URL.

### Onboarding flow

The P0 flow is Welcome → Policies → Workspace → Optional Setup → Finish.

- Required policy controls are never pre-checked. Analytics/telemetry is a separate optional choice.
- A material policy-version change can reopen Policies in review mode without deleting project,
  catalog cache or auth credentials.
- Refusal behavior is not guessed: MVP default is review again or Exit until Q-020 is accepted.
- Offline users can complete local steps. A server-required consent sync is marked pending and is
  reconciled after authenticated connectivity; local completion cannot assert server acceptance.

### State and filesystem boundary

Electron main owns a schema-versioned state file below `app.getPath('userData')/config`. Writes use
schema validation and atomic replacement. An illustrative internal record is:

```ts
interface OnboardingStateV1 {
  schemaVersion: 1;
  completed: boolean;
  acceptedTermsVersion: string | null;
  acceptedPrivacyVersion: string | null;
  analyticsOptIn: boolean | null;
  completedAt: string | null;
  projectRoot: string | null;
}
```

`projectRoot` is main-private data, not renderer authority. Workspace selection opens a native picker
through a narrow preload method and reuses LocationRegistry/ProjectFileService rules. Main
canonicalizes and validates the selected directory, stores it according to retention policy, and
returns only display metadata plus an opaque capability. On restart, main revalidates the path and
issues a new capability.

Renderer cannot submit an arbitrary path to gain access and cannot set `completed=true` without a
valid current policy version and required setup fields. Tokens remain in the credential vault and
never enter onboarding JSON.

### Consent boundary

Local state drives UX and can be modified by the machine owner; it is not authoritative legal proof,
authentication or entitlement. If account-bound consent is required, backend records the subject,
policy versions, timestamp and minimum evidence allowed by an approved retention/privacy policy.
Analytics collection remains disabled for `false` or `null` and can be changed in Settings.

## Alternatives considered

### Put the full wizard in NSIS

Rejected. NSIS is suitable for license/install choices, not project capability grants, login,
offline recovery or application preferences that evolve independently of installer versions.

### Store onboarding in localStorage or project source

Rejected. Renderer storage broadens the tamper surface and project storage leaks machine/user policy
state into source control and automation packages.

### Require website consent before every download

Not selected for MVP. It adds backend/session/download infrastructure but does not prevent sharing an
already downloaded installer. Runtime auth/license checks are still required.

### Run auth and onboarding guards concurrently

Rejected. Competing redirects create flicker, lose return URLs and can show login before required
local policy/setup state has loaded.

## Consequences

- Add onboarding domain/application types, state repository port, main userData adapter, typed IPC,
  presentation flow and settings entry.
- Add a trusted policy manifest/version source and migration/re-consent rules.
- Reuse project location capabilities; do not introduce renderer path authorization.
- Add electron-builder/NSIS, reviewed EULA, signing and release configuration only in the release
  milestone; documentation must not mark these as implemented before scripts/artifacts exist.
- Add fresh-install, restart, corrupt-state, policy-update, offline, workspace-recovery and real
  installer tests.
- Product/Legal/Privacy decisions remain blockers for policy text, refusal mode, backend evidence and
  retention. This ADR does not provide legal advice.

## Rollout

1. Resolve Q-018–Q-023 and accept or revise this ADR.
2. Freeze `OnboardingStateV1`, renderer DTOs and policy manifest fixtures.
3. Implement repository/use cases and atomic main adapter with contract tests.
4. Implement preload handlers and guard ordering before the wizard UI.
5. Implement accessible steps and Settings management; test offline/re-consent/recovery.
6. Add NSIS configuration with a reviewed EULA and run Windows installer tests.
7. Add production code signing/checksum/update channel and, only if required, backend consent or
   gated-download integration.

Rollback may disable an optional onboarding experiment, but it must not silently mark required
policy as accepted. A schema rollback reads supported state or enters safe recovery without deleting
projects or credentials.
