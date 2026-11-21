# A2MaTeX Studio — Kế hoạch ghép Device và Test Run APIs

> Trạng thái: Phase A đến Phase F implemented; device-ready acceptance đã có emulator để kiểm tra tiếp  
> Ngày đối chiếu: 2026-11-19  
> Phạm vi chính: `a2matex-studio`; có một bước cấu hình development trong sibling repo
> `a2matex-runtime`  
> Tài liệu nguồn: [studio.md](studio.md),
> [local-runtime-integration-plan.md](local-runtime-integration-plan.md), và contract Runtime hiện có

## 1. Kết quả cần đạt

Studio tiếp tục dùng Local Runtime do Electron Main quản lý, nhưng hoàn thiện vertical slice còn thiếu:

1. Tự động validate graph theo trailing delay 3 giây, không bao giờ có hai validation request chạy song
   song, và sau khi một request settle phải chờ thêm 3 giây mới được gửi request kế tiếp.
2. Bỏ action **Compile** khỏi UI. Compilation trở thành bước nội bộ của **Run**, không phải thao tác trực
   tiếp của người dùng.
3. Cho người dùng chọn đúng một Android device ở trạng thái `READY` và cung cấp workflow inputs.
4. Khi bấm **Run**, Studio chụp một immutable source snapshot, compile snapshot đó, lưu Runtime IR vào
   Project Draft bằng compare-and-set, rồi gửi chính IR vừa compile tới `POST /runs`.
5. Giữ `requestId` ổn định khi kết quả start không chắc chắn, hiển thị snapshot trả về, và poll
   `GET /runs/{runGroupId}` đến terminal state.
6. Khi mở execution view hoặc phục hồi sau lỗi, dùng `GET /runs/active`; một `404` hợp lệ nghĩa là không
   có active run, không phải Runtime chết.

Ngoài phạm vi của plan này: multi-device, scheduling, cancel/pause API, SSE/log streaming, attempt
history, và chuyển Android Inspector sang Runtime inventory.

## 2. Đánh giá độc lập các giả định

### 2.1. Không phải mọi route đều cần thêm UI hoặc IPC mới

Danh sách router có chín route/hành vi, nhưng chỉ device picker và run flow còn thiếu ở Studio.

| Runtime route | Hiện trạng Studio | Việc cần làm |
|---|---|---|
| `GET /health` | Chưa expose; lifecycle đang probe authenticated `runtime-info` | Chỉ dùng cho diagnostic/smoke test. Không dùng health để kết luận ownership, auth hoặc compatibility. |
| `GET /runtime-info` | Đã có trong `RuntimeHttpClient` và readiness gate | Giữ nguyên; bổ sung test rằng mọi operation mới vẫn đi qua gate này. |
| `POST /workflow-validation` | Đã có HTTP client, IPC, schema và UI | Thay scheduler 700 ms hiện tại bằng scheduler 3 giây có serialize/cooldown. |
| `POST /workflow-compilation` | Đã có client, IPC và CAS persistence | Bỏ UI trực tiếp; tái sử dụng trong orchestration Run. |
| `GET /devices` | Đã có client/IPC nhưng chưa có picker | Dùng cached snapshot để render ban đầu. |
| `POST /devices/refresh` | Đã có client/IPC nhưng chưa có picker | Gọi khi mở picker và trước admission; POST không được gửi body. |
| `POST /runs` | Chưa có | Thêm strict DTO/schema, client, service, IPC và UI orchestration. |
| `GET /runs/active` | Chưa có | Thêm recovery/active-view query; xử lý 404 như data result. |
| `GET /runs/:runGroupId` | Chưa có | Thêm polling và saved-result refresh. |
| `NoRoute` | Là server fallback, không phải endpoint client | Chỉ map error envelope `404 RESOURCE_NOT_FOUND`; không tạo method gọi `NoRoute`. |

### 2.2. “Trailing debounce” chưa mô tả đủ yêu cầu

Yêu cầu thực tế gồm ba policy khác nhau:

- **trailing debounce**: chỉ gửi sau 3 giây không có committed graph edit;
- **single-flight**: tối đa một validation request đang chạy;
- **post-response cooldown**: request kế tiếp sớm nhất là 3 giây sau khi request trước settle.

Do đó thời điểm gửi lần kế tiếp phải là:

```text
nextEligibleAt = max(lastCommittedEditAt + 3s, previousRequestSettledAt + 3s)
```

Nếu không có revision mới trong lúc request chạy thì không gửi thêm request chỉ vì cooldown kết thúc.
`debounce(fn, 3000)` đơn thuần không bảo đảm single-flight hoặc post-response cooldown.

### 2.3. Debounce nút Run không phải cơ chế chống double-run phù hợp

Time-based debounce có thể bỏ qua intent thật, hoặc vẫn tạo hai run nếu callback đầu đã bắt đầu trước khi
React cập nhật `disabled`. Cách an toàn hơn là:

- synchronous in-memory lock/ref được set ngay đầu click handler;
- button `disabled` phản ánh state để có UX rõ ràng;
- một `requestId` UUID v4 được tạo đúng một lần cho mỗi intent;
- retry `POST /runs` phải dùng lại nguyên request body và `requestId`.

Plan vì vậy dùng single-flight guard + Runtime idempotency, không dùng delay tùy ý cho Run button. Nếu
“debounce nút Run” được hiểu là không nhận double-click thì cơ chế này đáp ứng mạnh hơn debounce.

### 2.4. Compile → lưu Draft → POST /runs không thể là một transaction nguyên tử

Project Draft nằm trong SQLite của Studio, còn run admission nằm trong Runtime process. Không có
distributed transaction giữa hai nơi. Flow phải là một ordered, idempotent saga:

1. compile immutable source snapshot;
2. CAS-persist IR vào Draft;
3. refresh/recheck selected device;
4. tạo và giữ pending run request;
5. `POST /runs` với stable `requestId`;
6. nếu response bị mất, submit lại đúng pending body để Runtime trả `200` replay thay vì chạy lần hai.

Nếu bước 2 thành công nhưng bước 5 thất bại, Draft vẫn giữ IR hợp lệ; đây là trạng thái chấp nhận được.
Nếu source revision đổi trước bước 2, CAS phải fail và **không được** start run bằng IR cũ.

### 2.5. Cài ADB mới không nhất thiết là bước đầu tiên trên máy hiện tại

Preflight ngày 2026-11-19 cho thấy:

- host: Linux x86_64;
- `adb` đã có tại `/usr/bin/adb`, symlink tới
  `/usr/lib/android-sdk/platform-tools/adb`;
- version hiện tại: `34.0.4-debian`;
- `a2matex-runtime/Makefile` đang mặc định
  `A2MATEX_RUNTIME_ADB_EXECUTABLE_PATH ?= $(HOME)/Documents/platform-tools/adb`, nhưng path này hiện
  không tồn tại.

Android khuyến nghị dùng Platform Tools mới nhất và cho biết các bản mới tương thích ngược. Tuy nhiên,
không nên commit path tuyệt đối chứa username như `/home/mavis/...` vào Makefile. Hai lựa chọn hợp lệ:

| Lựa chọn | Ưu điểm | Nhược điểm |
|---|---|---|
| Dùng `/usr/bin/adb` hiện có | Không cần cài thêm; package manager quản lý | Version cũ hơn bản official hiện tại; phụ thuộc layout distro |
| Tải Linux Platform Tools mới nhất từ Android Developers vào `$HOME/Documents/platform-tools` | Đúng nguồn được yêu cầu; Makefile hiện tại đã trỏ đúng vị trí portable theo user | Cần quản lý update thủ công và chấp nhận Android SDK License |

Đề xuất cho development hiện tại: cài bản Linux stable mới nhất từ trang official vào
`$HOME/Documents/platform-tools`, giữ Makefile dùng `$(HOME)` và verify executable thực tế. Không pin bản
Canary chỉ vì nó xuất hiện đầu release notes. Nếu team chọn ADB hệ thống, override biến bằng
`A2MATEX_RUNTIME_ADB_EXECUTABLE_PATH=/usr/bin/adb` thay vì hard-code path của một developer.

### 2.6. Workflow được Run cần được xác định rõ

Compilation hiện tại luôn lấy `manifest.entryWorkflow`, trong khi validation UI theo workflow tab đang
active. Project Draft cũng chỉ giữ một `runtimeIr` và provenance workflow path. Plan này giữ Test Run ở
**entry workflow** để khớp persistence hiện tại. Nếu Product muốn Run mọi tab, schema Draft phải đổi sang
cache theo `(projectId, workflowPath, sourceRevision)` trước khi mở rộng.

### 2.7. Assumption về nút Validate

Yêu cầu chỉ nói bỏ **Compile** và để **Run** thay thế compile trực tiếp. Plan sẽ:

- bỏ Compile khỏi toolbar/action list;
- auto-validation chạy sau mọi committed graph edit;
- giữ action Validate/Retry trong Diagnostics để người dùng chủ động retry sau lỗi Runtime;
- có thể bỏ Validate ở top toolbar để runtime action chính duy nhất ở đó là Run.

Việc giữ Retry trong Diagnostics hữu ích khi auto-validation bị dừng bởi explicit Runtime shutdown hoặc
lỗi ADB/Runtime, và không làm compilation quay lại thành user action.

## 3. Target flow

```mermaid
sequenceDiagram
    participant UI as React editor
    participant Main as Electron Main
    participant DB as Studio SQLite
    participant RT as Local Runtime

    UI->>UI: Run click: acquire synchronous lock
    UI->>Main: startRun(captured source, serial, inputs)
    Main->>RT: readiness gate + GET /runtime-info
    Main->>RT: POST /workflow-compilation
    RT-->>Main: validation + runtimeIr
    alt invalid or runtimeIr is null
        Main-->>UI: diagnostics; no run admitted
    else compiled
        Main->>DB: CAS save IR + validation summary
        alt source revision conflict
            Main-->>UI: source changed; no run admitted
        else persisted
            Main->>RT: POST /devices/refresh (no body)
            RT-->>Main: device snapshot
            Main->>Main: build pending body with stable requestId
            Main->>RT: POST /runs
            RT-->>Main: 201 new snapshot or 200 replay
            Main-->>UI: snapshot + runGroup.id
            loop until terminal
                UI->>Main: GET /runs/{runGroupId}
                Main->>RT: readiness gate + authenticated GET
                RT-->>Main: committed snapshot
                Main-->>UI: committed snapshot
            end
        end
    end
```

Credential, Runtime base URL và pending request body chứa IR phải ở trusted Main process. Renderer chỉ
nhận typed, sanitized result cần cho UI; không nhận session token.

## 4. Phase A — ADB Platform Tools và Runtime smoke test

### Kết quả triển khai Phase A — 2026-11-19

- Đã tải gói Linux stable từ server official của Google; archive pass `unzip -t` và có SHA-256
  `d230f13842f60f782a8645f9c813f8f845bf36089ea7289f28c48f17979313f1`.
- Đã cài Platform Tools `37.0.1-15733141` tại
  `/home/mavis/Documents/platform-tools`; executable ADB là
  `/home/mavis/Documents/platform-tools/adb`.
- Không sửa `a2matex-runtime/Makefile`: default hiện có
  `$(HOME)/Documents/platform-tools/adb` đã resolve đúng executable vừa cài và vẫn portable theo user.
- Đã build `a2matex-runtime` với `VERSION=0.1.0`.
- Standalone smoke test đã pass:
  - `GET /api/v1/health` → HTTP 200, `{"status":"UP"}`;
  - authenticated `GET /api/v1/runtime-info` → HTTP 200, version `0.1.0`, IR format `1`, và danh sách
    supported nodes;
  - authenticated `POST /api/v1/devices/refresh` không body → HTTP 200, `{"devices":[]}`;
  - authenticated `GET /api/v1/devices` → HTTP 200, `{"devices":[]}`;
  - instance thứ hai bị từ chối với `EXECUTION_STORE_IN_USE` trong khi instance thứ nhất giữ lock;
  - SIGINT shutdown hoàn tất, không còn worker/admission và connection file đã được thu hồi.
- Sau khi Android Studio khởi động emulator, authenticated `POST /devices/refresh` đã trả HTTP 200 với
  `{"devices":[{"adbSerial":"emulator-5554","status":"READY"}]}`. Device-ready acceptance của Phase A
  đã pass; không cần cài lại Platform Tools.

### A1. Cài/resolve ADB

1. Mở trang official
   [Android SDK Platform Tools](https://developer.android.com/tools/releases/platform-tools) và chọn
   gói **Linux** cho host x86_64.
2. Dùng bản stable mới nhất; không chọn Canary nếu không có lý do/test riêng.
3. Chấp nhận license, tải từ domain official và giải nén để executable có path:

   ```text
   $HOME/Documents/platform-tools/adb
   ```

4. Verify:

   ```sh
   test -x "$HOME/Documents/platform-tools/adb"
   "$HOME/Documents/platform-tools/adb" version
   "$HOME/Documents/platform-tools/adb" devices -l
   ```

5. Trong `a2matex-runtime/Makefile`, giữ biến overridable:

   ```make
   A2MATEX_RUNTIME_ADB_EXECUTABLE_PATH ?= $(HOME)/Documents/platform-tools/adb
   ```

   Giá trị này thực tế đã có trong Makefile hiện tại; việc còn thiếu là cài executable tại đúng path và
   verify. Không đổi sang path tuyệt đối chứa username.

6. Nếu quyết định dùng package hệ thống thay vì download, chạy Runtime với local override:

   ```sh
   make run VERSION=0.1.0 A2MATEX_RUNTIME_ADB_EXECUTABLE_PATH=/usr/bin/adb
   ```

### A2. Smoke test trước khi sửa Studio

- Build/run Runtime với version ít nhất `0.1.0`. Makefile hiện mặc định `0.1.0`; vẫn verify
  `runtimeVersion` vì binary được build ngoài Makefile với `0.0.0-dev` có thể compile nhưng bị run
  admission từ chối `RUNTIME_INCOMPATIBLE`.
- Xác nhận authenticated `GET /runtime-info` trả version, IR format và supported nodes mong đợi.
- Xác nhận `POST /devices/refresh` trả device `READY`, hoặc trả lỗi có hướng xử lý nếu chưa authorize.
- Xác nhận Studio managed Runtime và Runtime standalone không cùng giữ execution-store lock.

Acceptance của Phase A:

- Runtime process gọi đúng ADB executable đã chọn.
- Một emulator/device đã authorize xuất hiện bằng đúng `adbSerial` mà Runtime trả.
- Không có secret/token hoặc raw ADB output trong log UI.

## 5. Phase B — Mở rộng contracts và native HTTP client

### Kết quả triển khai Phase B — 2026-11-19

- Đã thêm strict types/schemas cho start request, Run snapshot, group/device statuses, summary, UUID v4
  canonical lowercase, UTC millisecond timestamps, nullable fields, terminal errors và opaque cursor.
- Đã sửa contract device inventory: `UNAVAILABLE.error` là object `{code,message,retryable}`, không phải
  string; schema enforce `READY` không có error và `UNAVAILABLE` phải có error.
- `RuntimeHttpClient` đã có `startRun`, `activeRun`, `runById`; phân biệt start `201 CREATED` với replay
  `200 EXISTING`, validate run-group ID trước HTTP, và không gửi body cho snapshot GET.
- Snapshot `404 RESOURCE_NOT_FOUND` được trả về dưới dạng `{found:false}`, không bị map thành process
  failure hoặc kích hoạt Runtime replacement.
- `RuntimeError` giữ `httpStatus`, safe `runtimeCode`, retryability và bounded validation diagnostics.
  HTTP rejection hợp lệ dùng `RUNTIME_REQUEST_REJECTED`; chỉ session/transport/timeout errors còn thuộc
  replacement policy hiện tại.
- Request allowance của native client đã nâng lên 4 MiB cho `POST /runs`; device refresh dùng timeout 25
  giây để bao phủ Runtime refresh budget 20 giây và cleanup.
- Đã thêm unit/integration tests cho strict schema, structured device errors, exact one-device request,
  201/200 mapping, body/header preservation, bodyless GET, typed 404, busy 409 và validation 422.
- Verification pass: lint, typecheck, toàn bộ test suite (`14` tests), và production desktop build.
  Global `format:check` vẫn báo file unrelated có sẵn
  `src/presentation/components/ui/toast-store.ts`; các file Phase B đã được Prettier format riêng.
- Chưa expose run methods qua `RuntimeOperations`, IPC hoặc preload theo đúng phase boundary; phần đó thuộc
  Phase E.

### B1. Types và strict schemas

Mở rộng:

- `src/application/runtime/runtime.types.ts`;
- `src/application/runtime/runtime.schema.ts`.

Thêm các type chính:

- `RuntimeStartRunInput` — source snapshot/provenance, một `adbSerial`, workflow inputs;
- `RuntimeStartRequest` — wire body gồm `requestId`, `runtimeIr`, `devices`;
- `RuntimeRunSnapshot`, `RuntimeRunGroup`, `RuntimeRunSummary`, `RuntimeDeviceExecution`;
- terminal group states: `SUCCEEDED | FAILED | CANCELLED | INTERRUPTED`;
- device states cần parse đầy đủ theo contract;
- nullable timestamps, `nextNodeId`, và safe `terminalError`;
- `cursor` phải giữ dạng string, không parse thành number.

Schema phải strict ở public DTO boundary. Validate canonical lowercase UUID v4 cho `requestId` và
`runGroupId`, giới hạn số phần tử/độ dài string, và giữ response size bounded.

### B2. HTTP client

Mở rộng `electron/main/runtime/http/runtime-http-client.ts`:

- `startRun(body)` → `POST runs`;
- `activeRun()` → `GET runs/active`;
- `runById(runGroupId)` → `GET runs/{encodedId}`.

Client hiện trả body và bỏ HTTP status. Start flow cần phân biệt `201 Created` với `200 Existing`, nên
refactor private request để operation có thể nhận `{status, body}` hoặc để `startRun` map thành:

```ts
type StartRunResult = {
  disposition: 'CREATED' | 'EXISTING';
  snapshot: RuntimeRunSnapshot;
};
```

Không gửi body cho `GET /runs/*` hoặc `POST /devices/refresh`. `activeRun()` cần một typed
`notFound` result thay vì biến `404` thành process failure. Tương tự, `runById()` phải phân biệt ID không
tồn tại với readiness failure.

### B3. Error fidelity

`RuntimeHttpClient` hiện collapse phần lớn non-2xx thành `RUNTIME_INVALID_REQUEST` hoặc
`RUNTIME_UNAVAILABLE`, làm mất server error code. Run UX cần giữ ít nhất HTTP status + safe Runtime code
cho các trường hợp:

- `RUNTIME_BUSY`;
- `VALIDATION_FAILED`;
- `RUNTIME_INCOMPATIBLE`;
- device unavailable/unauthorized/offline;
- `ADB_UNAVAILABLE`;
- `PERSISTENCE_FAILED`;
- `RESOURCE_NOT_FOUND`;
- `INTERNAL_ERROR`.

Không coi 400/409/413/422 hoặc snapshot 404 là bằng chứng process chết. Chỉ readiness/session/transport
failure mới đi qua replacement policy.

## 6. Phase C — Validation scheduler 3 giây

### Kết quả triển khai Phase C — 2026-11-19

- Đã thay timer 700 ms bằng `SerializedTrailingScheduler`: chỉ giữ candidate revision mới nhất, tối đa
  một request đang chạy, và request kế tiếp chỉ được gửi tại
  `max(lastEditAt + 3s, previousRequestSettledAt + 3s)`.
- Auto-validation bắt đầu từ committed edit đầu tiên, không cần người dùng bấm Validate trước và không
  flush SQLite. Khi node configuration còn pending, scheduler chưa nhận candidate; commit/discard form
  mới bắt đầu timer 3 giây cho revision mới nhất.
- Manual Validate vẫn giữ semantics flush saved workflow, nhưng dùng chung single-flight lock/cooldown
  với auto-validation. Explicit Runtime shutdown suspend và xóa queue tự động; Validate thủ công resume
  scheduler.
- Project/workflow change reset queue và tăng generation. Response chỉ được apply khi cả context lẫn
  revision vẫn current; response stale chuyển state về idle và không tạo success toast.
- Đã thêm unit test fake timers cho scheduler và integration test cấp hook cho initial mount, trailing
  edit, dirty form, no-overlap/post-settle cooldown, stale revision, workflow switch, shutdown và manual
  resume.
- Verification pass: Prettier cho file Phase C, lint, typecheck, toàn bộ test suite (`26/26`) và
  production desktop build.
  Build chỉ còn warning chunk JavaScript lớn có sẵn, không phải lỗi Phase C.

Thay timer 700 ms trong
`src/presentation/features/workflow-editor/useWorkflowValidation.ts` bằng một scheduler nhỏ, có thể test
độc lập bằng fake timers.

### C1. State cần giữ

```text
latestCommittedSnapshot   latest revision cần validate
lastEditAt                thời điểm committed graph thay đổi gần nhất
inFlight                  request hiện tại, nếu có
lastSettledAt             thời điểm request gần nhất resolve/reject
timer                     đúng một scheduled wake-up
contextGeneration         project/workflow generation để discard response cũ
automaticSuspended        true sau explicit Runtime shutdown
```

### C2. Algorithm

1. Khi committed revision đổi, capture latest `{projectId, workflowPath, revision, editorGraph}` và cập
   nhật `lastEditAt`.
2. Nếu node configuration đang dirty, chưa schedule. Khi form commit/discard xong, coi snapshot mới là
   candidate và bắt đầu lại 3 giây.
3. Nếu request đang chạy, chỉ replace `latestCommittedSnapshot`; không gửi request thứ hai.
4. Khi không có request, schedule tại
   `max(lastEditAt + 3000, lastSettledAt + 3000)`.
5. Khi timer fire, đọc lại candidate mới nhất. Nếu context/revision đã đổi, reschedule hoặc discard; nếu
   hợp lệ thì gửi đúng một request.
6. Khi request settle, apply output chỉ khi project/workflow/revision vẫn current. Nếu có revision mới,
   schedule lại theo công thức trên; nếu không, idle.
7. Khi project/workflow đổi hoặc unmount, clear timer, tăng generation và ignore response cũ.
8. Sau explicit Runtime shutdown, auto scheduler dừng để không tự khởi động Runtime. User action
   Validate/Run có thể resume integration theo lifecycle policy hiện tại.

### C3. Semantics cần sửa so với hiện tại

- Auto-validation không nên phụ thuộc việc người dùng đã bấm Validate một lần trước đó; requirement mới
  là validate sau committed edit.
- Auto-validation không flush SQLite trước request; nó validate immutable in-memory committed graph.
- Manual Validate/Retry vẫn có thể flush nếu giữ semantics “validate saved workflow”.
- Không toast thành công cho mọi auto-validation; Diagnostics/status indicator đủ để tránh spam.

### C4. Acceptance bằng fake timers

- Nhiều edit trong 2.9 giây → không request; sau 3 giây từ edit cuối → đúng một request.
- Edit trong lúc request A chạy → không có request B chồng lên A.
- A settle, candidate mới đã idle lâu → B vẫn phải đợi đủ 3 giây sau A settle.
- A settle và không có revision mới → không gọi lại.
- Response A về sau khi chuyển workflow → bị discard.
- Dirty node form → pause; commit form → timer 3 giây bắt đầu lại.
- Explicit shutdown → timer không lazy-start Runtime.

## 7. Phase D — Device picker cho Test Run

### Kết quả triển khai Phase D — 2026-11-19

- Đã thêm feature độc lập `src/presentation/features/test-run/` gồm dialog, Runtime device picker,
  workflow inputs form và hai hook quản lý inventory/input state.
- Khi dialog mở, hook đọc cached snapshot bằng `GET /devices` trước rồi tự gọi
  `POST /devices/refresh`; refresh thủ công dùng cùng single-flight request để tránh gửi trùng.
- Refresh lỗi giữ nguyên cached devices và selection. Một refresh thành công chỉ giữ selection nếu cùng
  `adbSerial` vẫn có trạng thái `READY`; device `UNAVAILABLE` không thể chọn và hiển thị structured
  Runtime error.
- Input form parse strict Draft `inputSchema`, hỗ trợ string/enum/integer/number/boolean, áp dụng default,
  phân biệt optional boolean với `false`, validate trước submit, và gửi `{}` cho schema rỗng.
- `TestRunDialog` chỉ enable action Run khi desktop host sẵn sàng, không có blocked/busy state, có đúng
  một selected READY device và input values hợp schema. Dialog trả một typed
  `RuntimeStartDeviceInput` qua callback để Phase E/F nối vào coordinator.
- Cố ý chưa gắn dialog vào toolbar và chưa giả lập start-run: Phase E chịu trách nhiệm admission thật,
  còn Phase F chịu trách nhiệm bỏ Compile, enable Run, polling và recovery.
- Đã thêm integration tests cho cached-before-refresh, refresh failure, selection invalidation,
  defaults/schema validation, empty inputs và exact one-device submission. Verification pass: lint,
  typecheck, toàn bộ test suite (`32/32`) và production desktop build. Global `format:check` vẫn chỉ
  báo file unrelated có sẵn `src/presentation/components/ui/toast-store.ts`; các file Phase D đã được
  Prettier format riêng.

Tạo feature riêng, ví dụ:

```text
src/presentation/features/test-run/
  TestRunDialog.tsx
  DevicePicker.tsx
  WorkflowInputsForm.tsx
  useTestRun.ts
```

Behavior:

1. Khi mở dialog, render `GET /devices` cached snapshot trước nếu có.
2. Tự gọi `POST /devices/refresh` khi dialog mở; có action **Refresh devices** thủ công.
3. Chỉ cho chọn đúng một device `READY`; hiển thị `error` cho `UNAVAILABLE`.
4. Giữ selection sau refresh chỉ khi cùng `adbSerial` vẫn `READY`.
5. `503 ADB_UNAVAILABLE` không xóa cached list; hiển thị refresh error và cho retry.
6. Render workflow inputs theo Draft `inputSchema`; với schema rỗng gửi `{}`.
7. Android Inspector vẫn dùng ADB service hiện tại. Không trộn Inspector device DTO với Runtime device
   DTO chỉ vì cùng có serial.

Run chỉ enabled khi:

- desktop host sẵn sàng;
- không có pending node configuration;
- có đúng một selected READY device;
- workflow input values hợp schema;
- không có run intent đang prepare/submit hoặc active unresolved run.

## 8. Phase E — Compile, persist và start run trong Electron Main

### Kết quả triển khai Phase E — 2026-11-19

- Đã thêm `RuntimeRunCoordinator` trong Electron Main với synchronous single-flight guard và flow
  `load/verify source → compile → CAS persist → refresh device → create pending body → POST /runs`.
- Main không chỉ tin `projectId/sourceRevision` từ renderer: coordinator resolve account scope hiện tại,
  đọc Project Draft, rồi canonical-compare entry workflow, Editor Graph và input schema trước compile.
  CAS của repository vẫn là hàng rào thứ hai cho race xảy ra trong lúc compilation.
- Compilation invalid trả typed `COMPILE_INVALID` và không persist/refresh/start. CAS conflict không gọi
  device refresh hoặc run admission. Sau persistence, mọi error trả kèm refreshed Project snapshot để
  renderer có thể đồng bộ artifacts/provenance.
- Pending request được ghi trong Main memory trước POST. Timeout, connection/session failure, invalid
  response hoặc HTTP 5xx giữ nguyên exact body/requestId. Gọi lại `start-run` với cùng immutable intent
  retry body đó mà không compile/persist/refresh; intent khác bị chặn bằng `RUN_PENDING_ADMISSION`.
- Start response được kiểm tra correlation `requestId` và `adbSerial` trước khi controller ghi active
  state. Active/by-id reads cập nhật controller state và coi active 404 là normal `{found:false}`.
- Đã mở ba IPC/preload methods `startRun`, `getActiveRun`, `getRun`; input strict-parse, có giới hạn 2
  MiB ở renderer boundary, UUID canonical, trusted-sender check và giữ safe Runtime metadata/validation
  qua `HostError`.
- `RuntimeOperations` start/read đều đi qua readiness gate hiện có. Project store có action patch
  persisted Runtime artifacts nhưng từ chối ghi đè session khác, source revision khác hoặc editor đang
  dirty; Phase F sẽ gọi action này khi nối UI.
- Constraint hiện tại được xác nhận: mọi local project handler của Studio đều yêu cầu authenticated
  account scope. Phase E dùng cùng scope và không cần cloud request để ghi SQLite, nhưng chưa hỗ trợ
  anonymous local project sau sign-out.
- Tests bao phủ compile invalid, forged/stale source, CAS race, device recheck, exact one-device body,
  uncertain retry, different-intent blocking, simultaneous clicks, IPC trust/strict parsing, readiness
  gate và safe renderer snapshot patch. Verification pass: lint, typecheck và toàn bộ test suite
  (`47/47`) cùng production desktop build. Global `format:check` vẫn chỉ báo file unrelated có sẵn
  `src/presentation/components/ui/toast-store.ts`; các file Phase E đã được Prettier format riêng.

### E1. Một IPC operation cấp cao

Thêm các channel:

```text
studio:runtime:start-run
studio:runtime:get-active-run
studio:runtime:get-run
```

Cập nhật đồng bộ:

- `electron/shared/channels.ts`;
- `electron/preload/index.cts`;
- `src/infrastructure/electron/studio-host-api.ts`;
- `electron/main/ipc/register-runtime-handlers.ts`.

Không để renderer tự gọi `compile`, nhận IR rồi ghép `POST /runs` bằng nhiều IPC rời. Một Main-level
orchestrator bảo đảm source snapshot, CAS persistence, selected device và pending request cùng thuộc một
Run intent.

### E2. Start orchestration

`startRun` nhận một immutable input đã strict-parse:

```text
projectId
workflowPath = manifest.entryWorkflow
sourceRevision
editorGraph
inputSchema
adbSerial
inputs
clientIntentId (optional UI correlation only)
```

Thứ tự xử lý:

1. Acquire Main-process single-flight lock. Nếu đã prepare/submit thì trả typed busy result, không gọi
   Runtime lần hai.
2. Qua `withReadyRuntime`, recheck supported nodes/runtime compatibility.
3. Gọi `/workflow-compilation` với captured graph + schema.
4. Nếu `INVALID` hoặc `runtimeIr: null`, trả validation để Diagnostics render; không dùng IR cache cũ.
5. Gọi `saveRuntimeCompilation()` với `expectedSourceRevision`. Persistence phải hoàn tất trước start.
6. Nếu CAS conflict, trả `LOCAL_REVISION_CONFLICT`; không refresh device và không POST run.
7. Gọi `/devices/refresh` không body và require captured `adbSerial` vẫn `READY`.
8. Tạo lowercase UUID v4 một lần, build và giữ pending body trong Main memory trước POST.
9. Gọi `POST /runs`.
10. Với 201/200, trả disposition + complete snapshot. Giữ `runGroup.id` và request correlation.
11. Chỉ release preparation/submission lock sau khi result đã được ghi vào controller state. Active run
    tiếp tục làm Run button disabled đến terminal state.

### E3. Pending request và uncertain response

Không clear pending body trong `finally` nếu POST timeout, 500, connection reset hoặc 401 khiến kết quả
admission chưa rõ. Cung cấp action retry/resume dùng lại exact `requestId`, `runtimeIr`, device và inputs;
không compile lại và không sinh UUID mới cho cùng intent.

Nếu app restart làm mất pending memory:

1. gọi `GET /runs/active` sau readiness;
2. nếu có snapshot, phục hồi UI bằng `runGroup.id`;
3. nếu 404, thông báo không thể tự suy ra POST cũ có được nhận hay không nếu request ID chưa được persist.

Để recovery mạnh qua app crash, phase kế tiếp có thể persist minimal pending identity/body encrypted hoặc
persist `{requestId, runGroupId}` sau admission. Không cần lưu Runtime token.

### E4. Project Draft consistency

Current `persistCompilation` đã dùng compare-and-set theo `sourceRevision`; tái sử dụng thay vì viết SQL
mới. Cần sửa hai điểm:

- orchestration không được yêu cầu cloud login chỉ để lưu local Draft nếu product cho phép local project
  hoạt động offline; lấy account scope từ open project context đáng tin cậy thay vì tin raw renderer;
- sau persistence, renderer project session phải được patch/reload để `runtimeIr`, validation summary và
  provenance trong memory khớp SQLite. Không chỉ toast “compiled” trong khi Zustand snapshot vẫn stale.

Nếu app hiện bắt buộc authenticated session cho mọi project, ghi constraint đó thành test/acceptance rõ
ràng thay vì để compile thất bại bất ngờ với message “Sign in to persist”.

## 9. Phase F — Run UI, polling và recovery

### Kết quả triển khai Phase F — 2026-11-19

- Đã bỏ hoàn toàn Compile action/icon/state/callback khỏi workspace toolbar. Run mở Phase D dialog,
  giữ synchronous renderer lock trước mọi await, flush local save, chụp entry-workflow snapshot và gọi
  đúng Main-level `startRun` operation của Phase E.
- Coordinator phát progress event hẹp theo `clientIntentId` cho `COMPILING`, `PERSISTING`,
  `REFRESHING_DEVICE`, `STARTING`; renderer không dùng timer giả để đoán phase. Toolbar hiển thị
  `Preparing…`, `Compiling…`, `Starting…`, `Running…` và chỉ re-enable sau terminal hoặc confirmed
  pre-admission rejection.
- Đã thêm Run tab trong bottom panel. View render request/run-group IDs, group status, summary counts,
  selected device, device execution status, next node, timestamps, terminal error và compilation
  diagnostics. Compile-invalid diagnostics cũng xuất hiện trong Diagnostics tab.
- Sau admission/recovery, renderer poll `getRun(runGroupId)` mỗi giây với đúng một request outstanding.
  Read error chỉ hiện warning và tiếp tục poll; không đổi workflow result. Terminal snapshot dừng timer,
  còn typed by-id 404 chuyển sang trạng thái lost và cho kiểm tra lại active run thay vì relaunch Runtime.
- Khi workspace mở, `getActiveRun` phục hồi active execution; `{found:false}` là idle bình thường.
  Runtime/session chuyển lại READY có thể retry recovery. Poll cleanup khi navigation/unmount chỉ dừng
  view polling và không giả lập cancel execution.
- Uncertain admission giữ nguyên renderer intent và có action **Retry exact admission**; Phase E tiếp tục
  giữ exact pending wire body/requestId. Active, recovery-uncertain và lost states đều chặn Run mới.
- Explicit Runtime shutdown hỏi xác nhận khi có active/uncertain run và chỉ clear controller/UI sau
  shutdown thành công. Native Studio quit dùng Main controller state để đưa lựa chọn **Stay open** hoặc
  **Stop and exit**; không thêm nút Cancel giả vì Runtime chưa có public cancel API.
- Tests bao phủ active 404 recovery, correlated progress, saved-source start, Project artifact patch,
  single-flight polling, terminal stop, exact-intent retry, preparation events và shutdown state clear.
  Verification pass: lint, typecheck, toàn bộ test suite (`52/52`) và production desktop build. Global
  `format:check` vẫn chỉ báo file unrelated có sẵn
  `src/presentation/components/ui/toast-store.ts`; mọi file Phase F đều pass Prettier riêng.

### F1. Toolbar

- Xóa import/icon/state/callback cho **Compile** khỏi `MainWorkflowPage.tsx`.
- Enable **Run** và nối với `useTestRun`.
- Acquire synchronous ref lock ở đầu handler trước async operation; state `disabled` chỉ là phần UI.
- Label theo phase: `Preparing…`, `Compiling…`, `Starting…`, `Running…`.
- Re-enable sau terminal result hoặc confirmed pre-admission rejection. Không re-enable chỉ vì start HTTP
  response 201; execution lúc đó mới bắt đầu.

### F2. Snapshot model và polling

Sau 200/201:

1. lưu riêng `requestId`, `runGroup.id`, selected serial và snapshot;
2. render group status + summary, device status, next node, timestamps và terminal error;
3. poll `GET /runs/{runGroupId}` khoảng 1 giây/lần;
4. chỉ có một poll outstanding;
5. cancel view polling khi navigation/unmount nhưng hiểu rằng cancel poll không cancel execution;
6. stop khi group terminal: `SUCCEEDED`, `FAILED`, `CANCELLED`, `INTERRUPTED`;
7. read failure không được biến thành workflow success/failure.

`GET /runs/active` chạy khi execution view mở hoặc sau Runtime/session recovery. Một successful 404 chỉ
đặt state “no active run”. `GET /runs/{id}` 404 cho ID hợp lệ nghĩa là saved result không có trong store
hiện tại; không relaunch Runtime vì lý do đó.

### F3. Close/shutdown behavior

Runtime hiện chưa expose HTTP cancel action. Khi active run tồn tại:

- close Studio phải theo managed-runtime policy hiện có: **Stop and exit** hoặc **Stay open**;
- explicit Runtime shutdown có thể cancel owned execution theo private shutdown contract;
- không giả lập một nút Cancel bằng cách chỉ dừng polling.

## 10. File-level implementation map

| Khu vực | File hiện có/cần thêm | Thay đổi |
|---|---|---|
| Shared contracts | `src/application/runtime/runtime.types.ts` | Run DTOs, snapshots, states, start/read operations |
| Validation | `src/application/runtime/runtime.schema.ts` | Strict schemas và UUID/status/nullability rules |
| HTTP | `electron/main/runtime/http/runtime-http-client.ts` | POST start, active/by-id GET, status/error preservation |
| Runtime service | `electron/main/runtime/create-runtime-services.ts` | start/read methods qua readiness gate |
| Run orchestrator | thêm `electron/main/runtime/run/runtime-run-coordinator.ts` | single-flight, compile → CAS → refresh → start, pending retry |
| IPC | `electron/main/ipc/register-runtime-handlers.ts` | parse limits, trusted sender, start/active/by-id handlers |
| Channels | `electron/shared/channels.ts` | ba channel run mới |
| Preload | `electron/preload/index.cts` | expose typed narrow methods |
| Renderer API | `src/infrastructure/electron/studio-host-api.ts` | HostResult signatures mới |
| Validation hook | `src/presentation/features/workflow-editor/useWorkflowValidation.ts` | 3s serialized scheduler |
| Test Run UI | thêm `src/presentation/features/test-run/*` | picker, inputs, controller, progress/result |
| Workspace | `src/presentation/pages/MainWorkflowPage.tsx` | bỏ Compile, enable Run, connect dialog/progress |
| Persistence | `electron/main/bootstrap.ts`, repository interface nếu cần | inject CAS callback và trả refreshed snapshot |
| Runtime dev config | `../a2matex-runtime/Makefile` | verify/override ADB path; tránh developer absolute path |

## 11. Test plan

### 11.1. Unit tests

- Validation scheduler với fake timers cho debounce, single-flight, cooldown, stale response và cleanup.
- Zod schemas cho complete RunSnapshot, nullable fields, unknown fields, invalid UUID/status/cursor.
- Start coordinator:
  - compile invalid → không persist/refresh/start;
  - CAS conflict → không start;
  - device không còn READY → không start;
  - 201 → created result;
  - lost response → pending request được giữ;
  - retry → cùng requestId/body;
  - simultaneous clicks → chỉ một compile/start chain.
- Error mapping giữ 404/409/422/503 semantics và không trigger replacement sai.
- Project Draft in-memory snapshot được update sau CAS persistence.

### 11.2. HTTP/IPC integration tests

- Tất cả operation mới đi qua current session bearer token và readiness probe.
- `POST /devices/refresh` không có body, kể cả `{}` hoặc `null`.
- `GET /runs/*` không có body/query.
- `POST /runs` serialize IR object đúng một lần, body dưới 4 MiB, IR dưới 1 MiB.
- 201 và exact replay 200 trả cùng `runGroup.id` và không dispatch lần hai.
- `GET /runs/active` 404 là normal result.
- Untrusted IPC sender và malformed renderer input bị reject trước HTTP.

### 11.3. Manual/E2E acceptance

1. Start Studio với Runtime build `VERSION=0.1.0` và ADB path đã verify.
2. Connect/authorize một Android device; refresh picker thấy `READY`.
3. Edit graph liên tục; network trace cho thấy chỉ một validation sau 3 giây idle.
4. Edit tiếp trong lúc validation chậm; không có overlap và request mới chờ 3 giây sau response cũ.
5. Bấm Run nhanh nhiều lần; chỉ có một compilation và một new admission.
6. Xác nhận IR vừa compile được lưu trong Draft với matching `sourceRevision`/workflow provenance.
7. Xác nhận `POST /runs` nhận đúng IR đó và selected serial/inputs.
8. UI render snapshot, poll đến terminal, rồi re-enable Run.
9. Gửi lại exact pending request sau simulated lost response; Runtime trả 200 với cùng RunGroup.
10. Restart/open execution view trong lúc run active; `GET /runs/active` phục hồi snapshot.
11. Sau terminal, `GET /runs/active` trả 404 nhưng `GET /runs/{id}` vẫn đọc saved result.
12. Edit graph giữa compile và persist trong test race; CAS chặn run với stale IR.

Chạy quality gates của Studio:

```sh
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build:desktop
```

Và Runtime regression:

```sh
make test
make build VERSION=0.1.0
```

## 12. Thứ tự triển khai đề xuất

1. **ADB preflight + Runtime smoke** — loại bỏ lỗi môi trường trước khi debug Studio.
2. **Run DTO/schema + HTTP methods** — khóa contract và error semantics.
3. **Main run coordinator + persistence CAS** — chứng minh compile/persist/admission không race.
4. **IPC/preload bridge** — expose operation hẹp cho renderer.
5. **Device picker + input form** — tạo valid admission input.
6. **Run toolbar/progress/polling/recovery** — hoàn thiện user flow.
7. **Validation scheduler 3 giây** — có thể làm song song về code, nhưng merge cùng fake-timer tests để
   tránh regression editor.
8. **E2E với Runtime thật và device/emulator** — kiểm tra idempotency, recovery và shutdown.

## 13. Definition of Done

- Không còn nút/action Compile cho người dùng; Runtime compilation chỉ chạy bên trong Run.
- Auto-validation tuân thủ đủ idle 3 giây, single-flight và post-response cooldown 3 giây.
- Double-click Run không thể tạo hai intent mới.
- Successful compile được CAS-persist vào đúng Draft revision trước khi run admission.
- `POST /runs` dùng chính `runtimeIr` vừa compile, đúng một READY device và validated inputs.
- Retry uncertain start giữ nguyên requestId/body; 200 replay không chạy lại workflow.
- Active/by-ID snapshots hiển thị đúng và polling dừng ở terminal state.
- Health, runtime-info, 404 và error codes được hiểu đúng; không restart Runtime vì data-level 404 hoặc
  semantic rejection.
- ADB executable path được verify trên host, không hard-code username vào committed Makefile.
- Unit/integration/E2E acceptance ở trên pass và không làm regression Android Inspector.
