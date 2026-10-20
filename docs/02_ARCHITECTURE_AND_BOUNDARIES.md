# 02 — Kiến trúc và ranh giới module

## 1. Quy tắc dependency

```text
Presentation ──► Application ──► Domain
      │                 ▲            ▲
      └──── composition │            │ implements ports
                        └── Infrastructure
```

- `domain`: entity, value object, invariant, port type thuần TypeScript.
- `application`: use case, orchestration, DTO và transaction boundary.
- `infrastructure`: filesystem, Electron IPC, HTTP, Runtime process/client, credential store.
- `presentation`: React, React Flow, Monaco, Zustand session store, shadcn/Tailwind.
- `app`: composition root, router, providers, bootstrap/error boundary.

Domain/Application không import React, Electron, Axios/fetch implementation, React Flow, Monaco, Tailwind hoặc Zustand.

## 2. System context

```text
                    ┌─────────────────────────┐
                    │ Identity / Catalog API  │
                    │ Marketplace API         │
                    └────────────▲────────────┘
                                 │ HTTPS/auth/catalog/upload
┌──────────────┐ IPC ┌───────────┴──────┐ protocol ┌───────────────┐
│ Studio UI    ├────►│ Studio host      ├─────────►│ Runtime Engine│
│ (renderer)   │     │ (Electron main)  │          └───────┬───────┘
└──────────────┘     └───────┬──────────┘                  │ adapter
                             │                              ▼
                             ▼                       Android device
                       Local project
```

Studio host chịu trách nhiệm privileged IO. Runtime là process/service độc lập hoặc embedded child process phía host; lựa chọn transport không được rò vào Application layer.

## 3. Bounded modules trong Studio

| Module | Sở hữu | Không sở hữu |
|---|---|---|
| Identity Session | login/logout, token lifecycle, account scope | render form hoặc lưu password |
| Catalog Sync | fetch/revalidate/cache/normalize node definitions | workflow node instance hoặc palette state |
| Project | lifecycle, manifest, file tree, dirty/save | graph execution |
| Node Catalog | node definition, version, schema, capability | node instance state |
| Workflow | nodes, ports, edges, layout, validation | React Flow object |
| Compiler | normalized graph → executable IR + source map | device connection |
| Runtime Session | preflight, run command, event stream, cancellation | renderer UI state |
| Device | discovery, selection, readiness/capabilities | ADB UI rendering |
| Packaging | assemble, digest, sign, verify | Marketplace review policy |
| Publishing | auth, draft/upload/status | package compilation rules |
| Workspace UI | tabs, panels, selection, viewport | persistence implementation |

## 4. Electron boundary

### Preload API đề xuất

```ts
export interface StudioHostApi {
  onboarding: {
    get(): Promise<OnboardingStateDto>;
    save(input: CompleteOnboardingDto): Promise<OnboardingStateDto>;
    chooseProjectRoot(): Promise<ProjectRootSelectionDto | null>;
  };
  auth: {
    restore(): Promise<SessionStateDto>;
    login(input: LoginDto): Promise<SessionStateDto>;
    logout(): Promise<void>;
  };
  catalog: {
    load(runtimeVersion: string): Promise<CatalogSnapshotDto>;
    refresh(runtimeVersion: string): Promise<CatalogSnapshotDto>;
  };
  project: {
    chooseOpenLocation(): Promise<ProjectLocation | null>;
    chooseSaveLocation(defaultName: string): Promise<ProjectLocation | null>;
    open(location: ProjectLocation): Promise<ProjectSnapshotDto>;
    save(request: SaveProjectDto): Promise<SaveResultDto>;
  };
  runtime: {
    capabilities(): Promise<RuntimeCapabilitiesDto>;
    listDevices(): Promise<DeviceDescriptorDto[]>;
    start(request: StartRunDto): Promise<RunHandleDto>;
    stop(runId: string): Promise<void>;
    subscribe(runId: string, listener: (event: RuntimeEventDto) => void): () => void;
  };
  package: {
    build(request: BuildPackageDto): Promise<BuildPackageResultDto>;
    verify(location: ArtifactLocationDto): Promise<PackageVerificationDto>;
  };
}
```

### IPC rules

- Channel là hằng số allow-list, không expose generic `send/invoke`.
- Parse payload bằng schema ở renderer boundary và main handler.
- Main resolve/canonicalize path, áp project-root policy và chặn traversal/symlink escape.
- Subscription trả hàm unsubscribe; dispose toàn bộ khi window/reload/run kết thúc.
- Error qua IPC là DTO có `code`, `message`, `details?`, `retryable`, không serialize nguyên Error/stack nhạy cảm.
- Không truyền access token/private key vào renderer nếu thao tác có thể hoàn tất tại main.
- Login request là ngoại lệ một chiều: password đi renderer → main trong một IPC call, không
  được echo trong response, state, log hoặc diagnostics. Token không bao giờ đi main → renderer.
- Renderer không được tự gửi Authorization header hoặc đọc/ghi file catalog cache.
- Onboarding IPC chỉ nhận DTO đã validate. Renderer không gửi raw path để tự cấp quyền; folder picker
  do main mở và trả opaque location capability/display metadata.
- `completed=true` chỉ được main suy ra sau khi policy version, required consent và workspace input
  hợp lệ; không nhận một boolean hoàn tất không có context từ renderer.

## 5. Cấu trúc source mục tiêu

```text
electron/
├── main/
│   ├── bootstrap.ts
│   ├── adapters/
│   │   ├── auth/             # HTTP, safeStorage và E2E adapters
│   │   └── onboarding/       # userData state/policy adapters
│   ├── config/               # đọc/validate environment
│   ├── ipc/
│   ├── security/
│   └── services/             # privileged project/filesystem services còn lại
└── preload/
    ├── index.ts
    └── studio-host-api.ts

src/
├── app/
│   ├── bootstrap/
│   ├── providers/
│   └── router/
├── domain/
│   ├── project/
│   ├── onboarding/
│   ├── auth/
│   ├── node-catalog/
│   ├── workflow/
│   ├── runtime/
│   └── package/
├── application/
│   ├── project/
│   ├── onboarding/
│   ├── auth/
│   ├── node-catalog/
│   ├── workflow/
│   ├── runtime/
│   └── publishing/
├── infrastructure/
│   ├── electron/
│   ├── http/
│   ├── credentials/
│   ├── catalog-cache/
│   ├── persistence/
│   ├── runtime/
│   └── marketplace/
├── presentation/
│   ├── pages/
│   ├── features/
│   │   └── onboarding/
│   ├── components/ui/
│   ├── components/layout/
│   └── stores/
├── shared/
│   ├── errors/
│   ├── result/
│   ├── ids/
│   └── schema/
└── styles/

tests/
├── unit/
├── contract/
├── integration/
├── e2e/
└── fixtures/
```

Auth composition tuân theo dependency inversion: `application/auth/AuthSessionService` chỉ phụ
thuộc `AuthRemoteGateway` và `RefreshTokenVault`; Electron main triển khai hai port bằng
`HttpAuthGateway` và `SecureRefreshTokenVault`. Biến `VITE_API_BASE_URL` được đọc từ `.env` bởi config
adapter rồi inject qua `bootstrap.ts`; application service không đọc `process.env`, gọi `fetch` hoặc
import Electron.

## 6. Composition và command flow

Ví dụ `Run Workflow`:

```text
Run button / F5
  → RunActiveWorkflow controller
  → ValidateWorkflow use case
  → CompileWorkflow use case
  → CheckRuntimeCompatibility use case
  → StartWorkflowRun use case
  → RuntimeClient port
  → ElectronRuntimeClient adapter
  → preload IPC
  → main Runtime service
```

UI chỉ giữ command status và render event. Không gọi ADB, spawn process, build artifact hoặc tự quyết graph hợp lệ.

### First-run composition

```text
App bootstrap
  → LoadOnboardingState use case
  → OnboardingStateRepository port
  → Electron userData adapter (schema validate + atomic read/write)
  → nếu required: /onboarding
       Welcome → Policies → Workspace → Optional → Finish
       Workspace picker → preload IPC → main LocationRegistry/ProjectFileService
  → nếu complete/current: RestoreSession use case
  → /login hoặc return URL
```

Guard order bắt buộc là `bootstrap-loading → onboarding → session → protected route`; không chạy
song song rồi để route nào hoàn tất trước tự redirect. Onboarding state và auth session có lifecycle
độc lập: logout không xóa onboarding; re-consent không xóa credential/project; uninstall/cleanup có
thể làm mất app-local state nên app phải xử lý fresh state an toàn.

Main có thể persist canonical `projectRoot`, nhưng renderer chỉ nhận display metadata và capability.
Khi restart, main revalidate path/quyền rồi cấp capability mới; capability cũ không được coi là bền
vững. Nếu path mất, chỉ quay lại Workspace Setup hoặc Settings, không đánh dấu toàn bộ onboarding
chưa hoàn tất trừ khi product quyết định workspace là required invariant.

## 7. Login và catalog sync flow

```text
Login form
  → Authenticate use case
  → preload auth.login
  → main Auth service
  → POST /api/v1/auth/login
  → token vault (access: memory, refresh: OS credential store)
  → SyncNodeCatalog(runtimeVersion)
  → GET /api/v1/node-catalog
  → validate remote DTO → normalize domain definition → atomic cache replace
  → renderer nhận CatalogSnapshot không chứa token
```

Login response gồm cả `accessToken` và `refreshToken`. Auth service giữ access token trong memory
và ghi refresh token vào OS credential store trước khi trả session metadata cho renderer.

Khi app khởi động, main process phục hồi theo luồng:

```text
read refresh token from OS credential store
  → POST refresh endpoint
  → receive new accessToken + refreshToken
  → atomically rotate refresh token in credential store
  → keep access token in main memory
  → return authenticated SessionState without tokens
  → sync node catalog
```

Nếu không có refresh token hoặc refresh bị server từ chối vì expired/revoked, host xóa credential và
trả `signed-out`; chỉ lúc đó UI mới chuyển tới `/login`. Network unavailable không xóa refresh
token: session chuyển `offline` và có thể dùng catalog cache cho tới khi reconnect.

Mọi request cần auth đi qua một token coordinator. Coordinator refresh chủ động trước expiry nếu
server trả `expiresIn`/`expiresAt`; khi gặp `401`, dùng single-flight refresh rồi retry request
đúng một lần. Refresh-token rotation phải ghi token mới thành công trước khi loại token cũ theo
contract backend; các request đồng thời chờ cùng một refresh promise.

Khi app khởi động hoặc mất mạng, application có thể đọc cache đúng scope để tiếp tục authoring.
Sự kiện online chỉ dispatch một refresh có dedupe/cancellation; chỉ response 200 hợp lệ hoặc 304
với cache tương ứng mới chuyển catalog sang fresh. Lỗi network/5xx giữ cache và trả trạng thái
degraded; `401` chỉ retry một lần sau refresh. Chỉ refresh bị server xác nhận
invalid/expired/revoked mới chuyển về login; timeout/network error chuyển sang offline/degraded và
giữ credential.

`SessionStateDto` chỉ chứa trạng thái, account/profile tối thiểu và thời điểm hết hạn cần cho UX;
không chứa access token, refresh token hoặc Authorization header. Không lưu token trong
`localStorage`, Zustand, file JSON, project hoặc catalog cache.

Node Palette phải query catalog qua provider/store. Import trực tiếp
`BUILTIN_NODE_CATALOG` chỉ còn hợp lệ cho fixture/dev adapter; remote và cached catalog không được
đi vòng qua application layer.

## 8. Error model

```ts
export interface AppIssue {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  source?: {
    workflowId?: string;
    nodeId?: string;
    propertyPath?: string;
  };
  retryable?: boolean;
  remediation?: string;
}
```

- Domain trả issue xác định, không throw cho validation thông thường.
- Infrastructure map lỗi OS/network/process sang error code ổn định.
- Presentation quyết định badge/toast/panel; không parse message text để suy ra logic.

Các error code mới tối thiểu: `AUTH_INVALID_CREDENTIALS`, `AUTH_SESSION_EXPIRED`,
`AUTH_NETWORK_UNAVAILABLE`, `CATALOG_CACHE_MISS`, `CATALOG_INVALID_RESPONSE`,
`CATALOG_RUNTIME_INCOMPATIBLE` và `CATALOG_REFRESH_FAILED`.