# 01 — Phạm vi và yêu cầu

> Các contract kỹ thuật để triển khai yêu cầu này nằm trong
> [`specs/`](../specs/README.md).

## 1. Mục tiêu sản phẩm

A2MaTeX Studio giúp publisher xây dựng automation app cho Android bằng workflow trực quan, kiểm thử bằng đúng Runtime sẽ dùng ở môi trường người dùng, rồi đóng gói/publish vào hệ sinh thái A2MaTeX.

Giá trị cốt lõi của Studio:

- authoring nhanh bằng node palette + canvas + inspector;
- hành vi nhất quán giữa test trong IDE và chạy trong Desktop Client;
- lỗi workflow được phát hiện trước khi chạy;
- package tái lập, version hóa và có thể xác minh;
- giới hạn rõ quyền truy cập thiết bị, filesystem và network.

Đối tượng chính là **publisher/automation builder** hiểu quy trình và màn hình Android cần thao tác
nhưng không bắt buộc biết JavaScript, ADB hay kiến trúc workflow engine. Định hướng sản phẩm là
**system-node-first**: ưu tiên node khai báo, form trực quan và expression picker; Code node chỉ là
phần mở rộng có kiểm soát sau khi các primitive node không còn đáp ứng.

## 2. Actor và trách nhiệm

| Actor                        | Mục tiêu                                                                 | Ngoài phạm vi của Studio             |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------ |
| Automation publisher/builder | Tạo, test, build và submit automation product                            | Mua app như end-user                 |
| Identity/Catalog API         | Xác thực developer, cấp token và trả node catalog phù hợp Runtime        | Giữ editor state hoặc project source |
| Marketplace reviewer         | Kiểm tra metadata, revision, quyền và release                            | Chỉnh workflow thay publisher        |
| Runtime Agent                | Validate/execute IR, phát event, điều khiển device                       | Render editor UI                     |
| Marketplace API              | Nhận package/metadata, quản lý release                                   | Compile workflow trong IDE           |
| Desktop Client               | Kiểm license, tải package, gọi Runtime                                   | Authoring workflow                   |
| Android device               | Nhận thao tác qua adapter được hỗ trợ                                    | Hiểu workflow/package                |
| Release/Policy owner         | Phát hành installer, version EULA/Terms/Privacy và quyết định re-consent | Tự suy diễn consent từ local flag    |

### 2.1 Ranh giới trách nhiệm sản phẩm

Studio chịu trách nhiệm quản lý project/draft, graph editor, node palette, input schema, test data,
assets, validation, capability summary, biên dịch Runtime IR, kết nối Runtime để test và gửi
revision lên Marketplace.

Studio không quản lý license của customer, entitlement, mã hóa workflow để phân phối, production
scheduling hoặc số lượng thiết bị được phép chạy. Renderer không thực thi ADB trực tiếp; Code node
không được gọi ADB, filesystem, process, credential hoặc Internet. Các trách nhiệm đó thuộc Backend,
Marketplace, Desktop Client hoặc Runtime.

## 3. User journey mục tiêu

### 3.0 Cài đặt và first-run onboarding

1. User tải bản Windows từ kênh phát hành chính thức; MVP ưu tiên public download, không xem download
   gate là cơ chế license.
2. Installer NSIS hiển thị EULA đã được rà soát nếu product yêu cầu, cho chọn install directory và
   cài bản đã được ký ở production.
3. Lần đầu mở app, Studio hydrate onboarding state từ Electron main trước khi quyết định route.
4. User đi qua Welcome → Terms/Privacy → Workspace Setup → Optional Setup → Finish.
5. Workspace picker dùng project/location service hiện có; renderer không nhận filesystem authority
   từ một raw path.
6. Sau Finish, app tiếp tục session restore/login rồi vào Projects/Workspace. Mở lại app không lặp
   onboarding nếu state hợp lệ; policy version thay đổi có thể yêu cầu review lại mà không xóa project.

### 3.1 Authoring

1. Publisher đăng nhập online bằng account/password.
2. Studio lấy danh sách node catalog từ server. Khi offline, Studio chỉ dùng bản cache hợp lệ gần nhất và hiển thị rõ trạng thái stale.
3. Tạo hoặc chọn input schema, assets và test profile.
4. Tạo workflow và kéo node từ palette vào canvas.
5. Kết nối control edge; cấu hình data binding bằng expression picker thay vì buộc vẽ data wire.
6. Chọn node và chỉnh config, input mapping, retry, timeout, error policy trong Inspector.
7. IDE validate liên tục, hiển thị lỗi tại node và Problems panel.
8. Lưu project theo thao tác explicit và autosave đã cấu hình.

### 3.2 Test và debug

1. Chọn Runtime profile và emulator hoặc Android device mục tiêu.
2. IDE validate workflow, kiểm tra Runtime compatibility và permissions/capabilities, sau đó chuyển
   workflow thành script JSON thực thi (`executable IR JSON`).
3. Khi người dùng chọn **Run**, IDE gửi script JSON sang Runtime qua Runtime contract; IDE/renderer
   không trực tiếp chạy lệnh ADB.
4. Runtime validate lại script JSON, tự động khởi chạy tiến trình ADB (CMD/child process trên
   Windows), kết nối tới emulator/device đã chọn và kiểm tra device sẵn sàng.
5. Runtime thực thi script trên device; IDE nhận trạng thái, execution event và log có cấu trúc để
   hiển thị tiến trình chạy.
6. Người dùng có thể chạy toàn workflow, chạy node đã chọn hoặc `Run from here` khi input
   phụ thuộc đã được pin/mock; IDE phải cảnh báo partial run không tương đương chạy từ Start.
7. Người dùng có thể pause/step/stop nếu Runtime capability hỗ trợ.
8. Chọn execution event để highlight node và xem input/output đã redact, duration, retry, branch,
   sequence và loop iteration.

### 3.3 Build và publish

1. Chạy full validation.
2. Compile Runtime IR, tổng hợp capability/permission và tạo immutable revision từ snapshot đã chọn.
3. Build package deterministic, sinh manifest và checksum.
4. Ký package bằng cơ chế đã chốt; private key không nằm trong renderer/project.
5. Upload draft, revision, metadata và assets.
6. Marketplace validate, scan, review và phát hành đúng revision bất biến đó.

## 4. Yêu cầu chức năng theo mức ưu tiên

### P0 — Authoring foundation

- Tạo, mở, lưu, Save As project cục bộ.
- Project Explorer cho workflows, inputs, assets, test profiles và manifest.
- Canvas add/move/select/delete/connect node; undo/redo.
- Node palette có search/category và drag/drop.
- Inspector sinh form từ NodeDefinition config/input/output schema.
- Validation cấu trúc, type, required config/bindings và graph rules.
- Problems/Output panel liên kết lỗi với node/file.
- Workflow serialization không phụ thuộc React Flow.
- Dirty state, recovery draft và cảnh báo khi đóng.

### P0 — Desktop onboarding

- Route/flow first-run gồm Welcome, Policies, Workspace và Finish; hydrate xong mới render guard để
  không nháy sai màn hình.
- Onboarding state có `schemaVersion`, completion, accepted policy versions, analytics preference,
  completion time và default project-root reference.
- Electron main sở hữu load/save state dưới `userData/config`, validate IPC hai chiều và ghi atomic;
  onboarding config không nằm trong project/package.
- Workspace picker tái sử dụng `ProjectFileService`/`LocationRegistry`; persisted path chỉ là dữ liệu
  private của main, renderer dùng DTO hiển thị + opaque capability.
- Terms/Privacy bắt buộc không pre-check; analytics/marketing consent là lựa chọn tách riêng và có
  thể thay đổi trong Settings.
- Policy version mới có rule re-consent rõ; từ chối policy bắt buộc dẫn tới Exit hoặc limited mode đã
  được product chốt, không tự coi đóng dialog là đồng ý.
- Offline vẫn hoàn thành được setup local; bước cần backend được đánh dấu pending thay vì giả thành
  công. Local flag không thay auth/license hoặc server-side consent khi backend yêu cầu.

### P0 — Identity và node catalog

- Màn /login gửi account, password tới POST /api/v1/auth/login qua Electron main, không gọi
  API hoặc giữ token trực tiếp trong renderer.
- Login response luôn trả `accessToken` và `refreshToken`. Access token chỉ nằm trong memory của
  Electron main; refresh token được lưu bằng OS credential store để phục hồi phiên sau khi đóng/mở
  app mà không yêu cầu user đăng nhập lại.
- Khi khởi động, main process đọc refresh token và gọi refresh endpoint để lấy cặp token mới
  (rotation), rồi mới đồng bộ catalog. Không đưa refresh token cũ/mới qua renderer.
- Trước request khi access token sắp hết hạn, hoặc sau một response `401`, chỉ một refresh request
  được chạy; request ban đầu retry tối đa một lần. Refresh token hết hạn/bị revoke mới đưa user về
  màn login.
- Sau login, gọi GET /api/v1/node-catalog?runtimeVersion=... và validate toàn bộ response trước khi
  đưa vào domain.
- Cache atomically catalog hợp lệ gần nhất theo server/account/Runtime version; cache không nằm
  trong project, không commit và không đóng gói.
- Khi mất mạng, cho phép authoring bằng cache nếu có và gắn trạng thái cached-offline; không có
  cache thì palette bị chặn với Retry/Diagnostics rõ ràng.
- Khi hệ điều hành báo có mạng trở lại, bắt buộc trigger sync mới. Cache có thể tiếp tục hiển thị
  trong lúc refresh nhưng không được đánh dấu fresh trước khi nhận 200 hợp lệ hoặc 304.
- Logout gọi revoke endpoint nếu backend hỗ trợ, xóa access token khỏi memory, xóa refresh token
  khỏi OS credential store và xóa session metadata; policy giữ/xóa catalog cache phải explicit và
  account-scoped.

### P0 — Runtime vertical slice

- Liệt kê/chọn device.
- Connect/disconnect Runtime.
- Studio compile authoring JSON thành versioned executable JSON; Runtime validate lại artifact trước
  khi dispatch handler.
- Runtime sở hữu ADB discovery, device authorization/selection, command mapping, timeout và cleanup;
  Studio/executable instruction params không gửi raw ADB command.
- Run/stop workflow tối thiểu với `trigger.start`, `flow.delay`, `android.tap`, `debug.log`.
- Streaming execution status/log và highlight node đang chạy.
- Error có code, message, source node và recoverability.

### P1 — IDE completeness

- Multi-workflow project và tab management.
- Copy/paste/duplicate, keyboard shortcuts, command palette.
- Zoom/minimap/fit view; node disable; breakpoint nếu Runtime hỗ trợ.
- Monaco view và source mapping giữa IR/code với node.
- Project settings, Runtime profiles và environment variables không chứa secret thô.
- Template/example project và import/export project.

### P1 — Node library và test experience

- Mở rộng từ vertical slice bốn node lên mục tiêu 27–35 node type theo nhóm flow/data, Android
  action, observation, connector và debug; ưu tiên primitive có khả năng kết hợp cao.
- If/Switch, error branch, Merge và Loop Controller có giới hạn; không cho arbitrary cycle hoặc
  parallel Android action trên cùng device.
- Input schema, nhiều test profile, pin/mock input, chạy node đơn lẻ và `Run from here`.
- Execution Inspector hiển thị input/output, duration, retry, screenshot/artifact, branch, sequence
  và iteration với redaction.
- Multi-device smoke test là P1 có feature flag; mặc định một device execution chạy tuần tự.

### P1 — Distribution

- Package validation/build/checksum/sign.
- Publisher identity và Marketplace draft upload.
- Release version + changelog + declared permissions/capabilities.
- Publish progress/error/retry và release result.

### P2 — Sau MVP

- Subworkflow, reusable component/node bundle.
- Multi-device runs, scheduler, remote execution.
- Collaboration/realtime editing.
- Code node sandboxed cho biến đổi dữ liệu nếu primitive/expression không đủ; không phải phạm vi MVP.
- Marketplace analytics và advanced debugger/profiler.

## 5. Yêu cầu phi chức năng

### Correctness

- Cùng input, project version và Runtime version phải tạo cùng IR/package digest (trừ các field timestamp bị loại khỏi digest).
- Không được silently drop field chưa hiểu khi open/save project.
- Mọi format bền vững đều có `schemaVersion` và migration test.

### Performance targets ban đầu

- Mở project mẫu (≤ 10 workflows, ≤ 500 nodes tổng) trong khoảng 2 giây trên máy dev chuẩn.
- Interaction canvas duy trì cảm giác 60 FPS ở workflow 200 nodes; không block UI bởi validation/build/IO.
- Validation incremental phản hồi trong 200 ms cho một thay đổi node phổ biến.
- Log view không render toàn bộ lịch sử; virtualize/buffer khi log lớn.

Các con số là budget kỹ thuật ban đầu, phải benchmark và điều chỉnh bằng dữ liệu.

### Reliability

- Save dùng write-to-temp + atomic replace tại main process.
- Recovery draft không ghi đè source project khi chưa xác nhận.
- Runtime disconnect không làm mất project edits.
- Stop có timeout và escalation policy rõ ràng; UI không giả báo `stopped` trước acknowledgement.
- Network online/offline chỉ là tín hiệu để thử đồng bộ, không phải bằng chứng server reachable.
- Catalog response mới chỉ thay cache sau khi parse, validate và ghi atomic thành công; response lỗi
  không được làm mất cache cuối cùng.
- Onboarding state corrupt/unsupported không làm mất project; app về recovery/setup state có giải
  thích và chỉ replace file sau khi payload mới hợp lệ.

### Security

- Electron `contextIsolation=true`, `nodeIntegration=false`, sandbox bật khi khả thi.
- IPC allow-list với validation request/response ở cả preload và main.
- Package và downloaded node bundle được verify integrity/signature.
- Secret được lưu qua OS credential store hoặc service chuyên trách, không trong JSON project.
- Password không được persist hoặc log; access/refresh token không đi qua renderer IPC.
- Catalog cache tách theo identity + environment + Runtime version để không rò dữ liệu giữa account.
- EULA/Terms/Privacy content và version đến từ artifact/config tin cậy; renderer không thể tự ghi
  `completed=true` hoặc tự cấp quyền filesystem qua onboarding IPC.

### Accessibility và usability

- Core command dùng được bằng keyboard.
- Focus, dialog, menu và tooltip dùng accessible primitives.
- Không chỉ dùng màu để biểu đạt trạng thái; lỗi gắn message/icon/text.
- Panel sizes và workspace state được phục hồi theo user/workspace.
- Onboarding có thứ tự focus, step label, keyboard navigation và link policy đọc được; consent bắt
  buộc và analytics opt-in không chỉ phân biệt bằng màu.

## 6. Success criteria

- Publisher mới hoàn thành sample automation trên device thật mà không chỉnh JSON thủ công.
- Publisher không biết code vẫn cấu hình được input, branch, loop, Android action và test profile bằng node hệ thống.
- Partial run và full run hiển thị đúng node execution, branch, sequence/iteration và dữ liệu đã redact.
- Project lưu/mở lại không thay đổi semantic workflow.
- Cùng artifact chạy qua Studio và Desktop Client bằng cùng Runtime contract.
- Lỗi validation/runtime dẫn người dùng về đúng node/property.
- Package bị sửa sau build bị từ chối trước execution/publish.
- Login online lấy được catalog; restart/mất mạng vẫn dùng đúng cache gần nhất, và reconnect luôn
  phát sinh một lần revalidation/sync có thể quan sát được.
- Fresh install đi qua onboarding đúng một lần, lưu state ngoài project và chọn workspace qua main;
  policy version mới yêu cầu review lại mà không phá project hoặc auth credential.
