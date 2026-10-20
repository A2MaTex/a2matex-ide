# 07 — Security, testing và observability

## 1. Threat model tối thiểu

| Threat | Boundary | Mitigation chính |
|---|---|---|
| Project/path traversal | open/save/assets/package | canonical path, root policy, symlink handling, schema validation |
| Malicious package/archive | install/build/verify | size limits, allow-list, zip-slip protection, digest/signature |
| Renderer compromise | Electron | isolation, no Node integration, narrow IPC, CSP, no remote content |
| IPC abuse | renderer ↔ main | allow-list channel, validate both ends, authorize operation |
| Credential/token theft | login/refresh/IPC/log | token ở main, OS credential store, redact, không persist password |
| Cross-account cache leak | catalog cache | scope theo server/account/Runtime, opaque key, clear/retention policy |
| Malicious catalog schema | API → Inspector/compiler | response limits, schema subset, full validation, keep last-known-good |
| Command injection | Runtime/ADB spawn | no shell strings, fixed executable, typed args, allow-listed handler |
| Device mix-up | Runtime ↔ nhiều emulator | explicit resolved serial, device lock, correlation và concurrency policy |
| Secret leakage | project/log/telemetry | credential references, OS store, redaction, data minimization |
| Untrusted node bundle | catalog/compiler/runtime | signed bundle, capability/permission policy, sandbox or reject executable extensions |
| Marketplace MITM/replay | network/publish | TLS, short-lived token, idempotency, digest binding |
| License bypass/tamper | client/runtime | signed grant bound to artifact/context, trusted verification boundary |
| Resource exhaustion | graph/assets/logs | schema size/depth limits, bounded queues, timeouts/cancellation |
| Onboarding-state tamper | renderer/local config → app guard | main-owned schema validation, atomic state, local flag không thay auth/license/server consent |
| Workspace authority escalation | onboarding picker → filesystem | native picker, canonicalize/revalidate, opaque capability; raw path không authorize IO |
| Installer/supply-chain tamper | download/install/update | HTTPS release channel, checksum, Windows code signing, clean-install verification |
| Misleading/bundled consent | installer/app/website | versioned policy, no pre-check, required và analytics consent tách riêng, server record khi cần |

Threat model phải được review lại trước khi cho third-party nodes hoặc arbitrary expressions/code.

## 2. Electron hardening checklist

- `contextIsolation: true`, `nodeIntegration: false`.
- `sandbox: true` nếu dependencies cho phép; exception phải có ADR.
- `webSecurity: true`; navigation/new-window deny-by-default.
- CSP không dùng `unsafe-eval` ngoài nhu cầu Monaco đã được đánh giá/bundle policy.
- Không load remote web app/content vào privileged renderer.
- Permission request handler deny-by-default.
- Preload expose object đóng, không expose raw Electron primitives.
- IPC sender/frame/origin validation nơi áp dụng.
- DevTools chỉ bật theo build/channel policy.
- Auto-update/code signing của desktop app cần plan riêng trước production.
- Onboarding API nằm trong cùng frozen preload object; không expose dialog/fs primitives hoặc generic
  IPC chỉ để triển khai wizard.

## 3. Input và data safety

- Schema đặt giới hạn string, array, nesting, node/edge count và asset size.
- Expression parser không dùng `eval`/`new Function`.
- HTML/Markdown output sanitize trước render.
- Log payload không render như HTML và có truncation.
- Filename từ project/server không dùng trực tiếp làm OS destination.
- Network URL trong node phải theo permission/policy; chặn local metadata/internal target nếu use case có SSRF risk.
- Executable JSON không được chứa raw ADB command/path/argv. Runtime chỉ dispatch allow-listed
  handler sau schema/permission/capability validation.
- Runtime launch ADB trực tiếp bằng executable + argument array với shell disabled; executable path
  và device serial do trusted adapter resolve, không lấy từ node params.
- Login endpoint và API base URL chỉ dùng HTTPS ở production; không cho response/server redirect đổi
  sang origin không tin cậy.
- Password chỉ sống trong form/IPC request ngắn hạn; không ghi log, cache, crash
  report, Zustand, localStorage hoặc project.
- Access token giữ trong main memory và bị mất khi process kết thúc. Refresh token chỉ persist qua
  OS credential store/keychain, được key theo trusted server + stable account scope; nếu secure
  storage không khả dụng thì fail closed hoặc yêu cầu login lại, không ghi plaintext.
- Refresh-token rotation dùng atomic replace trong credential store. Không log token cũ/mới; không
  giữ nhiều generation ngoài rollback semantics do backend xác nhận.
- Refresh dùng single-flight để nhiều request `401` không replay cùng refresh token. Mỗi request
  gốc retry tối đa một lần; invalid/revoked refresh token phải xóa local credential.
- Network error không đồng nghĩa token invalid và không được xóa refresh token. Logout xóa local
  credential trong `finally` ngay cả khi server revoke timeout.
- Catalog response áp byte limit, node count, schema depth/property count và enum/string limit trước
  normalization/render. Cache chỉ nhận last-known-good response.
- Onboarding state chỉ được main ghi dưới `userData`, có schema/version/size limit và atomic replace.
  Policy HTML/Markdown nếu render phải bundle hoặc fetch từ trusted origin, sanitize và bind exact
  version; renderer không được tự gửi `completed=true` để bypass required fields.
- Default project root được canonicalize/revalidate giống project location. Renderer-facing path chỉ
  để hiển thị; mọi IO tiếp tục yêu cầu capability do main cấp.

## 4. Test pyramid

### Unit — nhanh, đa số

- entities/value objects/invariants;
- graph operations, connection/type/cycle rules;
- node param/property validation;
- migrations/canonical serialization/digest;
- compiler stages/source map;
- application use cases với fake ports;
- reducers/command history/run state projection.
- catalog DTO validation/normalization, cache scope/freshness và reconnect reducer.
- token expiry scheduling, single-flight refresh, retry-once, rotation và invalid-token cleanup.
- onboarding migration, completion invariant, policy-version comparison và analytics preference.

### Contract

- `ProjectRepository` adapters cùng một behavior suite;
- preload/main IPC DTO schemas và error mapping;
- Runtime handshake/start/event/cancel;
- Marketplace draft/upload/status;
- auth login/refresh/logout và catalog 200/304/401/invalid payload;
- login/refresh response luôn có cả access/refresh token; refresh rotation và revoke semantics;
- catalog cache atomic replace/corrupt entry/cross-account isolation;
- onboarding repository atomic replace/corrupt-state recovery và preload/main DTO schemas;
- package build/verify/install consumer.

### Component

- schema Inspector controls và validation mapping;
- palette search/drag intent;
- custom node visual states;
- Problems navigation;
- loading/error/disconnected states;
- shortcut focus guards.
- login validation/error mapping, route guard hydration và offline/catalog status states.
- onboarding step validation, required/optional consent separation, guard hydration và focus order.

### Integration

- Electron main save/open atomic behavior trong temp workspace;
- Runtime process supervision với fake executable/server;
- Runtime ADB adapter với fake binary: exact argv, explicit device target, exit-code mapping,
  timeout/cancel/cleanup và command-injection payload;
- multi-emulator routing/locking và unauthorized/offline/boot-readiness transitions;
- build package + tamper verification;
- migration project fixtures;
- auth/publish adapter bằng mock server.
- token không xuất hiện ở preload response/log; online event dedupe và refresh-token retry-once.
- credential-store restart restore, unavailable-store fail-closed và logout cleanup dù revoke lỗi.
- onboarding state restart restore, invalid/unwritable workspace và policy manifest update.

### E2E

1. Create → add/connect/configure → save → reopen.
2. Invalid workflow → Problems → navigate/fix → valid.
3. Fake device → run → node highlights/log → stop.
4. Runtime crash/disconnect → truthful recovery UX.
5. Build → verify → publish draft against test server.
6. Recovery draft after simulated renderer/app crash.
7. Login → đóng/mở app → silent refresh → vào workspace không hiện login → catalog sync.
8. Restart offline dùng cache, giữ refresh token → reconnect silent refresh → palette cập nhật.
9. Refresh token expired/revoked → credential bị xóa → login; network timeout không được logout.
10. Cache miss khi offline → blocking state; switch account không thấy catalog account cũ.
11. Fresh install → Welcome/Policies/Workspace/Finish → login/projects; restart không lặp onboarding.
12. Policy version material change → review lại; từ chối/cancel không bị ghi accepted/completed.
13. Workspace bị di chuyển/xóa hoặc mất quyền → recovery picker; project khác không bị xóa/ghi đè.
14. Windows installer thật: clean install/custom path/upgrade/reinstall/uninstall và first launch.

E2E device thật nằm trong hardware validation lane riêng vì độ ổn định/tốc độ.

## 5. Required fixtures

```text
tests/fixtures/
├── projects/
│   ├── minimal-valid/
│   ├── invalid-references/
│   ├── old-schema-v1/
│   └── unsupported-new-schema/
├── workflows/
│   ├── four-node-happy-path.json
│   ├── invalid-cycle.json
│   └── incompatible-port.json
├── runtime/
│   ├── event-stream.jsonl
│   └── capabilities.json
├── catalog/
│   ├── valid-response.json
│   ├── malformed-schema.json
│   ├── incompatible-runtime.json
│   └── cache-v1.json
├── packages/
│   ├── valid/
│   ├── tampered/
│   └── malicious-path/
├── onboarding/
│   ├── fresh-v1.json
│   ├── completed-v1.json
│   ├── outdated-policy-v1.json
│   └── corrupt.json
└── policies/
    └── manifest-v1.json
```

Fixture có schema version và purpose README; golden update phải được review như contract change.

## 6. Quality gates

Mỗi pull request:

```text
format/check
lint
typecheck
unit + component
architecture/import-boundary check
build web/electron relevant target
```

Main/nightly:

```text
contract + integration
Electron E2E
dependency/license/security scan
package reproducibility/tamper suite
performance smoke benchmark
```

Release candidate:

```text
Windows clean-install smoke
NSIS EULA/version/custom-install-path smoke
first-run/re-consent/workspace-recovery smoke
real Android device matrix smoke
upgrade/migration/recovery
desktop code-sign/update checks
Runtime + package compatibility matrix
security checklist and open-risk review
```

Repository hiện đã có `test`, `typecheck`, `build:web`, `build:electron`, `build:desktop` và Electron
E2E scripts. Chưa có pipeline đóng gói/phát hành bằng `electron-builder`/NSIS; phải bổ sung và chạy
Windows installer lane thật trước RC, không coi `build:desktop` hiện tại là installer artifact.

## 7. Coverage và test policy

- Không dùng coverage % làm tiêu chí duy nhất; ưu tiên invariant/branch/error/race quan trọng.
- Domain/compiler/migration/package security code cần branch coverage cao và mutation/golden testing khi phù hợp.
- Không mock domain trong presentation test; dùng fixture/view model thật nhỏ.
- Không phụ thuộc timing sleep trong runtime test; dùng controllable clock/event harness.
- Mỗi bug production cần regression test ở layer thấp nhất có thể tái hiện.

## 8. Structured logging

Log envelope nội bộ:

```ts
export interface LogRecord {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  component: string;
  event: string;
  correlationId?: string;
  projectId?: string;
  runId?: string;
  fields?: Record<string, JsonValue>;
}
```

- Renderer/main/Runtime correlation qua `requestId`, `runId`, build/publish job ID.
- Redaction trước persistence/export, không chỉ trước render.
- Header `Authorization`, password, access token và refresh token bị redact theo key lẫn
  value-pattern; test dùng sentinel secret để chứng minh không lọt qua logger/support bundle.
- Catalog log chỉ ghi hash/freshness/count/duration/error code; không log toàn response/schema.
- Local logs có rotation/size/retention limit.
- User content, node params, path và device ID mặc định không gửi telemetry.

## 9. Metrics và diagnostics

Metrics hữu ích không chứa nội dung automation:

- project open/save/build duration và failure code;
- validation duration + issue count;
- canvas size/performance bucket;
- Runtime start latency, disconnect/crash count;
- publish stage duration/retry/failure code;
- app crash/unhandled rejection.

Telemetry là opt-in/consent theo policy, có schema, retention và ability to disable. Không ghi access token, credential, raw workflow, screenshot hoặc raw device serial.

`analyticsOptIn=false|null` phải thực sự giữ analytics pipeline tắt, không chỉ đổi label trong
Settings. Event về onboarding không chứa raw workspace path, policy body hoặc identity; consent
change nếu cần audit phải đi qua contract riêng với version/timestamp và retention đã duyệt.

## 10. Performance validation

- Synthetic projects 50/200/500/1000 nodes để xác định degradation curve.
- Measure open, map-to-canvas, single edit validation, save, compile và memory.
- Virtualize explorer/problems/log lists khi threshold đạt.
- Compiler/validation nặng chuyển worker/process nếu profiling chứng minh main thread block.
- Performance regression budget nằm trong CI/nightly; target ở tài liệu 01 được điều chỉnh bằng baseline thực.

## 11. Security/testing definition of done

- Threat table có owner/status trước Runtime/device production access.
- IPC fuzz/invalid payload không crash main hoặc thực hiện operation.
- Malicious path/archive/package fixtures bị reject.
- Secret redaction có unit + integration test.
- Core E2E chạy ổn định trên Windows CI hoặc môi trường tương đương đã chốt.
- Support bundle được preview và không chứa secret fixture.
- Offline cache không dùng chéo scope; invalid catalog không overwrite last-known-good.
- Local onboarding flag không bypass auth/license; state corrupt, policy update và workspace mất
  quyền đều có recovery test không gây mất project.
- Release candidate Windows verify signature/checksum và hành vi của installer thật, không chỉ chạy
  app từ source hoặc `win-unpacked`.
