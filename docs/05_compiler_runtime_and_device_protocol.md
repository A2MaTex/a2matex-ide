# 05 — Compiler, Runtime và device protocol

## 1. Mục tiêu ranh giới Runtime

Studio và Desktop Client gửi cùng một executable artifact/IR đến cùng Runtime contract. Studio có thêm authoring/debug UX, nhưng không có execution semantics riêng.

```text
Workflow source
  → validate
  → normalize
  → compile IR
  → compatibility/preflight
  → Runtime start
  → Android adapter
  → ordered Runtime events
```

### 1.1 JSON nào được đưa vào Runtime

`JSON` chỉ là encoding; cần phân biệt rõ hai contract:

- **Authoring JSON**: `a2matex.project.json` và `*.workflow.json`, chứa source/layout/metadata để
  Studio mở và chỉnh sửa.
- **Executable IR JSON**: output đã validate/normalize/compile, chỉ chứa dữ liệu Runtime cần để thực
  thi, có `irVersion`, compatibility, handler, digest và source map.

Mặc định đề xuất là Studio gửi **Executable IR JSON**, không gửi nguyên project folder/workflow JSON
để Runtime tự diễn giải. Nếu product quyết định Runtime nhận authoring JSON trực tiếp thì compiler,
catalog resolution và validation authoritative phải chuyển vào Runtime; đây là breaking architecture
decision cần ADR/contract test, không chỉ đổi tên file.

Runtime phải parse và validate lại executable JSON tại trust boundary trước execution. Runtime không
tin rằng file do Studio tạo luôn hợp lệ, và không thực thi field không thuộc schema/version hỗ trợ.

### 1.2 Ownership boundary

| Studio/compiler                            | Runtime                                                         | ADB/emulator                      |
| ------------------------------------------ | --------------------------------------------------------------- | --------------------------------- |
| Validate source và compile executable JSON | Validate IR, resolve handler và quản lý run                     | Cung cấp device transport/process |
| Chọn logical `deviceId`, gửi start/stop    | Map `deviceId` sang transport identity                          | Trả state/output/exit code        |
| Hiển thị event/error/source mapping        | Discovery, authorization, locking, timeout, retry, cancellation | Không hiểu workflow/project       |
| Không tạo raw ADB command                  | Sở hữu ADB adapter và process invocation                        | Không được renderer gọi trực tiếp |

Studio không gửi chuỗi lệnh shell/cmd trong JSON. Node chỉ mang `handler` đã allow-list và params có
schema; Runtime quyết định command/argv tương ứng.

## 2. Compiler stages

1. **Resolve**: load workflow, node definition/version và referenced assets/subworkflows.
2. **Validate**: schema, graph, permissions, capabilities, entrypoint.
3. **Normalize**: defaults, canonical IDs/order, expression representation.
4. **Lower**: chuyển graph thành Runtime IR instructions/control flow.
5. **Optimize (safe only)**: bỏ dữ liệu layout, precompute constants; không đổi observable semantics.
6. **Emit**: IR + source map + required handlers/capabilities + digest.

Compiler phải pure/deterministic với input đã resolve. IO nằm ngoài compiler core.

## 3. IR envelope đề xuất

```ts
export interface ExecutableIr {
  irVersion: number;
  compilerVersion: string;
  catalogHash: string;
  projectId: string;
  projectVersion: string;
  entrypoint: string;
  requiredRuntime: string;
  requiredCapabilities: string[];
  permissions: PermissionDeclaration[];
  instructions: RuntimeInstruction[];
  sourceMap: Record<string, SourceReference>;
  digest: string;
}

export interface RuntimeInstruction {
  id: string;
  handler: string;
  handlerVersion: number;
  params: Record<string, JsonValue>;
  next: RuntimeTransition[];
}

export interface SourceReference {
  workflowId: string;
  nodeId: string;
  propertyPath?: string;
}
```

IR thực tế có thể khác, nhưng phải giữ version, catalog revision, required capabilities, stable
instruction ID, source map và digest. File phải có byte/node/depth limits; digest được verify trước
run và không bao gồm layout/editor-only state.

## 4. Runtime handshake

Trước run, client lấy:

```ts
export interface RuntimeCapabilities {
  protocolVersion: number;
  runtimeVersion: string;
  supportedIrVersions: number[];
  handlers: Array<{ name: string; versions: number[] }>;
  features: {
    pause: boolean;
    step: boolean;
    breakpoints: boolean;
    hotReload: boolean;
  };
  deviceTransports: string[];
}
```

Compatibility là explicit check; không bắt đầu run rồi mới hy vọng Runtime hiểu artifact.

## 5. Start request và execution identity

```ts
export interface StartRunRequest {
  requestId: string; // idempotency/correlation
  artifact: ExecutableIrReference;
  entrypoint: string;
  deviceId: string;
  variables: Record<string, JsonValue>;
  credentialBindings: Record<string, CredentialReference>;
  debug: { enabled: boolean; breakpoints?: string[] };
}
```

- Runtime cấp `runId`; mọi event mang `runId` + monotonic `sequence`.
- Retry `start` cùng `requestId` không tạo duplicate run nếu request trước đã được nhận.
- Credential reference được resolve tại trusted boundary; log/event không chứa secret value.

### 5.1 Development partial run

`Run selected node` và `Run from here` là mode development riêng, không giả thành full workflow.
Request phải mang immutable compiled revision, selected instruction, pinned/mock inputs đã validate
và explicit `developmentPartialRun=true`. Runtime vẫn kiểm capability, permission, device lock,
timeout và handler schema. Full run từ entrypoint là bằng chứng authoritative cho publish.

## 6. Run state machine

```text
created → preparing → running ──→ succeeded
                        │  ├────→ failed
                        │  ├────→ cancelling → cancelled
                        │  └────→ paused → running
                        └───────→ disconnected/unknown
```

Rules:

- `stop` là request cancellation; terminal state chỉ đến từ Runtime event/confirmed timeout policy.
- Mất transport đưa UI về `unknown`, không tự suy ra failed/cancelled.
- Reconnect dùng `runId` + last sequence để resume/query snapshot nếu protocol hỗ trợ.
- Terminal event immutable; event trễ/duplicate được xử lý theo sequence/idempotency.

## 7. Runtime events

```ts
export type RuntimeEvent =
  | RunStateChanged
  | NodeExecutionStarted
  | NodeExecutionCompleted
  | NodeExecutionFailed
  | RuntimeLogEmitted
  | RuntimeMetricEmitted
  | DeviceStateChanged;

export interface RuntimeEventBase {
  runId: string;
  sequence: number;
  occurredAt: string;
  correlationId?: string;
}
```

Node event cần `instructionId`; Studio dùng source map để map về node. Payload có size limit, typed encoding và redaction metadata.

Node execution event tối thiểu còn có `nodeExecutionId`, attempt, duration, selected transition,
`iteration?` và artifact reference. Input/output/variable diff chỉ được gửi theo debug policy,
có type, truncation và redaction. `sequence` luôn tăng kể cả khi loop quay lại cùng instruction.

## 8. Error contract

Error code namespace gợi ý:

```text
COMPILER_*       invalid source/IR emit
RUNTIME_*        protocol/process/execution
DEVICE_*         discovery/offline/unauthorized/capability
HANDLER_*        node handler failure
PERMISSION_*     undeclared/denied
ASSET_*          missing/integrity/size
```

Error DTO:

```ts
export interface RuntimeFailure {
  code: string;
  message: string;
  instructionId?: string;
  details?: Record<string, JsonValue>;
  retryable: boolean;
  remediation?: string;
}
```

Runtime message là mô tả, code là contract. UI không branch theo chuỗi message.

## 9. Device lifecycle

```text
unknown → discovered → authorizing → ready → busy
              │              │         │
              └──────────────┴─────────→ offline
```

`DeviceDescriptor` tối thiểu:

- stable session ID và transport ID đã sanitize;
- display name/model/Android version;
- connection/authorization state;
- capabilities (input, screenshot, accessibility nếu có);
- active run/busy state;
- last seen timestamp.

Studio không chạy raw arbitrary ADB command từ node params. Android actions map sang allow-listed Runtime handlers với validated arguments.

### 9.1 Runtime-owned ADB adapter

Runtime chịu trách nhiệm:

- tìm và verify ADB binary/version theo platform;
- discovery bằng machine-readable parsing của `adb devices -l`, không parse output bằng regex mơ
  hồ nếu ADB có format/version khác;
- map raw serial thành session-safe `deviceId`; serial chỉ dùng nội bộ và bị redact trong log;
- với nhiều emulator/device, luôn target explicit transport (`-s <serial>` hoặc API tương đương),
  không chọn “device đầu tiên”;
- quản lý state `offline`, `unauthorized`, `device`, disconnect/reconnect và authorization;
- serialize/lock operation theo device hoặc công bố concurrency policy;
- áp timeout/cancellation, giới hạn stdout/stderr và map exit code thành stable `DEVICE_*` hoặc
  `HANDLER_*` error;
- dọn child process khi cancel/run kết thúc/Runtime shutdown.

Runtime nên spawn executable trực tiếp với argument array và `shell=false` (hoặc API tương đương),
không ghép chuỗi rồi gọi `cmd.exe /c`, shell, `exec` hay `eval`. Ví dụ conceptual:

```text
handler: android.tap
validated params: { x: 100, y: 200 }
runtime argv: ["-s", resolvedSerial, "shell", "input", "tap", "100", "200"]
```

Đây là mapping nội bộ của signed/allow-listed handler; workflow JSON không được chứa
`adbCommand`, executable path hoặc raw argv. Nếu một handler cần shell syntax trên Android, Runtime
phải dùng fixed command template + typed/escaped arguments, không nối trực tiếp user input.

### 9.2 Emulator readiness

`adb state=device` chưa đủ kết luận emulator sẵn sàng chạy automation. Runtime cần readiness probe
có timeout, tối thiểu phân biệt:

```text
discovered
  → adb transport ready
  → Android boot completed
  → required package/service/accessibility ready
  → automation ready
```

Runtime phát `DeviceStateChanged` cho từng bước hoặc error code ổn định. Studio chỉ render trạng
thái/remediation; Studio không tự polling ADB. Emulator launch/stop có thể là adapter riêng nếu
Runtime sở hữu, và phải được capability handshake báo rõ thay vì mặc định mọi device đều do Runtime
khởi động.

## 10. Runtime transport adapter

Application chỉ biết `RuntimeClient`. Infrastructure có thể triển khai:

- local child process + stdio framed messages;
- localhost gRPC/WebSocket/HTTP stream;
- named pipe/domain socket;
- fake/in-memory Runtime cho test.

Tiêu chí chọn transport:

- bidirectional streaming và cancellation;
- message framing/size limits;
- process ownership/restart policy;
- authentication nếu không phải private pipe;
- Windows support là bắt buộc theo project docs;
- code generation/tooling và compatibility strategy.

Transport cuối cùng đang `OPEN`; không hard-code transport primitives vào use case.

## 11. Process supervision

Nếu Studio khởi động Runtime local:

- verify binary/version/integrity trước spawn;
- truyền config qua file/pipe có permission phù hợp, không command line chứa secret;
- capture stdout/stderr theo bounded buffer;
- readiness handshake có timeout;
- graceful stop trước force termination;
- crash loop backoff và diagnostics;
- không để orphan process sau app exit ngoài policy.

## 12. Debug và test semantics

Phase đầu cần full run, node-level trace/highlight, chạy node đơn lẻ và `Run from here`. Pause,
step và breakpoint chỉ bật khi handshake báo support.

- Partial run chỉ dùng pinned output/mock input đã validate và luôn có cảnh báo khác full run.
- Breakpoint lưu trong workspace/debug config, không đổi production workflow mặc định.
- Inspect input/output hiển thị type, duration, retry, selected branch, sequence/iteration,
  truncation và secret redaction.
- Edit trong lúc paused không hot-reload trừ khi capability và semantics được đặc tả.
- Re-run dùng immutable compiled revision; UI hiển thị nếu working copy đã khác.
- Một device execution chạy control flow tuần tự. Multi-device smoke tạo các run độc lập, mỗi run có
  device lock, input profile và event sequence riêng.

## 13. Contract testing

- Golden compiler fixtures cho bốn built-in nodes.
- Consumer contract test chạy cùng suite cho fake Runtime và Runtime thật.
- Compatibility test cho supported/unsupported protocol, IR và handler versions.
- Event ordering, duplicate, gap, reconnect và cancellation race tests.
- Device unauthorized/offline giữa run và Runtime crash tests.
- Executable JSON malformed/unsupported/tampered bị reject trước khi gọi ADB.
- Fake ADB executable ghi nhận argv để chứng minh handler mapping đúng, `shell=false`, timeout và
  cancellation dọn process.
- Hai emulator đồng thời không bị gửi nhầm serial; device lock/concurrency policy được test.
- Readiness test bao phủ boot chưa xong, unauthorized, offline, disconnect và reconnect.
- Studio-built package chạy smoke test qua Runtime entry point giống Desktop Client.

## 14. Runtime vertical slice definition of done

- `start → delay → tap → log` compile thành IR ổn định.
- Preflight chặn thiếu device/permission/handler trước execution.
- Runtime nhận versioned executable JSON, validate digest/schema rồi mới dispatch allow-listed
  handler sang đúng emulator.
- Start/stop và event stream qua Electron boundary, renderer không spawn process.
- Không có raw ADB command từ project/node params; ADB process luôn do Runtime sở hữu và được
  timeout/cancel/cleanup.
- Node running/success/failure map đúng source node.
- Disconnect/crash cho trạng thái trung thực và hướng phục hồi.
- Cùng fixture artifact chạy được từ Studio harness và Desktop Client/consumer harness.
