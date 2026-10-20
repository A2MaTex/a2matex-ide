# ADR-003 — Authentication and offline-capable node catalog sync

Status: Accepted (behavior/boundaries); API mapping blockers remain open  
Date: 2026-10-14  
Owners: Desktop, Identity, Catalog, Runtime, Security  
Related: D-017–D-022; Q-009–Q-017

## Context

Studio currently exposes a hard-coded `BUILTIN_NODE_CATALOG` directly to `NodePalette`. Production
must authenticate a user and load the catalog supported by a Runtime version:

- `POST /api/v1/auth/login` with `account`, `password`;
- `GET /api/v1/node-catalog?runtimeVersion=0.1.0` with an authenticated session;
- catalog response contains `catalogHash` and node definitions;
- catalog endpoint advertises `304` when the catalog has not changed.

Users must keep authoring when connectivity is lost by using the latest valid catalog, and Studio
must request/revalidate the catalog when connectivity returns. Authentication secrets and tokens
must not broaden the renderer trust boundary.

The remote response is not isomorphic to the current domain type: it has no node version or input
port array, and adds JSON schemas, timeout, error policies and sensitive capability metadata.

## Decision

### Trust boundary

Electron main owns auth HTTP, Authorization headers, token lifecycle, OS credential integration,
catalog HTTP and catalog cache files. Preload exposes narrow typed auth/catalog operations. Renderer
receives only non-secret session metadata and normalized catalog snapshots.

Password travels once from the login form to a typed IPC handler and is never persisted,
echoed or logged. The login response always contains both `accessToken` and `refreshToken`.
Access token remains in main-process memory. Refresh token is persisted only in an OS credential
store so the session can be restored after app restart without showing the login form.

### Session lifecycle

```text
login success
  → keep access token in Electron main memory
  → atomically store refresh token in OS credential store
  → return non-secret authenticated session metadata

app restart
  → read refresh token from credential store
  → call refresh endpoint
  → receive new access token + refresh token
  → atomically rotate stored refresh token
  → continue to workspace and sync catalog without login UI
```

The token coordinator owns all authenticated HTTP requests:

- Refresh proactively before access-token expiry when the server provides `expiresIn`,
  `expiresAt` or an agreed `exp` claim.
- On `401`, perform one single-flight refresh and retry the original request once.
- Concurrent requests wait for the same refresh operation; they do not reuse a rotating refresh
  token independently.
- A network/timeout failure does not invalidate or delete the refresh token. The session can enter
  offline mode and retry restore/refresh when connectivity returns.
- A server-confirmed invalid, expired or revoked refresh token clears local credential/session state
  and sends the user to login.
- Logout attempts server-side revoke, then clears access token, refresh token and session metadata
  locally even if revoke fails.

The renderer receives only `SessionState` such as `restoring`, `authenticated`, `offline` or
`signed-out`, plus minimal profile/expiry metadata. It never receives either token.

### Catalog sources

Remote catalog is authoritative in production. Built-in catalog remains a dev/test adapter and may
only be enabled by explicit development configuration. Studio does not silently union the two
sources.

Application code consumes `NodeCatalogProvider`; UI components do not import a catalog constant or
network DTO. Infrastructure validates the remote DTO, enforces limits, normalizes it to domain
definitions and returns an immutable snapshot.

### Catalog sync state machine

```text
startup ──stored refresh token──► restoring-session
  │                                  ├─ refresh success ─► syncing
  │                                  ├─ network + cache ─► cached-offline
  │                                  └─ invalid/revoked ─► no-session
  └─no stored token─────────────────────────────────────► no-session

no-session ──login success──► syncing
                         ├─ valid 200/304 ─► fresh
                         ├─ network/5xx + cache ─► cached-refresh-failed
                         ├─ offline + cache ─► cached-offline
                         ├─ no cache ─► missing/blocking
                         └─ invalid/expired auth ─► no-session

cached-offline/cached-refresh-failed ──online/manual retry──► syncing
```

- Startup with a usable session, successful login, Runtime version change, manual Retry and an
  offline→online signal all request sync.
- Online/offline browser/OS events are hints. A successful authenticated response determines
  freshness.
- Only one sync per scope runs at a time. A newer scope/request cancels or supersedes the old result.
- A valid `200` is normalized before atomically replacing cache.
- A `304` is valid only when a matching cache entry exists; otherwise retry once without a
  conditional validator.
- A `401` joins/starts one single-flight refresh and retries the failed request once. It never
  loops.
- Timeout, network error, `5xx` or invalid payload preserves last-known-good cache and surfaces a
  degraded status.

### Cache

Catalog cache is application data under Electron `userData`, separate from project source,
recovery data and package inputs. Cache key includes trusted server/environment, stable account
scope and effective Runtime version. It never contains password or token.

Each entry has a cache schema version, scope, opaque `catalogHash`, `fetchedAt` and original
validated node DTOs. Read and write validate size/schema; replacement uses temp file + flush +
atomic rename. Corrupt cache never replaces a good entry.

`catalogHash` is treated as an opaque revision/cache validator. It is not an integrity or signature
proof until the producer defines canonical bytes and a verification contract.

Cache has no TTL that can mark it fresh without the server. Age is shown to users and can drive
retention cleanup. Logout always removes access token from memory and refresh token from OS
credential storage; whether it also deletes account-scoped catalog is a product policy with an
explicit “clear cached data” action.

### Offline behavior

Offline continuation is allowed only for an identity that previously completed online login and has
a valid cache for the requested Runtime scope. Studio does not validate password offline.
Offline mode permits project authoring with a persistent stale indicator. Operations requiring
server authorization or proof of current Runtime/catalog compatibility remain disabled or must run
their own preflight.

If there is no cache, Node Palette is blocked with Retry/Settings/Diagnostics. Studio does not
pretend the built-in fixture is the user's production catalog.

### Workflow safety on catalog change

Catalog refresh cannot delete or rewrite workflow nodes. A workflow node whose definition is
missing is retained and rendered as unknown/unavailable, with a stable validation issue. Migration
to a replacement definition is explicit and undoable.

## API contract assumptions and blockers

The following are required before enabling production remote catalog:

1. Confirm API base URL/environment and HTTPS policy.
2. Add token expiry plus refresh/revoke/logout endpoint and rotation rules. Refresh should return a
   new `{ accessToken, refreshToken }` pair; otherwise explicitly declare a non-rotating refresh
   token contract.
3. Define the conditional request that leads to `304`; preferred contract is
   `ETag`/`If-None-Match` carrying `catalogHash`.
4. Add a stable node version or declare `type` an immutable versioned ID and migrate project schema.
5. Define input/control ports and JSON Schema-to-data-port mapping.
6. Version the supported JSON Schema/editorHints subset and response limits.
7. Return a stable subject/tenant scope suitable for cache isolation.
8. Define the effective Runtime version used before a Runtime connection exists.

The adapter must not guess these values from the sample payload.

## Alternatives considered

### Fetch directly from renderer

Rejected because it exposes tokens to a larger attack surface, duplicates networking policy and
allows remote DTOs to bypass the host/application boundary.

### Store catalog in each project

Rejected because catalog is account/server/Runtime-scoped application data, would dirty projects,
leak across collaborators and risk being packaged.

### Always require network

Rejected because it prevents offline authoring and turns transient server outages into project
availability failures.

### Merge remote and built-in nodes

Rejected as a default because identical types may have different schemas/handlers/permissions.
An explicit development source switch is auditable and deterministic.

## Consequences

- New auth, credential, catalog HTTP and cache adapters are required in Electron main.
- A token coordinator and OS credential-store adapter are required for silent restart restore,
  proactive refresh, single-flight `401` recovery and atomic refresh-token rotation.
- Node Palette, Inspector, validator and node creation must depend on a catalog snapshot/provider.
- Domain `NodeDefinition` must expand without dropping server semantics.
- UI gains authenticating, syncing, fresh, cached-offline, refresh-failed, cache-miss and
  session-expired states.
- Offline improves resilience but cached definitions can be stale; Runtime/compiler preflight stays
  authoritative for execution.
- Contract and E2E tests need a controllable mock API, restart, token expiry/revocation and
  online/offline transitions.

## Rollout

1. Freeze open API contracts and canonical fixtures with backend/Runtime teams.
2. Add DTO schemas, limits and normalization tests without changing production palette.
3. Add main-process auth/token coordinator, OS token vault, refresh/revoke adapter and typed preload
   contracts.
4. Add scoped atomic cache and sync state machine behind a feature flag.
5. Refactor all catalog consumers to `NodeCatalogProvider`.
6. Add login/session guard and observable offline/reconnect UX.
7. Run login→restart→silent-refresh, token rotation/revocation, online→offline→restart→reconnect and
   cross-account E2E tests.
8. Enable remote catalog by default only after security review and contract gates pass.

Rollback disables the remote-catalog feature flag for development builds; it does not silently use
built-in nodes in a production session.
