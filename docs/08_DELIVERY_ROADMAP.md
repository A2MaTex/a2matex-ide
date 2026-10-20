# 08 — Delivery roadmap

Roadmap dùng milestone theo dependency, không gắn ngày cứng khi chưa biết team capacity và Runtime/Marketplace readiness. Mỗi phase kết thúc bằng demo chạy được và acceptance gate.

## 1. Dependency map

```text
P0 Foundation
 ├─► P1 Project vertical slice
 │     └─► P2 Visual authoring
 │            └─► P2.4 First-run onboarding
 │                    └─► P2.5 Identity + remote catalog
 │                    ├─► P3 Persistence + recovery
 │                    └─► P4 Compiler + Runtime + device
 │                       └─► P5 Debug/code experience
 └────────────────────────────► P6 Package + publish
                                      └─► P7 Hardening + beta
```

Contract work cho Runtime/Package/Marketplace bắt đầu sớm, dù UI integration nằm ở phase sau.

Checkpoint 2026-10-14: P0–P2 đã có executable baseline trong source và test. P2.4 và phần còn lại của
P2.5 là các workstream kế tiếp; onboarding local có thể triển khai song song với việc chốt contract
refresh/catalog, nhưng guard order phải được kiểm thử chung. “Complete baseline” không có nghĩa mọi
hardening/backlog của phase đã đóng; các acceptance gate vẫn là regression gate cho phase sau.

Checkpoint tài liệu 2026-10-15: onboarding guide đã được đưa vào scope dưới Phase 2.4 và release
hardening. Đây là kế hoạch/proposal, không phải trạng thái implementation đã hoàn thành.

## 2. Phase 0 — Foundation và executable skeleton

**Status:** Complete baseline

### Deliverables

- Cấu trúc Clean Architecture và alias đầy đủ.
- Tailwind tokens + shadcn location + app shell dark-first.
- Router `/projects`, `/workspace/:projectId`, `/settings`.
- Electron main/preload skeleton với security baseline và typed host API.
- ESLint import boundaries, formatter, Vitest, Testing Library và Electron E2E harness.
- Scripts thật cho lint/typecheck/test/build web/build desktop.
- Error boundary, structured logger và CI tối thiểu.

### Acceptance gate

- App desktop mở được Projects và empty Workspace.
- Renderer không có Node access; một typed ping/query qua preload contract hoạt động.
- Unit + component + one Electron smoke test chạy trong CI.
- Không có import Presentation/Infrastructure trong Domain/Application.

## 3. Phase 1 — Project lifecycle vertical slice

**Status:** Complete baseline

### Deliverables

- Project/domain schemas v1 và minimal manifest/workflow fixture.
- `CreateProject`, `OpenProject`, `SaveProject`, `SaveAsProject` use cases.
- In-memory repository trước, filesystem adapter qua main sau.
- Project Home recent/create/open UX.
- Workspace tabs/explorer cơ bản, dirty revision và close guard.
- Atomic save, unsupported schema state và migration harness.

### Acceptance gate

- Create → save → close → reopen giữ nguyên semantic fixture.
- Invalid/malicious path bị reject ở main.
- Edit trong khi save không bị clear dirty nhầm.
- Unit/contract/integration tests của repository đều pass.

## 4. Phase 2 — Visual workflow authoring

**Status:** Complete baseline bằng built-in catalog; production catalog sẽ được thay ở P2.5.

### Deliverables

- Workflow graph commands + undo/redo.
- Built-in catalog cho bốn node MVP.
- React Flow mapper/canvas, palette search/category/drag.
- Connect/delete/move/select/copy/duplicate cơ bản.
- Schema-driven Inspector.
- Incremental validator + Problems navigation.
- Workspace panel layout và keyboard shortcuts P0.

### Acceptance gate

- User tạo được `start → delay → tap → log` không sửa JSON.
- Connection/type/property/cycle error hiển thị tại node/field và Problems.
- Undo/redo đúng sau drag và param edit.
- Save/reopen không phụ thuộc React Flow serialization.

## 5. Phase 2.4 — First-run onboarding và app-local setup

**Status:** Planned — product/policy decisions Q-018–Q-023 và ADR-004 cần được review.

### Deliverables

- Bootstrap guard theo thứ tự onboarding hydrate → session hydrate → protected route.
- Welcome → Policies → Workspace → Optional → Finish, có return URL và keyboard/accessibility.
- Versioned onboarding state repository dưới Electron `userData`, schema validation, migration và
  atomic write; renderer không trực tiếp đọc/ghi file.
- Policy manifest/version; required consent tách analytics opt-in, re-consent khi material change.
- Workspace picker tái sử dụng LocationRegistry/ProjectFileService, main revalidate path/quyền và
  chỉ cấp opaque capability cho renderer.
- Settings cho xem policy, đổi analytics preference và default project root.
- Unit/component/integration/E2E cho fresh state, corrupt state, restart, offline, policy update,
  cancel picker, missing/unwritable workspace và refusal path.

### Acceptance gate

- Fresh install hoàn tất setup local rồi tiếp tục login/projects; restart không lặp onboarding khi
  state và policy version còn hợp lệ.
- Renderer không thể tự đặt `completed=true`, tự cấp raw-path authority hoặc ghi policy version giả.
- Offline hoàn tất các bước local; bước cần backend hiển thị pending, không ghi nhận thành công giả.
- Policy update yêu cầu review lại theo rule đã chốt mà không xóa project, cache hoặc credential.
- Workspace bị di chuyển/xóa có recovery UX và không gây tạo/xóa/ghi đè project ngoài ý muốn.

## 6. Phase 2.5 — Identity và remote node catalog

**Status:** In progress — login/session boundary implemented; refresh and remote catalog contracts
remain blocked by Q-011–Q-017.

### Checkpoint 2026-10-14 — login vertical slice

- Đã có `/login`, hydrate guard, return URL, logout và form account/password với error states.
- Login HTTP chạy trong Electron main, validate request/response; renderer chỉ nhận session metadata.
- Access token giữ main-memory; refresh token mã hóa bằng Electron `safeStorage` và ghi atomic dưới
  app user-data. Secure store không khả dụng thì session hạ xuống `session-only`, không ghi plaintext.
- API origin lấy từ `VITE_API_BASE_URL` trong `.env`; packaged app chỉ chấp nhận HTTPS, development mới cho
  HTTP để dùng mock server cục bộ.
- Web preview và E2E dùng explicit development/test auth adapter, không tạo token giả trong
  production adapter.
- Chưa bật silent refresh/token rotation/revoke vì Q-011 chưa có endpoint, payload, expiry và
  invalid-token semantics. Restore không gọi endpoint suy đoán và không xóa credential khi contract
  chưa khả dụng.
- Remote catalog, cache/offline, reconnect và refactor catalog consumers vẫn là phần việc tiếp theo
  của Phase 2.5 sau khi Q-012–Q-017 được chốt.

### Deliverables

- Route `/login`, session hydration/guard, logout và error UX cho account/password.
- Auth port + Electron main HTTP adapter cho `POST /api/v1/auth/login`; token vault không expose
  token cho renderer.
- OS credential-store adapter lưu refresh token; startup silent refresh lấy cặp token mới để user
  không phải login lại, access token vẫn chỉ ở main memory.
- Token coordinator có expiry scheduling, refresh single-flight, atomic rotation, retry-once và
  revoke/logout cleanup.
- Remote DTO schemas/limits/normalizer cho `GET /api/v1/node-catalog?runtimeVersion=...`.
- Catalog cache v1 scoped theo server/account/Runtime, atomic last-known-good persistence.
- Network-first sync state machine: startup/login/manual retry/reconnect, dedupe/cancel và
  200/304/401/timeout handling.
- Refactor Node Palette/Inspector/validator dùng catalog provider thay vì import
  `BUILTIN_NODE_CATALOG`.
- Unknown-node preservation khi cached/fresh catalog không còn definition của workflow.
- Mock server, fixtures, unit/contract/integration/component/E2E tests cho online → offline →
  reconnect và cross-account isolation.

### Acceptance gate

- Login thành công không làm token xuất hiện trong renderer, log, diagnostics hoặc project.
- Đóng/mở app với refresh token hợp lệ tự phục hồi session và đi vào workspace không hiện login;
  refresh token invalid/revoked mới yêu cầu đăng nhập lại.
- Nhiều request đồng thời khi access token hết hạn chỉ tạo một refresh; mọi request retry tối đa một
  lần và cặp refresh token mới được atomically thay trong credential store.
- Mất mạng khi startup không xóa refresh token; logout xóa local token kể cả revoke endpoint lỗi.
- Online login lấy catalog đúng Runtime; response invalid không thay last-known-good cache.
- Restart offline dùng đúng cache gần nhất và hiển thị cached/offline + last sync; cache miss có
  blocking recovery UX.
- Mỗi lần reconnect trigger revalidation; `200` atomically cập nhật, `304` giữ cache, `401`
  refresh tối đa một lần, request trùng được dedupe.
- Switch account/server/Runtime không dùng chéo cache.
- Workflow giữ nguyên unknown node khi catalog đổi; palette không silently merge remote và built-in.
- Các contract blocker trong ADR-003 về node version/ports, conditional 304, token expiry,
  refresh/revoke endpoint và rotation đã được backend chốt hoặc có feature flag không đưa
  integration chưa an toàn vào production.

## 7. Phase 3 — Persistence resilience

**Status:** Planned

### Deliverables

- Recovery draft lifecycle và startup recovery UX.
- Workspace preferences tách khỏi project source.
- Project/node schema migrations đầu tiên bằng fixture.
- Asset declaration/import và path/size policy.
- File watcher/conflict UX nếu hỗ trợ external edits; nếu chưa, explicit limitation.

### Acceptance gate

- Simulated crash phục hồi working copy mà không tự ghi đè source.
- Mở project schema cũ migrate có backup; schema mới unsupported ở read-only/error state an toàn.
- Workspace state không lọt vào package candidate.

## 8. Phase 4 — Compiler, Runtime và Android vertical slice

### Deliverables

- Compiler pipeline + versioned IR/source map/digest.
- Chốt executable JSON contract; phân biệt authoring workflow JSON với IR JSON Runtime nhận.
- RuntimeClient port, fake adapter và transport adapter thật.
- Capability handshake/compatibility/preflight.
- Device discovery/select/readiness UI.
- Runtime-owned ADB adapter: verified binary/version, explicit serial targeting, allow-listed handler
  mapping, `shell=false`, timeout/cancel và bounded output.
- Emulator readiness + device lock/concurrency state machine; capability-gated launch/stop nếu có.
- Run/stop, ordered event stream và node execution overlay.
- Runtime crash/disconnect/cancel race handling.

### Acceptance gate

- Workflow bốn node chạy trên fake Runtime và ít nhất một Android device target.
- Malformed/tampered executable JSON bị Runtime reject trước ADB; project/node không thể truyền raw
  command hoặc executable path.
- Hai emulator không bị gửi nhầm command; offline/unauthorized/boot-not-ready và concurrent-run
  policy tạo đúng stable error/state.
- Preflight chặn thiếu device/handler/permission.
- Stop chờ acknowledgement và trạng thái cuối chính xác.
- Cùng IR fixture chạy qua Studio harness và consumer/Desktop harness.

## 9. Phase 5 — Code và debug experience

### Deliverables

- Monaco adapter hiển thị A2MaTeX source/IR generated.
- Source map selection: node ↔ instruction/code location.
- Runtime logs virtualized, filtered, redacted.
- Node-level breakpoint/pause/step chỉ nếu Runtime capabilities hỗ trợ.
- Command palette và diagnostics/support bundle.

### Acceptance gate

- Chọn failed event dẫn đúng node và code/IR source.
- Large log stream không đóng băng renderer và có truncation marker.
- Debug control hidden/disabled đúng theo capability handshake.

## 10. Phase 6 — Package và publish vertical slice

### Deliverables

- Deterministic package builder + verifier + tamper tests.
- Permission/capability derivation và release diff.
- Signing mode đã chốt, dev/production separation.
- Marketplace auth/profile, create draft, upload progress/retry, submit/status.
- Developer authorization grant để test package.

### Acceptance gate

- Rebuild cùng input cho cùng semantic digest.
- Tampered/unsigned production package bị reject.
- Publish retry idempotent; server issues map vào UI.
- Package không chứa recovery/cache/secret fixture.

## 11. Phase 7 — Hardening và beta readiness

### Deliverables

- Security review/threat mitigations, dependency and license scan.
- Performance tuning theo benchmark 50/200/500+ nodes.
- `electron-builder`/NSIS traditional installer, reviewed EULA, Windows code signing/checksum và
  update channel plan; test artifact installer thật thay vì chỉ `win-unpacked`.
- Release/download page public cho MVP; gated download chỉ thêm khi backend/license requirement đã
  chốt và không thay runtime entitlement check.
- Real-device compatibility matrix và long-run soak tests.
- Crash reporting/telemetry consent, privacy/redaction verification.
- Docs onboarding, sample projects, support diagnostics và rollback plan.

### Acceptance gate

- Release checklist tài liệu 07 pass.
- Không còn P0/P1 security/data-loss issue mở.
- Fresh-machine onboarding hoàn thành sample project/run/build.
- Clean install/custom path/upgrade/reinstall/uninstall giữ hoặc reset onboarding state đúng policy;
  policy version/re-consent và analytics opt-out hoạt động thật.
- Runtime/package compatibility matrix được version hóa và test.

## 12. Workstreams có thể chạy song song

Sau Phase 0, có thể chia:

| Stream | Trọng tâm | Contract chung |
|---|---|---|
| Core/Editor | graph, catalog, compiler, validation | project/node/IR schema |
| Desktop/UI | shell, React Flow, Inspector, state | commands/view models/host API |
| Onboarding/Release | first-run, policy state, workspace setup, installer | policy versions/userData/NSIS/signing |
| Identity/Catalog | auth, token vault, remote DTO, cache/sync | session/catalog/Runtime-version contract |
| Runtime/Device | protocol, process, handlers, ADB | Runtime contract/source map |
| Platform | Marketplace/package/license/auth | package/API/authorization grant |
| Quality/Security | fixtures, CI, E2E, threat tests | schemas/error codes/version matrix |

Mỗi stream không tự tạo DTO trùng; schemas/contracts có owner và review cross-team.

## 13. Release gates xuyên suốt

Không chuyển phase khi:

- contract liên quan còn mơ hồ đến mức UI/adapters phải đoán;
- project data có nguy cơ bị mất/corrupt;
- privileged operation còn chạy trong renderer;
- test fixture không đại diện cho artifact thực;
- error path chỉ được xử lý bằng generic toast;
- breaking schema/protocol change chưa có version/migration/compatibility story.
- auth/catalog contract chưa chốt nhưng implementation đang synthesize node version/port/304 logic.
- onboarding đang coi local flag là legal/server consent hoặc raw renderer path là filesystem authority.

## 14. Definition of MVP complete

- Developer tạo/open/save project và thiết kế workflow bốn node.
- Developer login, nhận remote catalog phù hợp Runtime và tiếp tục authoring bằng last-known-good
  cache khi offline; reconnect bắt buộc revalidate.
- Fresh install hoàn tất onboarding versioned, policy/workspace recovery hoạt động và local flag
  không bypass auth/license.
- Inspector sinh từ schema; validator và Problems dẫn đúng nguồn lỗi.
- IDE compile versioned IR, preflight, chạy/dừng trên Android qua Runtime dùng chung.
- Event/log/error map về node và được redact.
- Crash recovery và migration baseline hoạt động.
- Build package deterministic, verify integrity; production signing/publish có thể nằm trong beta gate nếu Marketplace chưa sẵn sàng nhưng contract không còn giả định ngầm.
- CI/release gates liên quan đều pass và kiến trúc không vi phạm layer boundary.
