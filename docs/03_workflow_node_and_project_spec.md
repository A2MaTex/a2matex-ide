# 03 — Project, workflow và node specification

## 1. Nguyên tắc format

- Human-readable cho source project; deterministic cho build artifact.
- Domain model không chứa object của React Flow.
- Node definition (catalog) tách khỏi node instance (workflow).
- Execution semantics nằm ở Runtime/compiler contract, không nằm trong visual component.
- Mọi file bền vững có schema version; thay đổi breaking phải có migration.
- Unknown field không bị xóa âm thầm khi IDE mở project mới hơn khả năng hỗ trợ.

## 2. Cấu trúc project đề xuất

```text
sample-automation/
├── a2matex.project.json
├── workflows/
│   └── main.workflow.json
├── inputs/
│   └── input.schema.json
├── assets/
│   ├── images/
│   └── data/
├── test-profiles/          # local/dev only; không chứa secret thô
│   ├── default.profile.json
│   └── smoke.profile.json
├── tests/
│   ├── fixtures/
│   └── workflows/
└── .a2matex/
    ├── workspace.json      # local UI state; không đóng gói
    ├── recovery/           # local draft; không đóng gói
    ├── publish-history.json
    └── cache/              # generated; không commit/đóng gói
```

Tên/extension cuối cùng phải được chốt trong decision log. Không để OS path tuyệt đối trong manifest hoặc workflow.

## 3. Project manifest

```ts
export interface ProjectManifest {
  schemaVersion: number;
  projectId: string;
  name: string;
  description?: string;
  version: string; // SemVer release version
  entryWorkflow: string; // project-relative workflow id/path
  inputSchema: string; // project-relative customer input schema
  minimumRuntimeVersion: string;
  workflows: string[];
  assets: AssetDeclaration[];
  permissions: PermissionDeclaration[];
  environment: EnvironmentVariableDeclaration[];
  publisher?: { id: string };
}
```

Rules:

- `projectId` ổn định qua các release; `version` thay đổi khi publish.
- `entryWorkflow` phải thuộc danh sách workflow.
- asset path phải relative, normalized, không thoát project root.
- environment declaration chỉ chứa tên/type/default không nhạy cảm; secret value nằm ngoài project.
- permission được suy ra từ node catalog và developer có thể giải thích/confirm, không thể âm thầm hạ thấp.

## 4. Node definition trong catalog

```ts
export interface NodeDefinition {
  type: string; // ví dụ android.tap
  version: number;
  displayName: string;
  description: string;
  category: string;
  icon: string; // catalog icon id, không phải React component
  configSchema: JsonSchemaObject;
  inputSchema: JsonSchemaObject;
  outputSchema: JsonSchemaObject;
  outputs: OutputPortDefinition[];
  requiredCapabilities: string[];
  requiredPermissions: string[];
  runtimeHandler: string;
  defaultTimeoutMs: number;
  supportedErrorPolicies: ErrorPolicyKind[];
  deprecation?: {
    message: string;
    replacement?: { type: string; version: number };
  };
}
```

Definition là dữ liệu có validation và chữ ký/nguồn gốc nếu tải ngoài built-in catalog. Presentation map `icon` và schema sang component; domain không import Lucide/Zod UI schema.

### 4.1 Remote node catalog contract

DTO ở network boundary phải phản ánh server, sau đó adapter mới normalize sang domain model:

```ts
interface RemoteNodeCatalogDto {
  catalogHash: string;
  nodes: RemoteNodeDefinitionDto[];
}

interface RemoteNodeDefinitionDto {
  type: string;
  name: string;
  description: string;
  category: string;
  runtimeHandler: string;
  minimumRuntimeVersion: string;
  defaultTimeoutMs: number;
  configSchema: JsonSchemaObject;
  inputSchema: JsonSchemaObject;
  outputSchema: JsonSchemaObject;
  outputPorts: {
    ports: Array<{
      key: string;
      kind: 'CONTROL' | 'DATA';
      label: string;
    }>;
  };
  editorHints: {
    icon?: string;
    fieldOrder?: string[];
  };
  supportedErrorPolicies: {
    supported: string[];
  };
  capabilities: Array<{
    code: string;
    name: string;
    description: string;
    isSensitive: boolean;
  }>;
}
```

Quy tắc normalization:

- `type` là opaque stable identifier; không parse các segment hoặc giới hạn theo ví dụ ngắn như
  `android.tap`.
- `name → displayName`, `configSchema → configSchema`, `editorHints.icon → icon`; enum từ server
  phải được map explicit, không cast mù.
- Giữ `inputSchema`, `outputSchema`, timeout, error policies và capability sensitivity trong
  semantic model hoặc extension có type; không silently drop vì model hiện tại chưa có field.
- JSON Schema phải bị giới hạn draft/subset, depth, property count và string size trước khi render
  Inspector.
- Response chỉ được publish cho UI nếu toàn bộ envelope hợp lệ. Một node lỗi không được dẫn tới
  catalog nửa mới/nửa cũ trừ khi backend định nghĩa partial-success contract.

Contract hiện còn hai blocker trước implementation:

1. Response không có node `version` nhưng workflow hiện lưu `nodeVersion: number`. Backend nên
   trả version ổn định; phương án khác là xác nhận `type` đã là immutable versioned identity rồi
   thay đổi project schema bằng migration. Không tự gán version 1.
2. Response chỉ mô tả `outputPorts`; semantics của input/control entry và cách
   `inputSchema/outputSchema` ánh xạ data port chưa đủ để dựng edge validation. Cần schema/example
   chính thức trước khi thay built-in catalog.

Built-in catalog chỉ còn là dev/test adapter hoặc bootstrap có nhãn rõ. Production catalog sau
login là authoritative; không merge âm thầm hai nguồn vì có thể trùng `type` và khác execution
semantics. Workflow tham chiếu definition không còn trong catalog phải giữ nguyên node và render
unknown/unavailable placeholder, tuyệt đối không xóa node.

## 5. Node instance và workflow

```ts
export interface WorkflowDocument {
  schemaVersion: number;
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: VariableDefinition[];
  layout: WorkflowLayout;
  metadata?: Record<string, JsonValue>;
}

export interface WorkflowNode {
  id: string;
  type: string;
  nodeVersion: number;
  name?: string;
  disabled?: boolean;
  params: NodeParameters;
}

export interface NodeParameters {
  config: Record<string, JsonValue>;
  bindings: Record<string, DataBinding>;
  timeoutMs?: number;
  retryPolicy?: RetryPolicy;
  errorPolicy?: ErrorPolicy;
}

export type DataBinding =
  | { kind: 'literal'; value: JsonValue }
  | { kind: 'input'; path: string }
  | { kind: 'nodeOutput'; nodeId: string; path: string }
  | { kind: 'variable'; name: string }
  | { kind: 'expression'; expression: string };

export interface WorkflowEdge {
  id: string;
  source: { nodeId: string; port: string };
  target: { nodeId: string; port: string };
}

export interface WorkflowLayout {
  nodes: Record<string, { x: number; y: number }>;
  viewport?: { x: number; y: number; zoom: number };
}
```

Tách `layout` giúp compiler digest semantic graph mà không đổi khi kéo node. `JsonValue` phải loại `undefined`, function, class instance và cyclic object.

### 5.1 Definition, instance, handler và execution

- **Definition** do A2MaTeX cung cấp qua catalog.
- **Instance** là node publisher đặt trong workflow.
- **Handler** là implementation allow-listed trong Runtime.
- **Execution** là một lần chạy instance trên một device; cùng instance trong loop có nhiều
  execution với `sequence` và `iteration` khác nhau.

`params.config`, `params.bindings`, execution context và output là bốn phần khác nhau. Ví dụ `Tap` có config
chọn target mode/timeout, binding cho tọa độ động, context chứa device hiện tại và output chứa kết
quả/thời gian. `params` chỉ là envelope có schema; không flatten config, binding, context và output vào một JSON tự do.

### 5.2 Execution context

Handler chỉ nhận context do Runtime cấp, không do publisher tự sửa:

```ts
interface NodeExecutionContext {
  runGroupId: string;
  executionId: string;
  deviceId: string;
  workflowInputs: Record<string, JsonValue>;
  variables: Record<string, JsonValue>;
  nodeOutputs: Record<string, JsonValue>;
  capabilityGrant: CapabilityGrant;
  cancellationSignal: CancellationSignal;
}
```

## 6. Port và type system tối thiểu

```ts
export type ValueType =
  | 'flow'
  | 'string'
  | 'number'
  | 'boolean'
  | 'json'
  | 'image'
  | 'device'
  | { list: ValueType }
  | { optional: ValueType };

export interface PortDefinition {
  name: string;
  direction: 'input' | 'output';
  kind: 'control' | 'data';
  valueType: ValueType;
  cardinality: 'one' | 'many';
  required?: boolean;
}
```

MVP có thể chỉ render control flow, nhưng format không nên khóa khả năng data edge. Compatibility phải là rule domain dùng chung cho canvas và compiler.

### 6.1 Control edge và conditional branch

Canvas MVP biểu diễn **control edge**. Output port có nhãn ổn định như `success`, `true`,
`false`, `timeout` hoặc `error`; publisher không tự gõ tên branch tùy ý. If có hai nhánh,
Switch có case theo thứ tự và luôn nên có `default`. Domain node chỉ có branch riêng khi kết quả đó
thực sự làm thay đổi control flow.

Error edge là tùy chọn vì mỗi node còn có `errorPolicy`: stop; retry rồi stop; retry rồi đi nhánh
`error`; hoặc continue với default output nếu definition cho phép.

### 6.2 Data binding

MVP không bắt buộc vẽ data wire cho mọi field. Inspector cung cấp expression picker từ ba nguồn:

```text
Workflow Inputs
Previous Node Outputs
Variables
```

Binding vẫn được serialize, type-check và compile rõ ràng. Data edge có thể được thêm sau mà không
đổi semantic model.

### 6.3 Loop, merge và tuần tự trên một device

Không cho arbitrary backward edge. Repeat, While và For Each phải đi qua Loop Controller có
`maxIterations`, `maxDuration`, điều kiện/count và hành vi khi đạt giới hạn. Runtime luôn tăng
`sequence`; execution trong loop ghi thêm `iteration`.

Merge chỉ hợp nhất các nhánh loại trừ nhau, không chờ nhiều input. MVP không cho parallel Android
action tùy ý trên cùng device; tại một thời điểm chỉ một node điều khiển thiết bị. Multi-device
parallelism nằm ở cấp device execution.

## 7. Property schema và Inspector

Schema cần đủ để validation và sinh form, nhưng presentation hint không được thay domain constraints.

```ts
export interface PropertySchema {
  type: 'object';
  required?: string[];
  properties: Record<string, PropertyDefinition>;
}

export interface PropertyDefinition {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';
  title: string;
  description?: string;
  default?: JsonValue;
  enum?: JsonValue[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
  secret?: boolean;
  expression?: boolean;
  ui?: {
    control?: 'input' | 'textarea' | 'select' | 'switch' | 'code' | 'asset';
    group?: string;
    order?: number;
    placeholder?: string;
  };
}
```

Quy ước:

- `secret: true`: lưu reference tới credential, không lưu value.
- `expression: true`: chấp nhận literal hoặc expression AST/string theo syntax đã chốt.
- Inspector update qua command `UpdateNodeParams` với payload phân biệt `config` và `binding`; không mutate React Flow node data trực tiếp.
- Form hiển thị cả validation theo field và issue liên node/global.

## 8. Validation pipeline

```text
Parse/schema
  → identity/reference
  → node definition/version
  → property/type constraints
  → port/edge compatibility
  → graph rules
  → permission/capability
  → compiler/runtime compatibility
```

Các rule P0:

- ID unique; edge tham chiếu node/port tồn tại.
- Đúng một entry trigger cho entry workflow (trừ khi spec cho phép nhiều).
- Không có required control/data input bị thiếu.
- Edge type/cardinality hợp lệ; không duplicate edge bất hợp lệ.
- Node config, binding và output reference đúng schema/type.
- Cycle chỉ hợp lệ qua control node được catalog cho phép.
- Node version tồn tại và Runtime hỗ trợ handler tương ứng.
- Permission manifest bao phủ các permission thực tế được node yêu cầu.
- Disabled node có semantics bypass/skip được định nghĩa, không chỉ là CSS state.

Issue phải có stable `code` và source path để Problems panel điều hướng được.

## 9. Danh mục node MVP

Mục tiêu là một bộ primitive node có khả năng kết hợp cao. Vertical slice đầu tiên vẫn là
`Start → Delay → Tap → Log`; MVP hoàn chỉnh chọn khoảng **27–35 node type** từ catalog dưới đây
theo khả năng Runtime và UAT, không coi toàn bộ danh sách ứng viên là cam kết cùng lúc.

### 9.1 Flow-control và data nền tảng

| Node                                     | Chức năng                           |
| ---------------------------------------- | ----------------------------------- |
| Start / End / Fail                       | Bắt đầu và kết thúc execution       |
| Delay                                    | Chờ có hỗ trợ cancel                |
| If / Switch / Merge                      | Rẽ nhánh và hợp nhất nhánh loại trừ |
| Repeat / While / For Each                | Loop có giới hạn                    |
| Set Variable                             | Cập nhật biến                       |
| Compare                                  | So sánh dữ liệu                     |
| Text Template                            | Ghép chuỗi từ binding               |
| Parse JSON / Build Object / Get Property | Biến đổi JSON có schema             |
| List Operations                          | Lấy, lọc, đếm item                  |
| Date/Time / Random Value                 | Primitive dữ liệu có giới hạn       |

### 9.2 Android action

| Node                    | Chức năng                                          |
| ----------------------- | -------------------------------------------------- |
| Launch App / Stop App   | Quản lý app theo package allow-listed              |
| Tap / Long Press        | Tương tác theo tọa độ, tỷ lệ, output hoặc selector |
| Swipe / Scroll          | Điều hướng màn hình                                |
| Input Text / Clear Text | Nhập và xóa nội dung                               |
| Key Event               | Back, Home, Enter và key được phép                 |
| Open URL/Deep Link      | Mở URI theo policy                                 |

### 9.3 Android observation

| Node                              | Chức năng                         |
| --------------------------------- | --------------------------------- |
| Screenshot                        | Chụp màn hình                     |
| Get Current App                   | Đọc package/activity              |
| Element Exists / Wait For Element | Kiểm tra hoặc chờ UI element      |
| Get Element Text                  | Đọc text                          |
| Find Image / Compare Screen       | Nhận diện ảnh/trạng thái màn hình |
| Read Text/OCR                     | Đọc text từ vùng ảnh              |

Ưu tiên `Element Exists` và `Wait For Element` trước OCR/image matching vì chi phí triển khai và
tài nguyên thấp hơn.

### 9.4 Connector, debug và test

| Nhóm       | Node ứng viên                                                        |
| ---------- | -------------------------------------------------------------------- |
| Connector  | HTTP Request, Telegram Message, Google Sheets Append Row, Send Email |
| Debug/test | Log, Assert, Save Artifact, Mock Output                              |

Connector chỉ dùng credential reference; URL/domain và capability phải qua policy.

### 9.5 Node Development Kit

Quy trình thêm node:

```text
1. Khai báo NodeDefinition
2. Viết Runtime Handler
3. Khai báo config/input/output schema và branch
4. Khai báo capability/permission
5. Viết contract tests
6. Registry tự nhận node
7. Studio sinh palette, Inspector và tài liệu
```

`packages/node-sdk` nên cung cấp definition schema, field types, validation helpers, test harness,
documentation generator và compatibility checker. Mỗi node có test cho config hợp lệ/sai,
input-output, timeout, cancel, handler error, capability denied và migration khi có.

### 9.6 Code node

Code node không thuộc MVP. Trước đó phải có Set Variable, Compare, Text Template, Build Object, List
Operations và Expression Editor. Nếu được bổ sung, Code node chỉ biến đổi JSON trong isolated
runner có CPU/memory/time quota; không ADB, HTTP, filesystem, process, npm/dynamic import,
credential hoặc Runtime internals.

## 10. Serialization, migration và compatibility

- Canonical JSON: UTF-8, key ordering ổn định khi build; pretty-print khi lưu source.
- Project save không tự động bump release version.
- Migration là chuỗi pure function `vN → vN+1`, có backup và idempotency test.
- IDE mới mở format cũ: migrate preview, backup, rồi save khi user xác nhận/chính sách cho phép.
- IDE cũ mở format mới: read-only hoặc báo unsupported; không save phá dữ liệu.
- Node instance giữ `nodeVersion`; catalog upgrade là explicit action có migration per node.

Compatibility matrix cần theo dõi:

```text
IDE version ↔ project schema
IDE catalog adapter version ↔ remote catalog schema
account + server + Runtime version ↔ catalogHash/cache entry
IDE/compiler version ↔ IR schema
IR schema + node handler version ↔ Runtime version
package schema ↔ Desktop Client/Marketplace
```

## 11. Save transaction

1. Application tạo immutable `ProjectSnapshot`.
2. Validate serializable + path policy.
3. Main process ghi file tạm cùng filesystem.
4. Flush/close, atomic replace file đích.
5. Trả digest/revision cho renderer.
6. Renderer chỉ clear dirty flag nếu revision hiện tại đúng revision đã lưu; edit phát sinh trong lúc save vẫn dirty.

## 12. Definition of done cho data model

- Domain types và schemas không import UI/infrastructure.
- Round-trip fixtures giữ nguyên semantic graph.
- Invalid references/types/cycles tạo issue ổn định.
- React Flow mapper có test hai chiều cho node/edge/layout được hỗ trợ.
- Migration fixtures bao phủ mọi schema version được support.
- Compiler digest không đổi khi chỉ đổi viewport/vị trí node.
