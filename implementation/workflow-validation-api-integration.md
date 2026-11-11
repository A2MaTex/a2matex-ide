# Workflow Validation API Integration Plan

Status: Implemented  
Date: 2026-11-11  
Updated: 2026-11-11 — Phases 1–4 implemented; Phase 5 compatibility decision recorded  
Scope: A2MaTeX Studio desktop editor

## 0. Implementation snapshot

- Implemented strict request/response schemas, diagnostic codes, status consistency checks and the
  1 MiB client preflight.
- Implemented Axios adapter, one-time authentication refresh/retry, trusted IPC handler, preload API
  and Electron bootstrap registration. Access tokens remain in Electron main.
- Implemented revision-aware `save local -> encode saved active workflow -> validate` orchestration.
  Save failure and pending Node Config drafts stop the request.
- Implemented toolbar/Action List Validate actions and Diagnostics states for progress, all three
  engine statuses, transport/save errors, stale results, truncation and node/edge navigation.
- Kept Problems as the local validator and kept server validation results session-only.
- Phase 5 decision: do not reduce the persisted local schema from 5.000/10.000 nodes or ID length 128
  in this change, because doing so would make existing local projects fail to open. Backend limit and
  contract diagnostics remain visible in Diagnostics; a future migration must precede any persisted
  schema tightening.
- Verification: 12 Vitest tests pass; typecheck, ESLint and desktop production build pass. The global
  Prettier check still reports eight unrelated pre-existing files; all files changed by this feature
  were formatted.

## 1. Mục tiêu

Thêm action **Validate** vào Workflow Editor với luồng bắt buộc:

```text
Validate
  -> bảo đảm graph không còn form draft chưa commit
  -> save project vào local thành công
  -> đọc lại đúng workflow ở saved revision
  -> encode thành Editor Graph
  -> POST /api/v1/workflow-validation
  -> hiển thị kết quả hoặc lỗi tại tab Diagnostics
```

Không gọi validation API nếu local save thất bại. Kết quả API phải gắn với đúng
`project + workflowPath + savedRevision`; response của revision cũ không được hiển thị như kết quả
hiện tại sau khi user sửa graph.

## 2. Đánh giá độc lập và các giả định cần khóa

### 2.1 Các giả định trong yêu cầu

1. “Workflow vừa được save” là workflow đang active trong tab editor, không phải tất cả workflow
   trong project và cũng không mặc định là entry workflow.
2. Nút Validate chỉ chạy theo thao tác user; không tự gọi API sau mỗi edit/autosave.
3. Tab **Problems** tiếp tục hiển thị validator local để phản hồi tức thời. Tab **Diagnostics** hiển
   thị validator authoritative từ backend và lỗi của lần gọi API.
4. Kết quả validation chỉ cần giữ trong UI session ở phase này. Yêu cầu chưa nói phải persist response
   vào `draftState.validationSummary`.
5. Local save chỉ persist committed Editor Graph. Nó không được tự động lấy raw value từ một Node
   Config form chưa nhấn Save.

Nếu product muốn validate entry workflow thay vì active workflow, hoặc muốn validate toàn bộ project,
contract hiện tại không đủ để suy ra điều đó; cần đổi rõ selector/payload trước khi triển khai.

### 2.2 Những điểm cần sửa so với cách hiểu đơn giản

- Giới hạn `2mb` chỉ là giới hạn JSON transport của Express. Validation engine còn áp giới hạn nhỏ
  hơn cho riêng `editorGraph`: **1,048,576 bytes (1 MiB)**. Vì vậy không thể mô tả 2 MB là kích thước
  graph được hỗ trợ.
- HTTP `200` chỉ có nghĩa thao tác validation chạy thành công. Client phải branch theo
  `data.status`: `VALID`, `VALID_WITH_WARNINGS`, hoặc `INVALID`.
- `422` của outer envelope là lỗi request/client integration; nó không phải workflow `INVALID` và
  không có diagnostic engine.
- Studio hiện cho phép tối đa 5.000 nodes/10.000 edges trong local document, trong khi backend chỉ
  nhận tối đa 500/1.000 cho validation. Đây là contract gap có thật; Diagnostics phải giải thích giới
  hạn backend thay vì để user hiểu nhầm là lỗi mạng.
- Local schema cho ID dài tới 128 ký tự, backend Editor Graph chỉ nhận tối đa 100. Phase tích hợp phải
  hiển thị `EDITOR_GRAPH_CONTRACT_INVALID`; phase hardening nên đồng bộ giới hạn authoring để ngăn
  graph không thể validate.
- Studio có trạng thái node `disabled`, nhưng backend Editor Graph hiện không có field tương ứng và
  encoder đang loại field này. Vì vậy backend vẫn kiểm tra node disabled như node bình thường. Không
  được mô tả Diagnostics là đã validate semantics “bypass disabled node” cho đến khi contract hai bên
  hỗ trợ rõ ràng.
- Nếu Node Config drawer/detail đang có draft chưa commit, `flushLocalSave()` hiện không thể biến draft
  đó thành graph. Tự commit khi bấm Validate có nguy cơ ghi dữ liệu invalid hoặc trái ý user. Hướng an
  toàn là chặn Validate, mở/giữ editor liên quan và yêu cầu **Save** hoặc **Discard** draft trước; sau
  đó Validate mới tự save project local.

## 3. Contract HTTP cần implement

### 3.1 Request

```http
POST /api/v1/workflow-validation
Authorization: Bearer <access-token>
Content-Type: application/json
Accept: application/json
```

Body phải có đúng một top-level field:

```json
{
  "editorGraph": {
    "schemaVersion": 1,
    "entryNodeId": "start_01",
    "nodes": [
      {
        "id": "start_01",
        "type": "flow.start",
        "config": {},
        "bindings": {},
        "errorPolicy": "STOP",
        "editor": { "x": 0, "y": 0 }
      },
      {
        "id": "end_01",
        "type": "flow.end",
        "config": {},
        "bindings": {},
        "errorPolicy": "STOP",
        "editor": { "x": 100, "y": 0 }
      }
    ],
    "edges": [
      {
        "id": "edge_01",
        "sourceNodeId": "start_01",
        "sourcePort": "success",
        "targetNodeId": "end_01"
      }
    ]
  }
}
```

Phải tái sử dụng `encodeWorkflowDocument(workflow)` trong
`src/domain/project/project-schema.ts`; không dựng một serializer thứ hai. Encoder hiện tại đã bỏ các
field Studio-only (`name`, `labelMode`, `disabled`, `inputSchema`, `targetPort`) và sinh đúng graph
shape backend yêu cầu. Lỗi encode, ví dụ edge có non-default `targetPort`, phải trở thành client
preparation error trong Diagnostics và không gửi request sai.

Bearer token chỉ được lấy và gắn trong Electron main process. Renderer/preload không nhận access token.

### 3.2 Success envelope

Parse strict response bằng Zod:

```ts
type WorkflowValidationStatus = 'INVALID' | 'VALID_WITH_WARNINGS' | 'VALID';

interface WorkflowValidationDiagnostic {
  code:
    | 'EDITOR_GRAPH_CONTRACT_INVALID'
    | 'GRAPH_SCHEMA_VERSION_UNSUPPORTED'
    | 'NODE_ID_DUPLICATED'
    | 'EDGE_ID_DUPLICATED'
    | 'START_NODE_COUNT_INVALID'
    | 'ENTRY_NODE_INVALID'
    | 'END_NODE_UNREACHABLE'
    | 'EDGE_SOURCE_NODE_NOT_FOUND'
    | 'EDGE_TARGET_NODE_NOT_FOUND'
    | 'EDGE_SOURCE_PORT_NOT_FOUND'
    | 'END_NODE_HAS_OUTGOING_EDGE'
    | 'NODE_UNREACHABLE'
    | 'GRAPH_CYCLE_DETECTED'
    | 'NODE_TYPE_NOT_ACTIVE'
    | 'NODE_CONFIG_INVALID'
    | 'NODE_ERROR_POLICY_INVALID'
    | 'NODE_BINDINGS_INVALID'
    | 'NODE_VALUE_BINDING_INVALID'
    | 'SWITCH_PORT_EDGE_COUNT_INVALID'
    | 'GRAPH_NODE_LIMIT_EXCEEDED'
    | 'GRAPH_EDGE_LIMIT_EXCEEDED';
  message: string;
  nodeId?: string;
  edgeId?: string;
  path: Array<string | number>;
}

interface WorkflowValidationOutput {
  status: WorkflowValidationStatus;
  errors: WorkflowValidationDiagnostic[];
  warnings: WorkflowValidationDiagnostic[];
  truncated: boolean;
}

interface WorkflowValidationResponse {
  data: WorkflowValidationOutput;
  statusCode: 200;
}
```

Không tự tính lại status từ HTTP code. Có thể kiểm tra consistency để bắt invalid response:

- `VALID` phải không có error/warning;
- `VALID_WITH_WARNINGS` phải không có error và có ít nhất một warning;
- `INVALID` phải có ít nhất một error.

Nếu backend về sau bổ sung diagnostic code, strict enum sẽ biến response thành
`WORKFLOW_VALIDATION_INVALID_RESPONSE`. Đây là lựa chọn an toàn nhưng cần cập nhật Studio cùng contract;
không silently bỏ diagnostic chưa biết.

### 3.3 Error mapping

Error response backend có dạng `{ statusCode, message, details? }`; `message` có thể là string hoặc
array issue của Zod. Chuẩn hóa thành error model của Studio, không render raw Axios error/stack/token.

| HTTP/tình huống | Studio error code | Hành vi UI |
| --- | --- | --- |
| Không có session/token | `WORKFLOW_VALIDATION_SESSION_REQUIRED` | Báo cần đăng nhập lại, không gửi request |
| `401` sau một lần refresh/retry | `WORKFLOW_VALIDATION_SESSION_EXPIRED` | Báo session hết hạn |
| `403` | `WORKFLOW_VALIDATION_FORBIDDEN` | Báo authentication/account policy từ chối; không gọi đây là RBAC route permission |
| `413` | `WORKFLOW_VALIDATION_PAYLOAD_TOO_LARGE` | Nêu rõ graph vượt 1 MiB hoặc toàn request vượt 2 MB |
| `422` | `WORKFLOW_VALIDATION_INVALID_REQUEST` | Hiển thị lỗi integration/envelope; không gắn nhãn workflow invalid |
| timeout | `WORKFLOW_VALIDATION_TIMEOUT` | Cho phép Retry; không xoá kết quả thành công trước đó |
| offline/network | `WORKFLOW_VALIDATION_NETWORK_UNAVAILABLE` | Cho phép Retry |
| `5xx` | `WORKFLOW_VALIDATION_SERVER_ERROR` | Cho phép Retry, không leak response nội bộ |
| `200` nhưng response parse fail | `WORKFLOW_VALIDATION_INVALID_RESPONSE` | Báo contract mismatch |
| encode/preflight fail | `WORKFLOW_VALIDATION_PREPARATION_FAILED` | Không gọi API; chỉ rõ graph/path liên quan |

API client nên preflight `Buffer.byteLength(JSON.stringify(editorGraph), 'utf8')` với giới hạn 1 MiB
để trả lỗi nhanh, nhưng backend vẫn là nguồn quyết định cuối cùng.

## 4. Kiến trúc tích hợp

Giữ network và token ngoài renderer, theo boundary hiện có:

```text
MainWorkflowPage / useWorkflowValidation
  -> flushLocalSave()
  -> đọc lại project store và encode saved workflow
  -> window.studioHost.workflowValidation.validate({ editorGraph })
  -> preload IPC
  -> trusted IPC handler
  -> auth-aware service trong Electron main
  -> Axios API adapter
  -> POST /api/v1/workflow-validation
```

### 4.1 Application contract

Tạo `src/application/workflow-validation/workflow-validation.ts`:

- request/output/diagnostic types và Zod schemas dùng ở trust boundary;
- `WorkflowValidationErrorCode` và `WorkflowValidationError`;
- `WorkflowValidationClient.validate(editorGraph)`;
- không import React, Electron hoặc Axios.

### 4.2 Electron main API và authentication

Tạo:

- `electron/main/api/workflow-validation.api.ts` để gửi POST, set JSON headers, parse strict success
  envelope và map HTTP/network errors;
- `electron/main/workflow-validation/create-workflow-validation-service.ts` để lấy access token qua
  `MainAuthSession`;
- `electron/main/ipc/register-workflow-validation-handlers.ts` để validate IPC input, kiểm tra trusted
  sender và trả `HostResult`;
- channel `studio:workflow-validation:validate` trong `electron/shared/channels.ts`.

Authentication flow:

1. Gọi `auth.getValidAccessToken()` trước request.
2. Nếu không có token, trả session-required.
3. Nếu server trả `401`, gọi `auth.refreshAccessToken()` và retry đúng **một lần**.
4. Nếu vẫn `401`, trả session-expired; không loop retry.

Đăng ký service/handler trong `electron/main/bootstrap.ts` bằng cùng `auth` instance đang dùng cho Node
Catalog và Cloud Project.

### 4.3 Preload và renderer contract

Cập nhật:

- `electron/preload/index.cts` với `workflowValidation.validate(input)`;
- `src/infrastructure/electron/studio-host-api.ts` với typed `HostResult`;
- global `window.studioHost` type hiện có sẽ tự nhận contract mới.

IPC chỉ nhận plain JSON `{ editorGraph }`. Handler phải reject array, function, `undefined`, extra
top-level fields và payload không serialize được trước khi gọi remote API.

## 5. Orchestration Save-then-Validate

Tách logic ra `src/presentation/features/workflow-editor/useWorkflowValidation.ts` hoặc controller tương
đương, thay vì nhồi thêm network state vào `MainWorkflowPage.tsx`.

State tối thiểu:

```ts
type ValidationRunState =
  | { phase: 'idle' }
  | { phase: 'saving'; projectId: string; workflowPath: string }
  | { phase: 'validating'; projectId: string; workflowPath: string; revision: number }
  | {
      phase: 'completed';
      projectId: string;
      workflowPath: string;
      revision: number;
      output: WorkflowValidationOutput;
      stale: boolean;
    }
  | {
      phase: 'failed';
      projectId: string;
      workflowPath: string;
      revision?: number;
      error: HostError<WorkflowValidationErrorCode>;
    };
```

Trình tự khi click **Validate**:

1. Chuyển bottom panel sang tab `diagnostics` ngay để user thấy progress.
2. Nếu có `pendingNodeConfigurationId`, dừng và hướng dẫn Save/Discard Node Config; không tự commit.
3. Disable Validate để không có hai run đồng thời; tạo `requestId` tăng dần cho run mới.
4. Gọi `flushLocalSave()`.
5. Nếu trả `false`, đặt phase `failed` với local-save error và **không gọi API**.
6. Sau `await`, đọc lại state mới nhất từ project store API; không dùng `session/workflow` closure đã
   capture trước save.
7. Chỉ tiếp tục khi `workingRevision === savedRevision`. Lấy workflow theo đúng `workflowPath`, chạy
   `encodeWorkflowDocument`, clone thành JSON và ghi nhận `revision = savedRevision`.
8. Gửi `{ editorGraph }` qua `window.studioHost.workflowValidation.validate`.
9. Chỉ nhận response nếu `requestId`, project ID và workflow path còn khớp run đang active.
10. Nếu user edit graph trong lúc request chạy, vẫn hiển thị response nhưng đánh dấu **Outdated —
    validated revision N; current revision M**. Không được hiển thị `VALID` như trạng thái hiện tại.
11. Nếu project đóng/đổi trong lúc chờ, bỏ response khỏi UI của project mới.

Action không phụ thuộc vào việc graph có local Problems hay không: backend phải được phép trả batch
diagnostic authoritative. Tuy nhiên client preparation/serialization failure vẫn chặn request.

## 6. Diagnostics UI

Refactor `ProblemsPanel.tsx` hoặc tách `WorkflowDiagnosticsPanel.tsx`. Props của panel nhận validation
run state thay vì dùng `issues.length` để giả lập “Validation ready/blocked” như hiện tại.

### 6.1 Header và action

- Thêm nút **Validate** ở toolbar editor, cạnh Save/Run; icon và label phải thể hiện
  `Saving…`/`Validating…`.
- Thêm action tương đương vào `WorkflowActionList` để dùng keyboard.
- Tab label hiển thị count của server diagnostics sau run, ví dụ `Diagnostics (3)`.
- Validate tự mở tab Diagnostics; user vẫn có thể chuyển tab trong lúc request chạy.

### 6.2 Nội dung theo trạng thái

- `idle`: “Workflow has not been validated on the server.”
- `saving`: spinner/status “Saving locally before validation…”.
- `validating`: “Validating saved revision N…”.
- `VALID`: success summary, revision và “0 errors, 0 warnings”.
- `VALID_WITH_WARNINGS`: warning summary và list warnings.
- `INVALID`: error summary, errors trước warnings, giữ đúng stable order backend trả về.
- `failed`: error card có message an toàn và nút Retry; Retry phải chạy lại toàn bộ save-then-validate,
  không gửi lại graph cũ một cách ngầm định.
- `stale`: banner rõ ràng; nút **Validate current revision**.
- `truncated: true`: banner “Only the first 100 diagnostics are shown.”

Mỗi diagnostic hiển thị severity, `message`, `code`, JSON path, `nodeId`/`edgeId` nếu có. Click:

- có `nodeId`: select node và focus canvas node;
- có `edgeId`: select edge;
- chỉ có path/global error: không giả lập node target.

Backend message là text; render như plain text, không dùng `dangerouslySetInnerHTML`.

Transport/request errors cũng nằm trong Diagnostics nhưng phải có visual/type riêng với engine
diagnostics. Không đưa `422`, timeout hoặc save failure vào mảng `data.errors` giả.

## 7. Quan hệ với local validator và persistence

- Giữ `validateWorkflow()` và tab Problems trong phase này. Local validator giúp feedback tức thời;
  backend validator kiểm tra catalog ACTIVE và các rule mà local validator có thể lệch.
- Khi hai validator khác nhau, Diagnostics/backend là kết quả authoritative cho saved revision; UI
  không âm thầm merge hai danh sách thành một vì code/path/semantics khác nhau.
- Không ghi response vào `draftState.validationSummary` trong scope đầu tiên. Làm vậy sẽ tạo một local
  mutation/save thứ hai ngay sau validation và dễ khiến “validated revision” sai nghĩa. Nếu cần lưu
  lịch sử sau này, thiết kế schema riêng theo `workflowPath`, graph hash, revision, timestamp và catalog
  context rồi persist không làm thay đổi nội dung graph.

## 8. Kế hoạch thay đổi theo file

### Phase 1 — Contract và API adapter

- Add `src/application/workflow-validation/workflow-validation.ts`.
- Add `electron/main/api/workflow-validation.api.ts`.
- Add `electron/main/workflow-validation/create-workflow-validation-service.ts`.
- Unit test strict request/response parsing, all three success statuses và error mapping.

### Phase 2 — Secure IPC wiring

- Add IPC channel và trusted handler.
- Update preload và `StudioHostApi`.
- Register handler trong bootstrap với shared auth session.
- Test token absent, 401 refresh-once, retry success, repeated 401 và invalid IPC input.

### Phase 3 — Save-then-validate orchestration

- Add validation controller/hook và revision-aware state.
- Reuse `encodeWorkflowDocument`.
- Wire toolbar/action list trong `MainWorkflowPage.tsx`.
- Test save failure => zero API calls; successful save => request contains saved graph; stale response,
  workflow switch, project close và double click.

### Phase 4 — Diagnostics presentation

- Replace placeholder Diagnostics content bằng result/error states.
- Add node/edge navigation, truncated/stale banners và Retry.
- Add component tests cho `VALID`, `VALID_WITH_WARNINGS`, `INVALID`, `413`, `422`, timeout và malformed
  `200` response.

### Phase 5 — Contract hardening

- Cân nhắc đồng bộ local authoring limits về 500 nodes, 1.000 edges và ID 100 ký tự.
- Nếu không đồng bộ, document rõ local projects lớn vẫn save được nhưng không pass server validation.
- Chạy typecheck, lint, unit tests, desktop build và một integration test với backend thật.

## 9. Test matrix bắt buộc

| Case | Kỳ vọng |
| --- | --- |
| Graph hợp lệ | Save local trước; API trả `200/VALID`; Diagnostics success |
| Backend trả `200/INVALID` | Không coi request failed; render toàn bộ `errors` |
| Backend trả `200/VALID_WITH_WARNINGS` | Render warnings và warning status |
| Outer envelope sai | `422` hiển thị integration error, không phải graph diagnostic |
| Graph > 1 MiB | Preflight hoặc `413`; không crash/treo UI |
| >500 nodes hoặc >1.000 edges | `200/INVALID` với limit diagnostic, không map thành network error |
| Save local thất bại | Không gọi endpoint; Diagnostics có save error |
| Node Config còn draft | Chặn Validate và yêu cầu Save/Discard draft |
| Token sắp hết hạn | `getValidAccessToken()` refresh trước request |
| Request đầu `401` | Refresh và retry đúng một lần |
| Request thứ hai vẫn `401` | Session-expired; không retry loop |
| User edit trong lúc chờ | Response được đánh dấu stale theo revision |
| User đổi workflow/project | Response cũ không ghi đè Diagnostics của context mới |
| `truncated: true` | Hiển thị banner giới hạn 100 diagnostic |
| Diagnostic có node/edge ID | Click điều hướng đúng canvas entity |
| `200` body sai schema | `WORKFLOW_VALIDATION_INVALID_RESPONSE` |

## 10. Acceptance criteria

1. Một click Validate luôn save local trước và chỉ gọi API khi save thành công.
2. Payload là đúng active workflow ở `savedRevision`, bọc chính xác trong `{ editorGraph }` và không có
   top-level field dư.
3. Access token không đi qua renderer và API retry authentication tối đa một lần.
4. UI phân biệt rõ `VALID`, `VALID_WITH_WARNINGS`, `INVALID`, transport error và save error.
5. HTTP `200/INVALID` được hiển thị là workflow invalid, không phải request success chung chung.
6. Mọi response/error của lần Validate được hiển thị trong Diagnostics; Problems vẫn là local
   validation riêng.
7. Response cũ không thể làm graph revision mới trông như đã được validate.
8. Diagnostic giữ nguyên thứ tự backend, hỗ trợ node/edge navigation và cảnh báo khi bị truncate.
9. Không gửi token, Axios error, stack trace hoặc raw HTML vào UI/log.
10. Typecheck, lint, unit tests và desktop build đều pass.

## 11. Backend references đã đối chiếu

- `/home/mavis/FPTU/a2matex/a2matex-be/src/routes/workflow-validation/workflow-validation.controller.ts`
- `/home/mavis/FPTU/a2matex/a2matex-be/src/routes/workflow-validation/workflow-validation.model.ts`
- `/home/mavis/FPTU/a2matex/a2matex-be/src/routes/workflow-validation/workflow-validation.service.ts`
- `/home/mavis/FPTU/a2matex/a2matex-be/src/routes/workflow-validation/workflow-validation.repo.ts`
- `/home/mavis/FPTU/a2matex/a2matex-be/src/shared/constants/workflow-validation.constant.ts`
- `/home/mavis/FPTU/a2matex/a2matex-be/src/shared/pipes/custom-zod-validation.pipe.ts`

