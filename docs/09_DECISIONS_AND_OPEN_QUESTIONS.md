# 09 — Decisions và open questions

Tài liệu này ngăn team “chốt ngầm” những contract có ảnh hưởng tới Runtime, Desktop Client hoặc Marketplace. Mỗi mục `OPEN` cần owner, deadline theo milestone và ADR/link khi chốt.

## 1. Decisions đã kế thừa từ `docs/`

| ID    | Status   | Decision                                                                                                                        |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| D-001 | ACCEPTED | Electron + React + TypeScript + Vite cho Studio desktop.                                                                        |
| D-002 | ACCEPTED | Tailwind + shadcn/ui/Radix + Lucide cho Presentation.                                                                           |
| D-003 | ACCEPTED | React Flow và Monaco là adapters, không phải domain model.                                                                      |
| D-004 | ACCEPTED | Clean Architecture; inner layers không phụ thuộc UI/Electron/network implementation.                                            |
| D-005 | ACCEPTED | Renderer không truy cập trực tiếp filesystem/process/ADB; preload API hẹp.                                                      |
| D-006 | ACCEPTED | Studio và Desktop Client dùng chung Runtime Engine.                                                                             |
| D-007 | ACCEPTED | Code → graph chỉ cho syntax A2MaTeX bị giới hạn, không arbitrary JavaScript.                                                    |
| D-008 | ACCEPTED | Explicit Save luôn khả dụng; autosave dùng debounce theo cấu hình và recovery draft vẫn độc lập. |
| D-009 | PROPOSED | Project source JSON human-readable; build artifact canonical/deterministic.                                                     |
| D-010 | PROPOSED | Runtime/Package/Project/Node đều version contract độc lập.                                                                      |
| D-011 | ACCEPTED | Authoring project là folder với manifest a2matex.project.json; workflow dùng hậu tố .workflow.json. Xem ADR-001.                |
| D-012 | ACCEPTED | Project schema v1 giữ extension fields chưa biết; v0 được migrate sang v1, future version bị từ chối an toàn. Xem ADR-001.      |
| D-013 | ACCEPTED | Renderer chỉ thao tác project qua location capability token do Electron main cấp; không gửi filesystem path tùy ý. Xem ADR-001. |
| D-014 | ACCEPTED | WorkflowDocument là source of truth; React Flow chỉ là projection/interaction adapter. Xem ADR-002.                             |
| D-015 | ACCEPTED | Phase 2 author control-flow; graph v1 từ chối arbitrary cycle và dành data-edge UI cho phase sau. Xem ADR-002.                  |
| D-016 | ACCEPTED | Built-in node catalog/version/property schema và validator issue contract được định nghĩa trong domain. Xem ADR-002.            |
| D-017 | ACCEPTED | Login online là entry vào remote catalog; offline chỉ dùng last-known-good cache của identity đã login trước đó. Xem ADR-003.    |
| D-018 | ACCEPTED | Auth HTTP, token vault và catalog cache chạy ở Electron main; renderer không nhận token hoặc đọc cache file. Xem ADR-003.         |
| D-019 | ACCEPTED | Remote catalog là production source; built-in catalog chỉ là dev/test adapter và không được merge ngầm. Xem ADR-003.             |
| D-020 | ACCEPTED | Startup/login/manual retry/reconnect dùng network-first sync; cache chỉ fresh sau valid 200/304. Xem ADR-003.                     |
| D-021 | ACCEPTED | catalogHash là opaque revision/validator, không phải integrity proof khi chưa có canonicalization/signature contract.            |
| D-022 | ACCEPTED | Login/refresh trả access + refresh token; access memory-only, refresh trong OS vault, startup silent refresh và rotation. Xem ADR-003. |
| D-023 | ACCEPTED | Runtime sở hữu ADB discovery/connection/process/handler mapping; Studio chỉ dùng Runtime contract và không gửi raw ADB command. |
| D-024 | ACCEPTED | Login request chỉ gồm account/password; trường code đã được loại khỏi UI, IPC và HTTP contract. |
| D-025 | PROPOSED | Windows MVP dùng public download → NSIS traditional installer/EULA → in-app onboarding; download gate không thay license check. Xem ADR-004. |
| D-026 | ACCEPTED | Onboarding state là versioned app-local config do Electron main lưu dưới userData; project-root authority vẫn dùng main-owned capability. Xem ADR-004. |

## 2. Open questions còn lại từ Phase 0–2

| ID    | Question                                        | Default đề xuất                                         | Owner           | Deadline         |
| ----- | ----------------------------------------------- | ------------------------------------------------------- | --------------- | ---------------- |
| Q-001 | Windows là target duy nhất hay cần macOS/Linux? | Windows-first, không hard-code path/process assumptions | Product/Desktop | Trước public beta |
| Q-004 | Project/workflow extension và MIME chính thức?  | Tên rõ namespace; tránh đổi sau public beta             | Core/Platform   | Trước public beta |

## 3. Open questions blocking Desktop Onboarding/Distribution

| ID    | Question | Default đề xuất | Owner | Deadline |
| ----- | -------- | --------------- | ----- | -------- |
| Q-018 | Ai sở hữu nội dung/version EULA, Terms, Privacy và phân loại material change? | Product/Policy manifest versioned; legal/privacy review trước release | Product/Legal/Privacy | Trước P2.4 freeze |
| Q-019 | Onboarding và auth guard chạy theo thứ tự nào? | Hydrate onboarding trước; setup local xong mới restore/login, giữ return URL | Desktop/Product | Trước P2.4 implementation |
| Q-020 | Từ chối required policy dẫn tới Exit hay limited mode? | MVP cho review lại hoặc Exit; không giả accepted | Product/Legal | Trước Policies UI |
| Q-021 | Default project root có bắt buộc để Finish và được persist bao lâu? | Required cho MVP; main lưu canonical path, renderer chỉ nhận display/capability | Product/Desktop/Security | Trước Workspace UI |
| Q-022 | Kênh download/installer/update và uninstall cleanup policy? | Public download, NSIS traditional, signed production artifact; giữ userData mặc định | Release/Security/Product | Trước Windows RC |
| Q-023 | Consent nào phải đồng bộ backend theo account và xử lý offline/multi-device ra sao? | Local là UX cache; server authoritative khi login/policy yêu cầu bằng chứng | Identity/Privacy | Trước public production |

ADR-004 giữ D-025 ở trạng thái Proposed cho tới khi policy owner, installer owner và guard order được
review. D-026 chỉ chốt technical trust boundary, không tuyên bố local consent có giá trị pháp lý.

## 4. Open questions blocking Identity/Node Catalog

| ID    | Question | Default đề xuất | Owner | Deadline |
| ----- | -------- | --------------- | ----- | -------- |
| Q-009 | API base URL/environment và production TLS policy? | Build/runtime config allow-list; HTTPS-only production | Platform/Security | Trước P2.5 |
| Q-011 | Token expiry, refresh/revoke/logout endpoint và rotation semantics? | Refresh trả cặp token mới; access memory-only; refresh trong OS vault; single-flight + retry-once | Identity/Security | Trước session restore |
| Q-012 | Client gửi validator nào để nhận `304`? | Standard `ETag` + `If-None-Match` chứa catalogHash | Catalog API | Trước sync adapter |
| Q-013 | Node version nằm ở đâu khi response không có version? | Thêm explicit immutable version; không synthesize `1` | Catalog/Runtime/Core | Trước normalization |
| Q-014 | Input/control port được mô tả thế nào; input/output schema map data edge ra sao? | Explicit input/output port arrays + examples | Catalog/Runtime/Core | Trước remote palette |
| Q-015 | JSON Schema draft/subset, `$ref`, defaults và editorHints contract? | Versioned safe subset, no remote ref | Catalog/UI/Security | Trước remote Inspector |
| Q-016 | Stable account ID/tenant scope cho cache và logout có xóa cache không? | Server trả subject/tenant; giữ cache theo policy, clear action riêng | Identity/Product | Trước cache schema freeze |
| Q-017 | `runtimeVersion` lấy từ bundled, detected hay selected Runtime khi chưa connect? | Host-reported effective Runtime version | Runtime/Desktop | Trước catalog request |

Implementation checkpoint 2026-10-14: development adapter đọc API origin từ
`VITE_API_BASE_URL` trong `.env`, và packaged app từ chối origin không phải HTTPS. Production environment
allow-list của Q-009 vẫn cần Platform/Security chốt. Q-011 chưa được chốt nên client chỉ lưu refresh
token đã mã hóa; chưa gọi silent refresh/revoke và không suy đoán endpoint/payload/rotation.

## 5. Open questions blocking Runtime integration

| ID    | Question                                            | Default đề xuất                                         | Owner                 | Deadline                 |
| ----- | --------------------------------------------------- | ------------------------------------------------------- | --------------------- | ------------------------ |
| Q-101 | Runtime là child process, service hay library?      | Port trừu tượng; ưu tiên isolated local process/service | Runtime/Desktop       | Trước Phase 4            |
| Q-102 | Transport/protocol là gì?                           | Typed bidirectional streaming, codegen nếu khả thi      | Runtime/Desktop       | Trước Phase 4            |
| Q-103 | Ai sở hữu process lifecycle/update Runtime?         | Desktop host supervisor; Runtime versioned riêng        | Runtime/Desktop       | Trước Phase 4            |
| Q-104 | IR format và compatibility window?                  | Versioned envelope + explicit supported versions        | Compiler/Runtime      | Trước compiler freeze    |
| Q-105 | Expression language và evaluation sandbox?          | Không `eval`; parser/AST giới hạn                       | Core/Security/Runtime | Trước expression nodes   |
| Q-106 | Android control dùng ADB, accessibility hay hybrid? | Capability-based adapter; workflow không biết transport | Runtime/Android       | Trước tap implementation |
| Q-107 | Device identity/authorization semantics?            | Session-safe ID; raw serial hạn chế và redact           | Runtime/Security      | Trước device UI          |
| Q-108 | Pause/step/breakpoint semantics có trong MVP?       | Trace/run/stop P0; feature gate phần còn lại            | Product/Runtime       | Phase 4 planning         |
| Q-109 | Run unsaved working copy có được phép?              | Có, compile immutable revision và hiển thị revision     | Product/Core          | Phase 4                  |
| Q-110 | Runtime event retention/reconnect?                  | sequence + bounded local buffer + snapshot/query API    | Runtime/Desktop       | Phase 4                  |
| Q-111 | JSON Runtime nhận là authoring workflow hay executable IR JSON? | Executable IR JSON đã compile/validate; authoring JSON chỉ ở Studio | Compiler/Runtime | Trước IR schema freeze |
| Q-112 | ADB binary được bundle với Runtime hay dùng bản hệ thống; version support? | Runtime-managed verified binary + reported version | Runtime/Release | Trước device integration |
| Q-113 | Một emulator cho phép bao nhiêu run đồng thời và lock/queue semantics? | Một active controller/run trên mỗi device, request khác fail/queue explicit | Runtime/Product | Trước multi-run test |
| Q-114 | Runtime có sở hữu launch/stop emulator hay chỉ attach device có sẵn? | Capability-gated adapter; MVP attach device có sẵn | Runtime/Product | Trước device UI freeze |

## 6. Open questions blocking package/publish/license

| ID    | Question                                                          | Default đề xuất                                        | Owner                    | Deadline               |
| ----- | ----------------------------------------------------------------- | ------------------------------------------------------ | ------------------------ | ---------------------- |
| Q-201 | Package extension/layout/schema name?                             | Chốt trước public artifact; schema version từ v1       | Platform/Core            | Trước Phase 6          |
| Q-202 | Signing trust model?                                              | Remote production signing; OS-keystore dev identity    | Security/Platform        | Trước Phase 6          |
| Q-203 | Third-party node chứa code hay chỉ declarative handler reference? | MVP chỉ signed built-in handlers; không arbitrary code | Product/Security/Runtime | Trước Marketplace beta |
| Q-204 | Marketplace upload protocol/size/resume/idempotency?              | Draft + digest + resumable upload + idempotency key    | Marketplace/Desktop      | Trước Phase 6          |
| Q-205 | Publisher ownership và package namespace?                         | Immutable package ID bound publisher/org               | Marketplace              | Trước first publish    |
| Q-206 | Offline license duration/device binding/concurrency?              | Signed short-lived grant; policy do Marketplace sở hữu | Product/Security         | Trước end-user beta    |
| Q-207 | Runtime hay Desktop verify license grant?                         | Trusted boundary verify, Runtime nhận scoped grant     | Security/Runtime/Desktop | Trước end-user beta    |
| Q-208 | Source map có nằm trong production package?                       | Có bản redacted/minimal phục vụ error mapping          | Security/Runtime         | Phase 6                |
| Q-209 | Rollback/yank/revoke release semantics?                           | Side-by-side versions + server revocation policy       | Marketplace/Desktop      | Trước GA               |

## 7. Open questions về dữ liệu và vận hành

| ID    | Question                                    | Default đề xuất                                        | Owner            | Deadline   |
| ----- | ------------------------------------------- | ------------------------------------------------------ | ---------------- | ---------- |
| Q-301 | Telemetry mặc định và consent?              | Off/opt-in theo policy; không gửi workflow/node params | Product/Privacy  | Trước beta |
| Q-302 | Local log/recovery retention?               | Bounded size/time, configurable, clearable             | Desktop/Security | Phase 3    |
| Q-303 | Crash/support bundle chứa gì?               | Preview + deterministic redaction trước export         | Support/Security | Phase 5    |
| Q-304 | Auto-update channel và signing certificate? | Stable/beta channel; signed installer/update           | Release/Security | Trước beta |
| Q-305 | Supported Android/ADB/device matrix?        | Công bố matrix và hardware CI smoke                    | Runtime/QA       | Phase 4    |

## 8. Quy tắc chốt contract

- Có consumer và producer cùng review.
- Có example payload/schema + error cases, không chỉ prose.
- Nêu versioning, backward compatibility và deprecation window.
- Có contract test owner và fixture canonical.
- Security/privacy review nếu qua process/network/trust boundary.
- Cập nhật compatibility matrix và roadmap issue liên quan.
