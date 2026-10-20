# ADR-002 — Workflow authoring contract và graph policy

Status: Accepted
Date: 2026-10-07
Owners: Core/Editor
Related questions/contracts: Q-005, Q-006, Q-007, Q-008; Workflow schema v1

## Context

Phase 2 cần một vertical slice mà developer có thể tạo workflow trực quan, cấu hình node, nhận lỗi và
undo/redo mà không làm React Flow trở thành source of truth. Catalog và graph rules cũng sẽ được
compiler/Runtime dùng lại ở các phase sau.

## Decision

Node definition là dữ liệu domain versioned, tách khỏi node instance và component React. Built-in
catalog đầu tiên gồm:

- trigger.start@1
- flow.delay@1
- android.tap@1
- debug.log@1

Property schema dùng JSON-compatible subset với constraint và UI hints. Defaults được tạo bởi domain
command khi add node. Inspector chỉ phát UpdateNodeParams command; nó không mutate React Flow data.

WorkflowDocument là source of truth. React Flow chỉ chiếu nodes, edges và layout; khi node được kéo,
MoveNode command cập nhật layout domain. Save serialize WorkflowDocument, không serialize state nội
bộ của React Flow.

Graph policy v1:

- entry workflow có đúng một trigger.start@1;
- Phase 2 chỉ author control-flow edges, dù ValueType và port model giữ chỗ cho data edges;
- port phải tồn tại, cùng kind/value type và tuân thủ cardinality;
- duplicate edge và mọi cycle đều bị từ chối;
- loop sau này phải dùng control node/version có semantics rõ, không suy ra từ arbitrary cycle;
- android.tap tự thêm android.input vào manifest permissions.

Disabled node không được expose trong UI Phase 2. Khi Runtime integration được triển khai, built-in
node có đúng một control input và một control output sẽ dùng bypass semantics. Entry trigger không
được disable; node có topology khác phải khai báo semantics riêng trước khi hỗ trợ disable.

Mọi edit đi qua command. History lưu ProjectDocument cùng revision gốc. Undo có thể quay đúng về
savedRevision và làm project clean; edit mới sau undo nhận revision mới, không tái sử dụng revision
cũ.

Validator trả issue có code và ID ổn định, cùng nodeId/edgeId/propertyPath khi có. Problems panel dùng
target này để chọn node và đưa developer tới Inspector.

## Alternatives considered

- Lưu React Flow nodes/edges trực tiếp: nhanh cho UI nhưng rò presentation state vào source format và
  compiler.
- Mutate node data trong component: ít boilerplate nhưng phá undo, incremental validation và revision
  safety.
- Cho phép arbitrary cycles: linh hoạt nhưng Runtime chưa có cancellation/loop semantics an toàn.
- Autosave mỗi gesture: giảm thao tác Save nhưng vượt scope recovery policy Phase 3.

## Consequences

- Catalog, command và validator test được không cần DOM.
- React Flow có adapter riêng và có mapper test.
- Phase 2 author control flow; data edge UI được hoãn nhưng workflow format không bị khóa.
- Invalid property có thể được lưu để developer tiếp tục author, nhưng Run/build sẽ bị validator
  chặn ở phase tương ứng.
- Undo history hiện giới hạn 100 ProjectDocument snapshot; profiling và command-delta history có thể
  được xem xét khi workflow lớn.
- Runtime phải dùng cùng node type/version, permission và graph policy hoặc negotiate compatibility
  rõ ràng.

## Rollout

1. Thêm catalog, command, validator và application workflow editor.
2. Thêm React Flow adapter, palette, canvas, schema Inspector và Problems navigation.
3. Khóa behavior bằng unit test, adapter/history test và Electron E2E bốn node.
4. Phase 3 giữ workspace preferences/recovery ngoài source workflow.
5. Phase 4 compiler và Runtime consume cùng versioned definitions/validation contract.
