# Đặc tả kỹ thuật A2MaTeX Studio

Thư mục `specs/` giữ các hướng dẫn implementation chuyên biệt và ADR chi phối cách developer
implement code. Requirements, thiết kế, test strategy, roadmap và decision log nằm trong
[`docs/`](../docs/README.md).

## Implementation guide

- [A2MaTeXStudio_Onboarding_Guide.md](A2MaTeXStudio_Onboarding_Guide.md) — hướng dẫn triển khai
  download, Windows installer và first-run onboarding.

## Architecture Decision Records

1. [ADR-001](adr/ADR-001-project-source-format.md) — project source dạng folder, schema v1 và
   filesystem capability token.
2. [ADR-002](adr/ADR-002-workflow-authoring-contract.md) — workflow source of truth, graph policy,
   command, validation và React Flow adapter.
3. [ADR-003](adr/ADR-003-auth-and-node-catalog-sync.md) — auth boundary, remote node catalog và
   offline cache.
4. [ADR-004](adr/ADR-004-desktop-onboarding-and-windows-distribution.md) — onboarding, policy state,
   workspace capability và Windows distribution; hiện vẫn ở trạng thái Proposed.

## Tài liệu hỗ trợ implementation

- [Architecture và boundaries](../docs/02_ARCHITECTURE_AND_BOUNDARIES.md).
- [Project, workflow và node](../docs/03_WORKFLOW_NODE_AND_PROJECT_SPEC.md).
- [IDE UX và state](../docs/04_IDE_UX_AND_STATE_PLAN.md).
- [Compiler, Runtime và device protocol](../docs/05_COMPILER_RUNTIME_AND_DEVICE_PROTOCOL.md).
- [Package, publish và license](../docs/06_PACKAGE_PUBLISH_AND_LICENSE.md).
- [Security, testing và observability](../docs/07_SECURITY_TESTING_AND_OBSERVABILITY.md).
- [Delivery roadmap](../docs/08_DELIVERY_ROADMAP.md).
- [Decisions và open questions](../docs/09_DECISIONS_AND_OPEN_QUESTIONS.md).

## Cách sử dụng

Trước khi implement, developer đọc tài liệu architecture, ADR liên quan và tài liệu hỗ trợ của
feature. Nếu một thay đổi mâu thuẫn với ADR đã Accepted, ADR phải được supersede hoặc sửa qua review
trước khi code thay đổi. Contract mới phải nêu versioning, compatibility, error cases và test owner.
