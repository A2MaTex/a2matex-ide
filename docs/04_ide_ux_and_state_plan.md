# 04 — IDE UX và state plan

## 1. Workspace composition

```text
┌───────────────────────────────────────────────────────────────┐
│ Menu / Project title / Device / Run controls                 │
├──────────────┬────────────────────────────┬───────────────────┤
│ Explorer     │ Editor tabs                │ Inspector         │
│              ├────────────────────────────┤                   │
│ Node Palette │ Workflow Canvas / Monaco   │ Schema form       │
├──────────────┴────────────────────────────┴───────────────────┤
│ Problems | Output | Runtime | Diagnostics                    │
└───────────────────────────────────────────────────────────────┘
```

Panel là composition trong `/workspace/:projectId`, không là routes riêng. Resizable panel layout được lưu trong workspace preference, không trong domain project.

## 2. Screen routes

```text
/onboarding              first-run/policy/workspace setup; route nội bộ có step state
/login                    đăng nhập online; có Continue offline nếu đủ điều kiện cache
/projects                 recent/create/open
/workspace/:projectId     IDE shell
/settings                 user/runtime/preferences
```

Unknown/deep link phải có recovery state; không giả định project local luôn còn tồn tại. App hydrate
onboarding trước session. Nếu onboarding required, mọi deep link được giữ làm return URL và chuyển
vào `/onboarding`; chỉ sau Finish mới chạy/tiếp tục session guard. Route `/projects`,
`/workspace/*` và catalog-dependent settings đi qua session guard. Cả hai guard phải chờ hydrate
trước khi redirect để tránh nháy onboarding/login.

## 3. Feature slices và trách nhiệm

| Feature                  | Presentation responsibility                                 | Application command/query             |
| ------------------------ | ----------------------------------------------------------- | ------------------------------------- |
| Onboarding               | stepper, policy consent, workspace selection, finish/review | load/complete/review onboarding       |
| Login/Session            | form, pending/error, logout, offline continuation           | authenticate/restore/logout           |
| Catalog status           | freshness banner, retry, last sync, empty/error             | load/refresh catalog                  |
| Project Explorer         | tree, selection, context menu                               | create/rename/delete/open resource    |
| Node Palette             | search, filter, drag payload                                | query catalog, create node command    |
| Inputs and Test Profiles | input schema, local values, pin/mock, credential reference  | manage input schema/profile           |
| Workflow Canvas          | map view, gestures, selection                               | graph edit commands                   |
| Node Inspector           | render config, binding, retry/error controls từ schema      | update config/binding, validate node  |
| Code Editor              | render generated/restricted source                          | generate/parse restricted code        |
| Problems                 | group/filter/navigate                                       | query validation issues               |
| Output/Runtime           | virtualized event rendering                                 | subscribe/query run events            |
| Top Bar                  | command affordances/status                                  | save/build/run/stop/publish use cases |

## 4. State ownership

### Domain/application state

- current `ProjectSnapshot` và revision;
- workflow/node/edge/layout data;
- validation issues;
- catalog definitions;
- auth session state không chứa token;
- onboarding state/version và current policy manifest; persisted path authority vẫn ở main;
- catalog snapshot gồm source/freshness/hash/fetchedAt;
- run session aggregate;
- workflow input schema, local test profiles và pinned/mock input references;
- build/publish job state.

### Zustand editor session state

- selected node/resource;
- open tabs/active tab;
- panel visibility/sizes;
- canvas viewport và temporary drag/connection state;
- palette/filter state;
- active bottom tab;
- transient command status.

### Component-local state

- open/closed popover;
- field focus/temporary input before commit;
- hover state;
- dialog step currently displayed.

Không giữ hai bản mutable độc lập của workflow trong React Flow và domain store. React Flow receives a projection; interaction phát command tạo snapshot/revision mới.

## 5. Editor command model

Các graph edit đi qua command để hỗ trợ undo/redo và test:

```ts
type WorkflowCommand =
  | { type: 'node.add'; payload: AddNodeInput }
  | { type: 'node.move'; payload: MoveNodeInput }
  | { type: 'node.updateParams'; payload: UpdateNodeParamsInput }
  | { type: 'node.remove'; payload: RemoveNodeInput }
  | { type: 'edge.connect'; payload: ConnectNodesInput }
  | { type: 'edge.remove'; payload: RemoveEdgeInput };
```

- Coalesce continuous drag thành một undo step.
- Inspector field commit policy rõ ràng: immediate với switch/select; debounce/blur với text; validation vẫn phản hồi kịp thời.
- Undo/redo chỉ chứa authoring commands, không chứa selection, run events hay save/publish side effects.
- Sau undo/redo, dirty state tính từ saved revision chứ không phải boolean set thủ công.

## 6. Interaction flows P0

### Tạo project và test profile

1. Chọn Blank Automation, Android Interaction, Monitor and Notify hoặc Collect Data to Sheet.
2. Khai báo tên, mô tả, Runtime version, package Android mục tiêu và customer input schema.
3. Studio tạo main workflow, asset area và test profile local không chứa secret thô.
4. Credential được chọn bằng reference từ store tin cậy, không ghi vào profile/project.

### First-run onboarding và re-consent

1. App hiển thị splash trong khi main load/validate onboarding state và current policy manifest.
2. State thiếu/corrupt/incomplete mở `/onboarding`; state complete nhưng policy version không còn
   hợp lệ mở thẳng bước Policies ở review mode.
3. Welcome chỉ giới thiệu và không ghi completed state.
4. Policies hiển thị link/nội dung versioned. Required acceptance mặc định unchecked;
   analytics/telemetry là control riêng, không bị gộp vào required consent.
5. Workspace mở native directory picker qua preload. Main kiểm path/quyền, persist canonical path và
   trả display metadata/capability; cancel giữ user ở bước có thể quay lại.
6. Optional Setup chỉ chứa preference thực sự optional; unavailable backend integration được ghi
   pending và không chặn setup local khi offline.
7. Finish gửi một typed command. Main validate toàn bộ invariant, ghi state atomic, rồi guard tiếp
   tục session restore/login và cuối cùng về return URL hoặc `/projects`.
8. Settings cho xem policy hiện hành, đổi analytics preference và chọn lại default project root.
9. Policy material change yêu cầu review lại nhưng không xóa project, cache hoặc auth credential.
   Từ chối required policy cung cấp Exit hoặc limited mode nếu Q-020 đã chốt.

Step draft không đưa vào global persisted state cho tới khi user hoàn tất hoặc một field có policy
explicit save. Không log policy content, raw path hoặc analytics selection kèm identity ngoài schema
telemetry đã duyệt.

### Login và restore session

1. App giữ splash/session-loading state trong khi host đọc refresh token từ OS credential store;
   renderer không nhận access/refresh token và route guard chưa redirect.
2. Có refresh token và có mạng: host silent refresh, atomically lưu refresh token mới, giữ access
   token mới trong memory rồi trả `authenticated`. User đi thẳng tới return URL, không thấy login.
3. Không có refresh token hoặc refresh bị xác nhận invalid/expired/revoked: xóa credential/session
   cũ và mở `/login`.
4. Network unavailable/timeout khi restore: không xóa refresh token. Nếu có cache đúng identity thì
   vào `offline`; nếu không có cache thì hiện trạng thái không thể xác minh phiên với Retry.
5. Login form validate account/password và disable double submit. Login thành công lưu refresh
   token đúng policy, giữ access token ở main rồi sync catalog theo Runtime version.
6. Chỉ điều hướng tới return URL sau khi có catalog fresh hoặc cache fallback hợp lệ.
7. Login lỗi phân biệt invalid credentials, offline/timeout, server error và invalid response.
8. Khi offline, chỉ hiện `Continue offline` nếu host xác nhận có cache hợp lệ của identity đã login
   trước đó; không so khớp password cục bộ.

Password bị clear khỏi component state sau submit hoàn tất/unmount. Không đưa field này vào
Zustand, URL, analytics, error details hoặc support bundle.

Trong phiên đang chạy, token coordinator refresh trước expiry hoặc khi gặp `401`. UI chỉ thấy
trạng thái `refreshing-session` nếu tác vụ kéo dài; refresh thành công tiếp tục tác vụ, không đổi
route. Chỉ redirect login khi backend xác nhận refresh token không còn dùng được. Logout luôn kết
thúc local session dù revoke request tới server bị timeout.

### Catalog startup, offline và reconnect

1. Khi có session, load cache đúng scope ngay để giảm thời gian palette trống.
2. Nếu network khả dụng, chuyển trạng thái `refreshing` và gọi sync; cache cũ có thể render trong
   lúc chờ nhưng có badge rõ ràng.
3. `200`/valid `304` chuyển sang `fresh`; network failure giữ catalog với banner
   `Using cached nodes — refresh failed`.
4. Offline chuyển sang `cached-offline` và hiển thị thời điểm sync cuối.
5. Sự kiện reconnect trigger một refresh được dedupe. Nhiều online event không tạo request song song.
6. Cache miss hiển thị blocking empty state có Retry, Open Settings và Diagnostics; không fallback
   ngầm sang built-in production catalog.
7. Nếu catalog mới không còn definition đang dùng, canvas giữ unknown node placeholder và Problems
   hướng dẫn; không xóa hoặc tự đổi workflow.

### Add node

1. Palette query catalog snapshot từ application/store theo search/category; không import constant
   built-in trực tiếp.
2. Drag/click tạo intent gồm `type`, `version`, canvas position.
3. `AddNode` kiểm definition và tạo defaults.
4. Canvas map domain node sang React Flow node.
5. Node được select; Inspector focus field đầu tiên cần nhập.
6. Incremental validation cập nhật Problems/badge.

### Connect nodes

1. Canvas chỉ cho visual preview handle phù hợp.
2. `ConnectNodes` kiểm port, type, cardinality, duplicate/cycle rule.
3. Rejected connection hiển thị reason; không tự tạo rồi xóa edge gây flicker.

### Edit config và binding

1. Inspector resolve exact node definition version.
2. Schema form giữ draft hợp lệ về UI shape.
3. Command normalize value rồi cập nhật `params.config` hoặc `params.bindings` của domain node.
4. Validation issue map tới `propertyPath` và form control.

### Run

1. Save state không bắt buộc nếu Runtime nhận immutable in-memory snapshot; UI phải nói rõ run revision nào.
2. Preflight hiển thị blocking errors/warnings.
3. Khi running: disable incompatible edit hoặc đánh dấu edits thuộc next revision.
4. Runtime event highlight node nhưng không override selection của user.

### Chạy node đơn lẻ và Run from here

- `Run selected node` dùng input được pin từ execution trước hoặc mock input đã validate.
- `Run from here` yêu cầu mọi dependency đầu vào có giá trị và device state phù hợp.
- UI gắn nhãn development partial run, cảnh báo kết quả có thể khác chạy từ Start và không dùng
  partial run làm bằng chứng publish duy nhất.
- Full workflow là luồng authoritative để kiểm tra branch, loop, capability và publish checklist.

## 7. Node visual states

Mỗi node có thể biểu diễn đồng thời:

- selection/focus;
- dirty/changed;
- validation severity;
- disabled/deprecated;
- runtime: queued/running/succeeded/failed/skipped;
- breakpoint/paused nếu supported.

Thiết kế phải dùng border/icon/badge/text, không chỉ màu. Runtime overlay là transient projection, không serialize vào workflow.

## 8. Problems, Output và Diagnostics

### Problems

- Nhóm theo workflow/file và severity.
- Click issue mở resource, focus node/property.
- Stable issue ID tránh list nhấp nháy giữa incremental validations.

### Output

- Channel: compiler, package, publish, general.
- Timestamp + level + message; copy/export với redaction.

### Runtime

- Theo `runId`, sequence number và node execution.
- Buffer/virtualization; backpressure hoặc truncation marker rõ ràng.

### Execution Inspector

Khi chọn một node execution, panel hiển thị input/output đã redact, duration, retry count, artifact
hoặc screenshot, biến thay đổi, Runtime/connector error, branch tiếp theo, `sequence` và loop
`iteration`. Node instance và node execution là hai identity khác nhau.

### Diagnostics

- IDE/Runtime version, transport status, selected device, capability summary.
- Export support bundle phải preview/redact token, secret, path/user data theo policy.

## 9. Keyboard và command palette

P0 shortcuts:

| Command          | Shortcut gợi ý                    |
| ---------------- | --------------------------------- |
| Save             | `Ctrl/Cmd+S`                      |
| Undo/Redo        | platform standard                 |
| Delete selection | `Delete/Backspace` có focus guard |
| Run              | `F5`                              |
| Stop             | `Shift+F5`                        |
| Search palette   | `/` hoặc focus-specific shortcut  |
| Command palette  | `Ctrl/Cmd+Shift+P`                |

Shortcut không kích hoạt graph command khi đang gõ trong input/Monaco trừ command global an toàn. Command palette gọi cùng application command với menu/button.

## 10. Loading, empty và error states

Mỗi panel cần tối thiểu:

- initial loading/skeleton hợp lý;
- empty state có next action;
- permission/unsupported state;
- recoverable error với Retry/Diagnostics;
- disconnected Runtime/device state;
- read-only project/unsupported schema state.
- authenticating/session-expired và catalog refreshing/cached-offline/cache-miss.
- onboarding-loading, policy-version-mismatch, workspace-missing/unwritable và save-retry state.

Không chỉ toast lỗi quan trọng; lỗi cần hành động phải tồn tại trong panel/dialog thích hợp.

## 11. Autosave và recovery

- Explicit Save luôn khả dụng. Khi autosave được bật, IDE debounce và chỉ lưu sau khi user ngừng
  chỉnh sửa theo khoảng thời gian đã cấu hình.
- Autosave dùng cùng transaction validate + atomic replace như Save thủ công và chỉ clear dirty khi
  revision vừa lưu vẫn là revision hiện tại.
- Project read-only, schema không được hỗ trợ hoặc validation serialization lỗi không được autosave;
  UI phải giữ dirty state và hiển thị cách khắc phục.
- Periodic recovery draft hoạt động độc lập với autosave để phục hồi khi renderer/app crash.
- Recovery key gồm project identity + source location fingerprint.
- Startup phát hiện draft mới hơn saved revision và cho preview/restore/discard.
- Restore tạo dirty working copy; không ghi source cho tới lần Save/autosave hợp lệ tiếp theo.
- Xóa recovery draft sau successful save đúng revision hoặc explicit discard.

## 12. UI definition of done

- Luồng P0 chạy bằng keyboard và mouse.
- Reload/open lại phục hồi project data; workspace preferences phục hồi riêng.
- Không có business rule trong React components/store actions.
- React Flow và Monaco được bọc bằng adapter components.
- Loading/empty/error/disconnected states có component test.
- Workflow cỡ target không gây long task đáng kể trong edit phổ biến.
- Auth form không leak secret; offline/fresh/refresh-failed states dùng được bằng keyboard và screen
  reader, không chỉ phân biệt bằng màu.
- Fresh install hoàn tất onboarding bằng keyboard; reload không lặp flow khi state/policy còn hợp
  lệ; re-consent, offline setup, cancel picker và invalid workspace đều có component/E2E test.
