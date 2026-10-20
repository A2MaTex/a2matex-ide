# Tài liệu dự án A2MaTeX Studio

Thư mục `docs/` là knowledge base chung của project. Product/BA sở hữu mục tiêu, phạm vi và user
journey; các technical owner duy trì tài liệu thiết kế, vận hành và delivery liên quan. Những quyết
định kỹ thuật mang tính chuẩn tắc vẫn nằm trong [`specs/`](../specs/README.md).

## Bản đồ tài liệu

### Product và trải nghiệm

1. [01_SCOPE_AND_REQUIREMENTS.md](01_SCOPE_AND_REQUIREMENTS.md) — mục tiêu, actor, user journey,
   yêu cầu, phạm vi MVP và success criteria.

### Thiết kế và kế hoạch project

2. [02_ARCHITECTURE_AND_BOUNDARIES.md](02_ARCHITECTURE_AND_BOUNDARIES.md) — module boundary,
   Electron IPC, source structure và architecture enforcement.
3. [03_WORKFLOW_NODE_AND_PROJECT_SPEC.md](03_WORKFLOW_NODE_AND_PROJECT_SPEC.md) — project format,
   workflow, node catalog, validation và persistence.
4. [04_IDE_UX_AND_STATE_PLAN.md](04_IDE_UX_AND_STATE_PLAN.md) — workspace UX, state ownership,
   interaction flow, autosave và recovery.
5. [05_COMPILER_RUNTIME_AND_DEVICE_PROTOCOL.md](05_COMPILER_RUNTIME_AND_DEVICE_PROTOCOL.md) —
   compiler, executable JSON, Runtime contract và device lifecycle.
6. [06_PACKAGE_PUBLISH_AND_LICENSE.md](06_PACKAGE_PUBLISH_AND_LICENSE.md) — package, signing,
   publish, Marketplace và license boundary.
7. [07_SECURITY_TESTING_AND_OBSERVABILITY.md](07_SECURITY_TESTING_AND_OBSERVABILITY.md) — security,
   test strategy, quality gate, logging và diagnostics.
8. [08_DELIVERY_ROADMAP.md](08_DELIVERY_ROADMAP.md) — milestone, dependency và acceptance gate.
9. [09_DECISIONS_AND_OPEN_QUESTIONS.md](09_DECISIONS_AND_OPEN_QUESTIONS.md) — decision log và các
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

- Thay đổi mục tiêu, phạm vi hoặc user journey: cập nhật tài liệu Product/BA trước.
- Thay đổi thiết kế hoặc kế hoạch: cập nhật tài liệu 03–09 và các acceptance criteria liên quan.
- Thay đổi quyết định kiến trúc đã chấp nhận: tạo mới hoặc supersede ADR trong `specs/adr/`.
- Khi tài liệu mô tả khác source/test hiện tại, phải xác minh trạng thái implementation; không dùng
  code minh họa trong docs để thay thế contract đã được chấp nhận.
