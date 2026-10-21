# Tài liệu dự án A2MaTeX Studio

Thư mục `docs/` là knowledge base chung của project. Product/BA sở hữu mục tiêu, phạm vi và user
journey; các technical owner duy trì tài liệu thiết kế, vận hành và delivery liên quan. Những quyết
định kỹ thuật mang tính chuẩn tắc vẫn nằm trong [`specs/`](../specs/README.md).

## Bản đồ tài liệu

### Product và trải nghiệm

1. [01_scope_and_requirements.md](01_scope_and_requirements.md) — mục tiêu, actor, user journey,
   yêu cầu, phạm vi MVP và success criteria.

### Thiết kế và kế hoạch project

2. [02_architecture_and_boundaries.md](02_architecture_and_boundaries.md) — module boundary,
   Electron IPC, source structure và architecture enforcement.
3. [03_workflow_node_and_project_spec.md](03_workflow_node_and_project_spec.md) — project format,
   workflow, node catalog, validation và persistence.
4. [04_ide_ux_and_state_plan.md](04_ide_ux_and_state_plan.md) — workspace UX, state ownership,
   interaction flow, autosave và recovery.
5. [05_compiler_runtime_and_device_protocol.md](05_compiler_runtime_and_device_protocol.md) —
   compiler, executable JSON, Runtime contract và device lifecycle.
6. [06_package_publish_and_license.md](06_package_publish_and_license.md) — package, signing,
   publish, Marketplace và license boundary.
7. [07_security_testing_and_observability.md](07_security_testing_and_observability.md) — security,
   test strategy, quality gate, logging và diagnostics.
8. [08_delivery_roadmap.md](08_delivery_roadmap.md) — milestone, dependency và acceptance gate.
9. [09_decisions_and_open_questions.md](09_decisions_and_open_questions.md) — decision log và các
   contract còn cần chốt.

Hướng dẫn implementation chuyên biệt và ADR nằm trong
[`specs/README.md`](../specs/README.md).

## Cấu trúc repository

```text
.
├── docs/            # Knowledge base, requirements, thiết kế và kế hoạch project
├── specs/           # Hướng dẫn implementation chuyên biệt và ADR
├── src/             # Renderer/application code theo các layer
├── electron/        # Electron main, preload và shared IPC contracts
├── tests/           # Unit, component, contract, integration và E2E tests
├── public/          # Static assets
└── README.md        # Hướng dẫn bắt đầu nhanh cho repository
```

Cấu trúc chính bên trong `src/`:

- `domain/`: entity, value object, invariant và domain types thuần.
- `application/`: use case, orchestration và port.
- `infrastructure/`: adapter cho persistence và Electron host.
- `presentation/`: page, feature và component giao diện.
- `app/`: composition root, provider, router và bootstrap.
- `shared/`: type, utility và logging dùng chung.

## Quy ước cập nhật

- Bộ `01_...md` đến `09_...md` là nguồn tài liệu chuẩn duy nhất; tên file dùng số thứ tự hai chữ số
  và `snake_case` viết thường.
- Nội dung trong [`sample/`](sample/) là đầu vào nghiệp vụ để tổng hợp tính năng; khi có khác biệt,
  bộ tài liệu chuẩn phải nêu rõ quyết định, phạm vi MVP và phần để sau MVP thay vì sao chép song song.

- Thay đổi mục tiêu, phạm vi hoặc user journey: cập nhật tài liệu Product/BA trước.
- Thay đổi thiết kế hoặc kế hoạch: cập nhật tài liệu 03–09 và các acceptance criteria liên quan.
- Thay đổi quyết định kiến trúc đã chấp nhận: tạo mới hoặc supersede ADR trong `specs/adr/`.
- Khi tài liệu mô tả khác source/test hiện tại, phải xác minh trạng thái implementation; không dùng
  code minh họa trong docs để thay thế contract đã được chấp nhận.
