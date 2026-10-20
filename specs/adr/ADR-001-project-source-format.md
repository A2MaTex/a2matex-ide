# ADR-001 — Project source format và filesystem boundary

Status: Accepted
Date: 2026-10-07
Owners: Core/Desktop
Related questions/contracts: Q-003, Q-004, Q-005; Project schema v1

## Context

Studio cần một source format dễ đọc, dễ diff và có thể mở trực tiếp trong giai đoạn authoring. Đồng
thời renderer Electron là trust boundary không được phép nhận quyền filesystem tổng quát. Format cần
hỗ trợ migration và giữ được extension fields để các phiên bản minor không làm mất dữ liệu.

## Decision

Project source là một thư mục. Manifest bắt buộc có tên a2matex.project.json; mỗi workflow được lưu
trong workflows/ với hậu tố .workflow.json.

```text
project-root/
├── a2matex.project.json
├── workflows/
│   └── main.workflow.json
└── assets/
```

Manifest v1 tối thiểu:

```json
{
  "schemaVersion": 1,
  "projectId": "stable-id",
  "name": "My automation",
  "version": "0.1.0",
  "entryWorkflow": "workflows/main.workflow.json",
  "minimumRuntimeVersion": "0.1.0",
  "workflows": ["workflows/main.workflow.json"],
  "assets": [],
  "permissions": [],
  "environment": []
}
```

Workflow v1 chứa schemaVersion, stable id, nodes, edges và layout. Source JSON giữ unknown fields để
forward-compatible trong cùng compatibility window. Schema version cao hơn version hiện tại bị từ
chối với error code riêng; manifest v0 được migrate in-memory sang v1 và trở thành dirty để người
dùng explicit save.

Native dialog trong Electron main cấp một opaque location token. Renderer chỉ gửi token về các IPC
handler được allow-list; displayPath chỉ phục vụ hiển thị và không được dùng để authorize I/O. Main
process canonicalize path, chặn filesystem root/symlink escape và chỉ resolve file bên trong project
root.

Save ghi JSON bằng temporary file cùng thư mục, fsync, rồi rename. Manifest được ghi sau workflow để
giảm khả năng manifest trỏ tới file chưa hoàn tất.

## Alternatives considered

- Single archive khi authoring: thuận tiện trao đổi nhưng khó diff, merge và phục hồi từng file.
- Cho renderer gửi absolute path: API đơn giản hơn nhưng biến dữ liệu không tin cậy thành filesystem
  authority.
- Một file JSON duy nhất: thao tác ban đầu đơn giản nhưng tăng conflict và không phù hợp asset lớn.
- Ghi trực tiếp vào file đích: ít bước hơn nhưng dễ để lại JSON dở dang khi process hoặc máy bị lỗi.

## Consequences

- Git-friendly, người dùng có thể kiểm tra và backup source bằng công cụ thông thường.
- Main process phải quản lý lifetime của location grant; grant hết hiệu lực sau khi app restart và
  recent project cần xin lại quyền ở phase sau.
- Save As chỉ chấp nhận thư mục rỗng trong Phase 1.
- MIME public/package archive extension chưa được quyết định trong ADR này.
- Migration cần fixture và contract test cho từng version được hỗ trợ.

## Rollout

1. Phase 1 triển khai schema v1, migration v0 → v1 và repository contract.
2. Electron main cung cấp Create/Open/Save/Save As qua typed preload bridge.
3. Unit, contract và filesystem integration test khóa hành vi.
4. Phase 2 bổ sung node property schema độc lập, không đổi project container.
5. Trước public beta, chốt MIME/package extension và compatibility window.
