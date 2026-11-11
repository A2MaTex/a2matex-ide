# Current Node Catalog Response to Studio Project Draft Guide

## 1. Mục tiêu và phạm vi

Tài liệu này mô tả cách Studio consume response hiện tại của:

```http
GET /api/v1/node-catalog?runtimeVersion=X.Y.Z
```

Response Node Catalog đã được Backend thay đổi. Công việc cần làm là cập nhật
Studio để:

1. parse đúng response hiện tại;
2. dựng palette, inspector và output connectors từ Node Definition;
3. deep-clone effective input schema vào từng node instance;
4. xử lý targeting mode từ `editorHints.targeting`;
5. chỉ commit form vào Editor Graph khi user nhấn **Save**;
6. autosave SQLite chỉ persist committed graph;
7. invalidate và compile lại Runtime IR đúng thời điểm.

Tài liệu này không yêu cầu phát hành API version mới, không thay đổi response
Backend. Theo quyết định hiện tại, `node.inputSchema` là snapshot được deep-clone
từ Catalog schema và là một phần của Editor Graph khi Save/Sync.

## 2. Các giả định cũ phải bỏ

Studio không được tiếp tục giả định rằng:

- `outputPorts.ports` là array các object `{ key, kind, label }`;
- `editorHints` luôn có `icon` và `fieldOrder`;
- targeting chỉ là `editorHints.targetModes` cộng một `inputSchema` phẳng;
- logical output port keys và số chấm kết nối vật lý trên canvas là cùng một khái niệm;
- direct value được lưu với legacy `kind: "constant"`;
- thay đổi control trong form phải commit ngay vào project store;
- autosave debounce được phép đọc form draft chưa nhấn Save;
- cache normalized theo response cũ có thể parse như response mới.

Response hiện tại dùng port keys dạng string và cung cấp toàn bộ mode-specific
value schemas trong `editorHints.targeting.modes`.

## 3. HTTP và cache flow

Request:

```http
GET /api/v1/node-catalog?runtimeVersion=0.1.0
Authorization: Bearer <access-token>
If-None-Match: "<catalogHash>"
```

Behavior:

- `200`: parse global response envelope và thay snapshot trong cache;
- `304`: dùng cached snapshot cùng scope;
- `401`/`403`: xử lý session/permission failure, không dùng cache của account
  khác;
- invalid body: không nhận một phần catalog và không ghi đè good cache;
- offline/refresh failure: chỉ dùng cached snapshot nếu snapshot cùng scope và
  parse hợp lệ.

Cache identity gồm:

```text
server + account + runtimeVersion
```

`catalogHash` là version/ETag của catalog trong scope đó, không phải cache key
duy nhất.

Studio phải bump local cache format hoặc viết explicit legacy-cache migration.
Không parse normalized cache shape cũ bằng current response schema.

## 4. Current response envelope

```ts
interface NodeCatalogResponse {
  data: {
    catalogHash: string;
    nodes: RemoteNodeDefinition[];
  };
  statusCode: 200;
}
```

Rules:

- `catalogHash` là lowercase SHA-256 gồm 64 hex characters;
- `nodes` là array, không phải paginated result;
- `statusCode` là `200` trong success body;
- HTTP `304` không cần success body;
- adapter strict-parse toàn bộ response trước khi normalize hoặc cache.

## 5. Current Node Definition response schema

```ts
interface RemoteNodeDefinition {
  type: string;
  name: string;
  description: string;
  category: 'FLOW' | 'UTILITY' | 'ANDROID';
  runtimeHandler: string;
  minimumRuntimeVersion: string;
  defaultTimeoutMs: number;

  configSchema: ObjectValueSchema;
  inputSchema: ObjectValueSchema;
  outputSchema: ObjectValueSchema;

  outputPorts: {
    ports: string[];
  };

  editorHints: {
    targeting?: TargetingHint;
  };

  capabilities: Array<{
    code: string;
    name: string;
    description: string;
    isSensitive: boolean;
  }>;
}

interface TargetingHint {
  modes: Array<{
    mode: string;
    bindingSchema: ObjectValueSchema;
  }>;
}
```

Response hiện tại không trả:

- `supportedErrorPolicies`;
- `editorHints.icon`;
- `editorHints.fieldOrder`;
- port label hoặc port kind;
- database ID, publication status hay timestamps.

Studio không được yêu cầu các fields trên trong remote response parser.

## 6. Value schema subset

```ts
interface ObjectValueSchema {
  type: 'object';
  properties: Record<string, FieldValueSchema>;
  required: string[];
  additionalProperties: false;
}

type FieldValueSchema =
  | {
      type: 'string';
      title?: string;
      description?: string;
      minLength?: number;
      maxLength?: number;
      pattern?: string;
      enum?: string[];
      default?: string;
    }
  | {
      type: 'integer';
      title?: string;
      description?: string;
      minimum?: number;
      maximum?: number;
      default?: number;
    }
  | {
      type: 'boolean';
      title?: string;
      description?: string;
      default?: boolean;
    };
```

Studio dùng schema trên để validate raw form values. `bindingSchema` không phải
schema trực tiếp của persisted `node.bindings`, vì persisted binding còn có
source wrapper.

Ví dụ property schema:

```json
{
  "xPercent": {
    "type": "integer",
    "minimum": 0,
    "maximum": 100
  }
}
```

Persisted binding theo guide:

```json
{
  "xPercent": {
    "kind": "LITERAL",
    "value": 50
  }
}
```

Flow đúng:

```text
form raw value
  -> validate bằng property schema
  -> wrap thành binding-source object
  -> lưu trong Editor Graph
```

Không validate trực tiếp object `{ kind, value }` bằng raw value schema.

`title` và `description` là presentation annotations. `default` dùng để khởi
tạo pending form value khi field chưa có value; nó không làm field required trở
thành optional và phải được materialize thành binding value nếu Save cần persist
giá trị mặc định đó.

## 7. Remote-to-domain normalization

API adapter normalize response một lần trước khi application/domain dùng:

```ts
interface CatalogNodeDefinition {
  type: string;
  displayName: string;
  description: string;
  category: 'FLOW' | 'UTILITY' | 'ANDROID';
  runtimeHandler: string;
  minimumRuntimeVersion: string;
  defaultTimeoutMs: number;
  configSchema: ObjectValueSchema;
  inputSchema: ObjectValueSchema;
  outputSchema: ObjectValueSchema;
  outputPorts: string[];
  targeting?: TargetingHint;
  capabilities: CatalogCapability[];
}
```

Mapping:

| Remote response | Studio domain |
|---|---|
| `name` | `displayName` |
| `outputPorts.ports` | `outputPorts` |
| `editorHints.targeting` | `targeting` |
| `capabilities` | giữ metadata trong catalog snapshot |

Studio-owned presentation metadata:

- icon;
- color;
- node size/layout;
- port label;
- target-mode display label;
- field layout/order.

Các metadata này được resolve từ Studio mapping/fallback và không được persist
như một phần của Node Definition trong graph.

## 8. Node classification

Studio chọn editor path theo response:

```text
editorHints.targeting exists
  -> targeting node path

editorHints.targeting absent
  -> ordinary node path
```

Không duy trì danh sách hard-code riêng cho Android targeting node types.

Các specialized nodes như `flow.set_variable` và `flow.switch` không được giả
làm ordinary node nếu chúng đã có editor contract riêng. Xem phần 14.

## 9. Ordinary node authoring flow

Với node không có `editorHints.targeting`:

1. Render static config controls từ `configSchema`.
2. Render ordinary input controls từ `inputSchema`.
3. Validate raw config values bằng `configSchema`.
4. Lưu config values trực tiếp trong `node.config`.
5. Validate raw input values bằng `inputSchema` property schemas.
6. Lưu direct input values dưới dạng literal binding source.

Ví dụ `flow.delay`:

```json
{
  "id": "delay_01",
  "type": "flow.delay",
  "config": {},
  "bindings": {
    "durationMs": {
      "kind": "LITERAL",
      "value": 1000
    }
  },
  "errorPolicy": "STOP",
  "editor": {
    "x": 420,
    "y": 180
  }
}
```

Chỉ deep-clone effective `inputSchema` vào node instance. Không copy
`configSchema`, `outputSchema`, capabilities hoặc runtime handler.

## 10. Targeting node authoring flow

Targeting definition hiện tại có ba đặc điểm:

1. `configSchema` chứa required `targetMode` enum;
2. ordinary `inputSchema` rỗng;
3. mỗi mode có raw-value `bindingSchema` riêng trong
   `editorHints.targeting.modes`.

Studio xử lý như sau:

1. Render Select options từ
   `configSchema.properties.targetMode.enum`, theo enum order.
2. Mỗi enum value phải match đúng một entry trong
   `editorHints.targeting.modes`.
3. Display label do Studio map từ mode code; persisted value vẫn là code gốc.
4. Khi chọn mode, deep-clone toàn bộ mode `bindingSchema` và replace hoàn toàn
   draft `node.inputSchema`.
5. Không merge property, required hoặc constraint từ schema cũ.
6. Render form hoàn toàn từ draft `node.inputSchema` mới.
7. Validate raw values theo `required`, `type`, `minimum`, `maximum`,
   `minLength`, `maxLength`, `pattern`, `enum` và các constraint được hỗ trợ.
8. Giữ `targetMode`, cloned schema và edited values trong pending form state.
9. Khi user nhấn Save, atomically commit `config.targetMode`,
   `node.inputSchema` và selected-mode bindings vào Editor Graph.

Ví dụ nếu entry có `mode: "ABSOLUTE_PIXELS"` trả đúng `bindingSchema` sau:

```json
{
  "type": "object",
  "properties": {
    "resourceId": {
      "type": "string",
      "title": "Resource ID",
      "minLength": 1,
      "maxLength": 512
    },
    "timeoutMs": {
      "type": "integer",
      "title": "Find Timeout (ms)",
      "minimum": 0,
      "maximum": 30000,
      "default": 5000
    }
  },
  "required": ["resourceId"],
  "additionalProperties": false
}
```

thì pending `node.inputSchema` phải là một deep clone giống hệt schema đó.
Studio không suy field theo tên mode và không thay nó bằng schema hard-code.
Tên `ABSOLUTE_PIXELS` nhưng fields `resourceId`/`timeoutMs` có vẻ không đồng
nhất về semantics; đây là vấn đề dữ liệu Catalog cần được contract owner xác
nhận, không phải lý do để Studio tự sửa response.

Ví dụ percentage Tap:

```json
{
  "id": "tap_login",
  "type": "android.tap",
  "config": {
    "targetMode": "SCREEN_PERCENT"
  },
  "inputSchema": {
    "type": "object",
    "properties": {
      "xPercent": { "type": "integer", "minimum": 0, "maximum": 100 },
      "yPercent": { "type": "integer", "minimum": 0, "maximum": 100 }
    },
    "required": ["xPercent", "yPercent"],
    "additionalProperties": false
  },
  "bindings": {
    "xPercent": {
      "kind": "LITERAL",
      "value": 50
    },
    "yPercent": {
      "kind": "LITERAL",
      "value": 75
    }
  },
  "errorPolicy": "STOP",
  "editor": {
    "x": 660,
    "y": 180
  }
}
```

Ví dụ selector Tap theo response hiện tại:

```json
{
  "id": "tap_login",
  "type": "android.tap",
  "config": {
    "targetMode": "SELECTOR_ID"
  },
  "inputSchema": {
    "type": "object",
    "properties": {
      "selector_id": {
        "type": "string",
        "pattern": "^[^\\s:]+:id/[^\\s/]+$"
      }
    },
    "required": ["selector_id"],
    "additionalProperties": false
  },
  "bindings": {
    "selector_id": {
      "kind": "LITERAL",
      "value": "com.example.app:id/login"
    }
  },
  "errorPolicy": "STOP",
  "editor": {
    "x": 660,
    "y": 180
  }
}
```

Studio giữ chính xác field name `selector_id` vì đó là key trong response hiện
tại. Không tự rename trong graph hoặc Runtime IR.

## 11. Mode switching

Khi chuyển targeting mode:

1. Thao tác chỉ diễn ra trong pending form state.
2. Resolve exact mode từ selected enum value.
3. `structuredClone(mode.bindingSchema)` thành schema mới.
4. Replace toàn bộ draft `node.inputSchema`; không shallow/deep merge schema cũ.
5. Chỉ giữ draft value cũ khi property name còn tồn tại và value vẫn validate
   đầy đủ với property constraint mới.
6. Xóa mọi value không còn field tương ứng hoặc không còn hợp lệ.
7. Required field chưa có value làm form invalid và disable Save; không ghi
   dummy value.
8. Đổi draft `config.targetMode` sang mode mới.
9. Không tăng project revision và không schedule SQLite autosave ở bước này.
10. Save mới replace committed node và invalidate IR/summary artifacts.

Ví dụ `durationMs` xuất hiện ở hai mode của Swipe/Long Press: giữ value nếu vẫn
hợp lệ với schema mới; bản thân schema vẫn được replace hoàn toàn, không merge.

## 12. Editor Graph persisted node schema

`inputSchema` là field của từng node instance, khác với workflow-level
`ProjectDraft.inputSchema`.

```ts
interface WorkflowNode {
  id: string;
  type: string;
  config: Record<string, JsonValue>;
  inputSchema: ObjectValueSchema;
  bindings: Record<string, WorkflowBinding>;
  errorPolicy: 'STOP' | 'ERROR_BRANCH';
  editor: {
    x: number;
    y: number;
  };
}
```

Rules:

- `node.inputSchema` là deep-cloned effective schema tại lần Save gần nhất;
- ordinary node clone definition `inputSchema`;
- targeting node clone selected mode `bindingSchema`;
- `node.inputSchema` không được share reference với Catalog cache hoặc pending
  form state;
- committed bindings chỉ chứa fields được schema cho phép;
- targeting bindings phải thỏa selected mode schema;
- Backend/local validators không được tin client schema tuyệt đối: phải đối
  chiếu `targetMode` và schema hiện hành khi validation/execution yêu cầu.

Đây là thay đổi breaking so với local `WorkflowNode` strict schema hiện tại.
SQLite decoder, cloud encoder/decoder, workflow validation contract và fixtures
phải cùng chấp nhận field `inputSchema`; không được chỉ sửa component UI.

Migration existing nodes:

1. ordinary node: clone current Catalog `inputSchema`;
2. targeting node có valid `config.targetMode`: clone matching
   `bindingSchema`;
3. mode missing/unknown: không đoán schema; đánh dấu node cần user review;
4. validate existing bindings với cloned schema và báo invalid values;
5. không âm thầm xóa committed user data trong migration; cleanup chỉ xảy ra
   trong pending form và được commit khi user Save.

## 13. Pending, committed, autosave và Sync

### 13.1. Bốn lớp trạng thái

```text
Catalog definition
  -> Pending node form
  -> Committed Editor Graph
  -> Persisted SQLite snapshot
  -> Cloud Project Draft
```

- **Catalog definition**: immutable snapshot lấy từ Node Catalog.
- **Pending form**: local component/editor state; user có thể đổi mode/schema và
  values nhưng chưa thay project revision.
- **Committed graph**: source cho canvas, undo/redo, validation, autosave và IR
  invalidation.
- **SQLite snapshot**: committed graph đã được autosave local.
- **Cloud Draft**: chỉ thay đổi khi user nhấn Sync.

Mỗi lớp phải dùng immutable snapshot/deep clone ở boundary. Không cho pending
form mutate trực tiếp committed node.

### 13.2. Open và edit form

Khi mở node editor:

1. deep-clone committed `config`, `inputSchema` và `bindings` vào pending state;
2. giữ `baseRevision` hoặc equivalent node revision để phát hiện stale Save;
3. field changes chỉ update pending state;
4. không execute workflow command;
5. không tăng project revision;
6. không schedule autosave.

Close/Cancel/Escape với dirty pending form phải discard có chủ ý hoặc hiển thị
confirmation. Không commit ngầm khi blur, click-away hoặc drawer close.

### 13.3. Save node configuration

Khi user nhấn Save:

1. kiểm tra committed graph/node chưa thay đổi kể từ `baseRevision`;
2. validate pending `targetMode` với enum và targeting mode list;
3. validate `inputSchema` shape;
4. validate required fields và mọi supported constraints;
5. build complete replacement `{ config, inputSchema, bindings }`;
6. execute đúng một atomic workflow command, ví dụ
   `node.commitConfiguration`;
7. tạo đúng một undo step và tăng semantic project revision một lần;
8. invalidate `runtimeIr`, validation summary và test summary;
9. schedule autosave debounce 3 giây;
10. chỉ đóng/reset pending form sau khi command thành công.

Không phát nhiều `node.updateParams` commands cho từng field trong cùng một lần
Save. Nếu validation hoặc command thất bại, committed node và SQLite giữ nguyên.

### 13.4. Autosave local

Autosave tự động persist mọi **committed semantic change** xuống SQLite, gồm
node config Save, edge edits, position, metadata và workflow edits khác.

- debounce mặc định: 3 giây sau committed change cuối;
- autosave capture immutable committed project snapshot và revision;
- pending form chưa Save không nằm trong snapshot;
- autosave không gọi Cloud API;
- edit mới khi write đang chạy không được bị đánh dấu saved bởi write cũ;
- app close/project switch phải flush committed pending autosave;
- crash vẫn có thể mất thay đổi trong debounce window nhưng không được persist
  half-committed node configuration.

### 13.5. Sync Cloud

Sync không thay thế Save và không đọc pending form state.

1. Nếu có dirty pending form, block Sync và yêu cầu Save hoặc Discard trước.
2. Flush autosave hiện tại.
3. Đọc immutable SQLite snapshot tại revision đã flush.
4. Encode workflow theo Editor Graph schema trong docs, gồm mỗi
   `node.inputSchema`.
5. Gửi Project Draft lên Cloud theo optimistic-version flow hiện tại.
6. Chỉ đánh dấu synced revision đã upload; edit local mới hơn vẫn là
   `local-ahead`.

Tóm lại: Save commit node vào graph, autosave ghi graph xuống SQLite, còn Sync
mới gửi persisted workflow lên Cloud.

## 14. Output ports và error policy

### 14.1. Static output connectors

Canvas render tối đa một input handle `in` và một output handle `out` cho mỗi
node. Cả hai handle cho phép fan-in/fan-out không giới hạn; `outputPorts.ports`
là logical branch keys, không phải số lượng chấm kết nối vật lý.

```json
{
  "outputPorts": {
    "ports": ["success", "error"]
  }
}
```

Ví dụ trên vẫn chỉ tạo một output handle vật lý `out`. Edge lưu logical branch
`success` hoặc `error` riêng trong `sourcePort`.

`flow.start` chỉ có output handle, `flow.end` chỉ có input handle, các node thông
thường có cả hai. `flow.end` có array rỗng nên không có output handle.

React Flow source handle dùng structural ID `out`; persisted edge vẫn dùng exact
logical key trong `sourcePort`:

```json
{
  "id": "edge_tap_error",
  "sourceNodeId": "tap_login",
  "sourcePort": "error",
  "targetNodeId": "fallback_01"
}
```

Kết nối mới mặc định dùng `success` nếu key này tồn tại, nếu không dùng logical
key đầu tiên. Reconnect cùng source phải giữ nguyên logical key. Không dùng array
index làm persisted port identity. Thay đổi node config hoặc
target mode không được làm mất các edges nếu output port key vẫn tồn tại. Nếu
port bị loại khỏi effective port set, Save phải báo orphaned edge và yêu cầu
user xử lý hoặc thực hiện một atomic node-plus-edge command theo UX đã chốt.

### 14.2. Error policy derivation

Response hiện tại không trả `supportedErrorPolicies`. Theo guide contract:

- `STOP` luôn khả dụng;
- chỉ expose `ERROR_BRANCH` khi `outputPorts.ports` chứa `error`.

Khi node dùng `STOP`, executable graph không được có outgoing error edge. Khi
node dùng `ERROR_BRANCH`, Studio yêu cầu valid error route trước Test Run hoặc
submission.

### 14.3. Dynamic ports

`flow.switch` là ngoại lệ: response chỉ trả static `error`, còn rule ports và
`default` phụ thuộc `config.rules` của node instance. Generic catalog mapper
không được coi `error` là toàn bộ ports của Switch. Specialized Switch editor
phải tiếp tục tạo dynamic ports theo Switch contract.

## 15. Project Draft invalidation

Project Draft có các content fields độc lập:

- `editorGraph`;
- `inputSchema`;
- `runtimeIr`;
- `validationSummary`;
- `testSummary`.

`ProjectDraft.inputSchema` ở danh sách trên là workflow-level input schema.
`node.inputSchema` nằm bên trong từng `editorGraph.nodes[]`. Hai field cùng tên
nhưng khác scope và không được ghi đè lẫn nhau.

Bất kỳ thay đổi semantic nào của graph, gồm target mode hoặc binding value,
phải:

1. apply edit vào local graph snapshot;
2. đặt `runtimeIr` thành `null` hoặc đánh dấu stale trước cloud sync;
3. clear/mark stale validation summary;
4. clear/mark stale test summary;
5. validate và compile lại cùng immutable snapshot trước Test Run/submission;
6. bảo đảm snapshot không đổi trong lúc validate/compile.

Cloud Draft vẫn save được graph invalid hoặc chưa executable, nhưng không được
gửi stale Runtime IR như thể nó còn tương ứng với graph mới.

## 16. Specialized-node boundaries

Response hiện tại có hai node không thể hoàn chỉnh bằng generic
`configSchema + inputSchema` flow.

### 16.1. `flow.set_variable`

`inputSchema` rỗng nhưng workflow contract cần `bindings.value`. Studio phải
dùng specialized Set Variable editor. Không suy ra rằng node không có input chỉ
vì Catalog `inputSchema` rỗng.

### 16.2. `flow.switch`

`configSchema` và `inputSchema` rỗng trong Catalog, nhưng workflow contract cần
ordered rules, operands và instance-derived ports. Studio phải dùng specialized
Switch editor/validator. Không generate empty inspector rồi coi node executable.

Nếu specialized integration chưa có, Studio đánh dấu hai node unsupported và
block Test Run/submission; không tự invent persisted shape.

## 17. Runtime IR conversion

Literal mapping theo guide:

```json
{ "kind": "LITERAL", "value": 50 }
```

thành:

```json
{ "source": "LITERAL", "value": 50 }
```

Other executable mappings:

| Editor Graph binding | Runtime IR input |
|---|---|
| `{ "kind": "WORKFLOW_INPUT", "inputName": "name" }` | `{ "source": "WORKFLOW_INPUT", "inputName": "name" }` |
| `{ "kind": "NODE_OUTPUT", "nodeId": "capture", "field": "artifactId" }` | `{ "source": "NODE_OUTPUT", "nodeId": "capture", "field": "artifactId" }` |

Không invent Runtime IR mapping cho `FLOW_VARIABLE` hoặc `GLOBAL_VARIABLE` đến
khi execution contract tương ứng được triển khai.

Compiler lấy từ Node Definition:

- `runtimeHandler`;
- `defaultTimeoutMs` làm effective timeout khi instance không override;
- capability codes để tạo sorted/deduplicated union;
- `minimumRuntimeVersion` để lấy highest required version;
- output port keys để validate edges.

Compiler không serialize schemas, capability metadata, output-port definitions,
editor position hoặc unused targeting modes vào IR.

Runtime IR node vẫn có đủ `timeoutMs`, `retryPolicy` và `errorPolicy`. Full
document có envelope, input schema, nodes, edges và required capability union.

## 18. Runtime handshake và execution gate

Trước Test Run/submission, Studio kiểm tra:

1. Runtime version đáp ứng highest `minimumRuntimeVersion`;
2. Runtime hỗ trợ Runtime IR format version cần dùng;
3. mọi `{ type, runtimeHandler }` pair có trong Runtime `supportedNodes`;
4. local/backend validation chạy trên cùng snapshot;
5. Runtime IR không stale;
6. specialized nodes/modes/binding sources trong graph đã executable.

Handler trong handshake là early compatibility signal. Runtime vẫn validate
exact Runtime IR trước execution và là authority cuối cùng.

## 19. Studio implementation changes

### 19.1. Remote API schema

Update `electron/main/api/node-catalog.api.ts`:

- parse `outputPorts.ports` là `string[]`;
- parse `editorHints` rỗng hoặc có optional `targeting`;
- parse từng mode và strict `bindingSchema`;
- bỏ yêu cầu `icon`, `fieldOrder`, `supportedErrorPolicies`;
- normalize `name` thành domain `displayName` nếu domain vẫn dùng tên đó.

### 19.2. Domain catalog schema

Update `src/domain/node-catalog/node-catalog.ts`:

- lưu normalized string output ports;
- thêm normalized targeting modes và schemas;
- không yêu cầu presentation metadata đã bị bỏ khỏi API;
- bump cache schema/version hoặc cung cấp explicit legacy-cache migration.

### 19.3. Catalog-to-workflow mapper

Update `src/application/node-catalog/to-workflow-node-catalog.ts`:

- bỏ generic output `out`;
- tạo một structural output handle nếu Catalog có ít nhất một logical output port;
- resolve icon/color/labels bằng Studio mapping/fallback;
- đưa targeting metadata tới inspector;
- giữ specialized handling cho Switch dynamic ports.

### 19.4. Graph persistence and editor state

Update node value saving:

- thêm required `inputSchema` vào domain `WorkflowNode` và strict graph schema;
- giữ pending `{ config, inputSchema, bindings }` ngoài project store;
- khi Save, atomically replace committed `config.targetMode`, deep-cloned
  `inputSchema` và selected-mode `bindings`;
- dùng binding discriminator theo guide thay vì legacy `constant`;
- mode change cleanup invalid values trong pending state;
- chỉ workflow command thành công mới schedule autosave;
- autosave persist committed snapshot xuống SQLite sau debounce;
- Sync flush autosave rồi upload SQLite snapshot, không upload pending form.

Current `NodeInspector` gọi workflow command trực tiếp khi select/change/blur;
behavior đó không còn đúng với contract này. Refactor bắt buộc:

- `NodeInspector`/configuration drawer sở hữu local pending state;
- thêm explicit Save và Cancel actions;
- field blur chỉ normalize/validate pending value, không execute command;
- click-away/Escape không được commit ngầm;
- thêm atomic `node.commitConfiguration` command thay vì nhiều
  `node.updateParams` calls;
- `WorkflowNode` type và `workflowNodeSchema.strict()` nhận required
  `inputSchema`;
- project migration tạo `inputSchema` cho legacy nodes;
- SQLite round-trip và Cloud editorGraph encoder giữ field này nguyên vẹn;
- Backend/local Runtime Editor Graph decoders phải nhận shape trong docs trước
  khi bật Sync cho graph mới.

Nếu project hiện có `{ "kind": "constant" }`, cần migration rõ ràng sang
binding shape của guide; không để hai discriminators được phát sinh song song.

## 20. Known contract gaps không được tự sửa ở Studio

Các điểm sau cần được xác nhận ở contract owner, nhưng không phải lý do để đổi
Node Catalog response trong task này:

1. Response hiện tại của Long Press không đặt `maximum: 60000` cho
   `durationMs`, trong khi Runtime targeting document trước đó mô tả cap này.
   Studio phải dùng schema response hiện tại và Runtime vẫn revalidate IR; không
   tự chèn constraint không có trong Catalog.
2. `selector_id` không theo camelCase field convention nhưng là field key thực
   tế hiện tại. Studio giữ nguyên key cho đến khi có coordinated contract
   migration riêng.
3. Guide dùng Editor Graph binding kinds viết hoa, trong khi local Studio cũ
   dùng `constant`. Migration phải theo guide; nếu workflow-validation service
   production dùng casing khác thì cần xác nhận contract đó trước khi bật save.
4. Set Variable và Switch có semantics không biểu đạt đầy đủ trong generic
   Catalog schemas; tiếp tục dùng specialized contracts hoặc execution gate.

## 21. Verification plan

### Contract tests

- accept exact attached current response;
- accept ordinary node với `editorHints: {}`;
- accept targeting node với all mode schemas;
- reject malformed `catalogHash`;
- reject duplicate mode names;
- reject malformed targeting schema;
- reject old object-shaped output ports in current remote parser;
- verify `304` keeps same-scope cache only.

### Mapper tests

- `name` maps sang `displayName`;
- `ports: ["success", "error"]` tạo một output handle và giữ hai logical keys;
- `flow.end` không có output connector;
- icon/color/labels dùng Studio fallback;
- targeting metadata được giữ sau normalization;
- Switch static `error` không làm mất dynamic rule/default ports.

### Authoring tests

- ordinary literal save;
- opening/editing pending form không tăng revision hoặc schedule autosave;
- Cancel/Escape không thay committed node hoặc SQLite snapshot;
- Save commit `targetMode + inputSchema + bindings` trong một command/undo step;
- Save schedule autosave và SQLite round-trip giữ nguyên `node.inputSchema`;
- autosave đang chạy không persist pending form changes;
- Sync bị block khi có dirty pending form, sau đó flush đúng committed revision;
- Tap chuyển cả ba modes;
- Swipe chuyển pixel/percent và cleanup stale fields;
- Long Press giữ đúng selected-mode fields cùng `durationMs`;
- selector binding giữ key `selector_id`;
- required/min/max/pattern validation;
- mode edit invalidates IR/validation/test artifacts;
- Cloud payload chứa committed `node.inputSchema`, không chứa pending schema;
- workflow-level `ProjectDraft.inputSchema` không bị node schema ghi đè.

### Execution-gate tests

- missing type/handler pair blocks Test Run;
- unsupported IR format blocks Test Run;
- stale IR blocks Test Run/submission;
- invalid error route blocks executable workflow;
- unsupported Set Variable/Switch integration blocks execution nhưng không chặn
  draft save.

## 22. Acceptance criteria

- Studio fetch được `/api/v1/node-catalog` response hiện tại mà không báo
  `CATALOG_INVALID_RESPONSE`.
- Không yêu cầu Backend phát hành endpoint hoặc response version mới.
- Catalog cache mới không bị nhầm với legacy normalized cache.
- Palette hiển thị toàn bộ supported nodes.
- Ordinary inspector dùng `configSchema` và `inputSchema`.
- Targeting inspector dùng `configSchema.targetMode` và
  `editorHints.targeting.modes[].bindingSchema`.
- Select options lấy từ `configSchema.properties.targetMode.enum`.
- Mode switching replace toàn bộ pending `node.inputSchema`, không merge schema
  cũ, và không để stale/invalid values.
- Mỗi node thường có tối đa một `in` và một `out` handle với số connection không
  giới hạn; Start chỉ có `out`, End chỉ có `in`.
- Persisted edge `sourcePort` giữ exact logical port key để nối branch đúng.
- Error policy được derive theo guide từ presence của `error` port.
- Save atomically commit `targetMode`, `node.inputSchema` và bindings vào Editor
  Graph trong một revision/undo step.
- Autosave 3 giây persist mọi committed change xuống SQLite nhưng không gọi
  Cloud và không đọc pending form.
- Chỉ Sync mới flush/read SQLite snapshot rồi gửi workflow lên Cloud.
- Runtime IR được compile lại từ current immutable graph snapshot.
- Invalid/unsupported graph vẫn save draft được nhưng không Test Run hoặc
  submit được.

## 23. Implementation phases

### Tổng quan dependency

| Phase | Kết quả chính | Phụ thuộc |
|---|---|---|
| 0 | Contract và fixtures được khóa | Không |
| 1 | Studio đọc được Catalog response mới | Phase 0 |
| 2 | Editor Graph persist được `node.inputSchema` | Phase 0–1 |
| 3 | Output handles và branch edges dùng đúng port keys | Phase 1–2 |
| 4 | Pending form, mode switching và atomic Save | Phase 1–2 |
| 5 | Autosave SQLite chỉ persist committed graph | Phase 4 |
| 6 | Sync gửi đúng committed SQLite snapshot | Phase 2, 3, 5 |
| 7 | Validation và Runtime IR dùng contract mới | Phase 2–6 |
| 8 | E2E, migration rollout và dọn legacy | Phase 1–7 |

### Phase 0 — Contract lock và fixture chuẩn

**Mục tiêu:** loại bỏ các điểm mà Studio không thể tự quyết trước khi viết code.

Deliverables:

- lưu exact authenticated Node Catalog response thành sanitized contract
  fixture;
- chốt Editor Graph node có required `inputSchema`;
- chốt binding discriminator casing mà Backend/local Runtime validators nhận;
- chốt `selector_id` là persisted key hiện tại;
- chốt `configSchema.properties.targetMode.enum` là nguồn Select options;
- chốt mỗi enum value match đúng một `targeting.modes[].mode`;
- chốt Backend/local Runtime strict decoders chấp nhận `node.inputSchema`;
- chốt `outputPorts.ports` chỉ chứa static ports và Switch có dynamic-port
  contract riêng.

Tests/doc evidence:

- valid current Catalog response fixture;
- invalid enum/mode mismatch fixture;
- valid Editor Graph node có `inputSchema` fixture;
- branch edge fixture với `sourcePort: "success"` và `sourcePort: "error"`.

**Exit criteria:** Backend, Studio và Runtime cùng đọc được fixtures đã chốt.
Không bắt đầu bật Save/Sync shape mới nếu strict graph validators chưa nhận
`node.inputSchema`.

### Phase 1 — Catalog ingestion và cache migration

**Mục tiêu:** Studio fetch/parse/cache được response hiện tại mà chưa đổi graph
editing behavior.

Implementation:

- update remote Zod schema trong `electron/main/api/node-catalog.api.ts`;
- parse `outputPorts.ports` là `string[]`;
- parse optional `editorHints.targeting` và toàn bộ mode schemas;
- bỏ remote requirements cho icon, fieldOrder và supported error policies;
- normalize remote node sang domain catalog shape;
- update `src/domain/node-catalog/node-catalog.ts`;
- bump cache format/directory hoặc migrate explicit legacy cache;
- giữ fallback behavior khi refresh lỗi nhưng same-scope cache hợp lệ;
- resolve icon/color/port labels bằng Studio-owned mappings.

Tests:

- exact response parse;
- malformed targeting rejection;
- `304` cache reuse;
- old cache không bị parse nhầm như current cache;
- offline fallback không cross account/server/runtime scope.

**Exit criteria:** production response không còn tạo
`CATALOG_INVALID_RESPONSE`; ordinary and targeting metadata tồn tại đúng trong
domain snapshot.

### Phase 2 — Editor Graph schema và local migration

**Mục tiêu:** graph/domain/persistence hỗ trợ required per-node
`inputSchema` trước khi UI bắt đầu ghi field này.

Implementation:

- thêm `inputSchema: ObjectValueSchema` vào `WorkflowNode`;
- update strict `workflowNodeSchema`;
- update node factory, duplicate/copy, import/export và cloud codecs;
- thêm atomic `node.commitConfiguration` command payload gồm
  `{ config, inputSchema, bindings }`;
- update undo/redo snapshot behavior;
- migrate ordinary legacy node bằng Catalog `inputSchema`;
- migrate targeting legacy node bằng matching mode `bindingSchema`;
- node thiếu/unknown mode được đánh dấu cần review, không đoán schema;
- update SQLite repository round-trip và invalid-row diagnostics;
- giữ workflow-level `ProjectDraft.inputSchema` tách biệt với
  `editorGraph.nodes[].inputSchema`.

Tests:

- schema encode/decode;
- SQLite close/reopen round-trip;
- duplicate node deep-clones schema;
- mutation một node/schema không mutate Catalog hoặc node khác;
- legacy migration ordinary/targeting/unknown mode;
- cloud encoder giữ `node.inputSchema`.

**Exit criteria:** có thể persist/reopen graph mới bằng SQLite mà chưa cần mode
editor mới; graph cũ migrate deterministic hoặc báo review rõ ràng.

### Phase 3 — Output ports, handles và branch edges

**Mục tiêu:** canvas tách structural handles khỏi logical branch ports.

Implementation:

- render tối đa một structural source handle `out` với fan-out không giới hạn;
- render tối đa một target handle `in` với fan-in không giới hạn;
- persist exact logical Catalog key vào edge `sourcePort`;
- `flow.end` không tạo output handle;
- derive `STOP`/`ERROR_BRANCH` UI theo current guide;
- preserve edge khi config/mode đổi mà port key vẫn tồn tại;
- detect orphaned edges khi effective port bị mất;
- giữ specialized Switch rule/default dynamic handles;
- migration legacy edge `sourcePort: "out"` sang `success` chỉ khi source
  definition thực sự có `success`; trường hợp khác cần review.

Tests:

- node có success/error vẫn chỉ render một output handle;
- fan-in/fan-out không giới hạn và exact duplicate vẫn bị reject;
- create/reconnect/serialize branch edge;
- no output on End;
- error branch validation;
- Switch static plus dynamic ports;
- legacy `out` migration không map mù.

**Exit criteria:** workflow round-trip giữ đúng branch source port và không còn
edge mới dùng `out`.

### Phase 4 — Pending form, target mode và atomic Save

**Mục tiêu:** form editing không mutate committed graph trước Save.

Implementation:

- refactor `NodeInspector`/drawer sang component-local pending state;
- deep-clone committed config/schema/bindings khi mở form;
- render Select từ `configSchema.properties.targetMode.enum`;
- resolve exact mode và deep-clone `bindingSchema`;
- replace toàn bộ pending `inputSchema`, không merge;
- cleanup pending values không tồn tại/không hợp lệ;
- render form hoàn toàn từ pending `inputSchema`;
- implement required/type/range/length/pattern/enum/default handling;
- disable Save khi pending state invalid;
- Save gọi đúng một `node.commitConfiguration` command;
- Cancel/Escape/click-away không commit; dirty close phải confirm;
- phát hiện stale `baseRevision` thay vì overwrite concurrent edit;
- một Save tạo đúng một undo step và invalidate derived artifacts.

Tests:

- enum/mode mapping;
- deep-clone reference isolation;
- schema replacement, không merge;
- valid shared value được giữ, invalid value bị xóa;
- form constraints/default behavior;
- Cancel không thay committed graph;
- Save atomically commit targetMode/schema/bindings;
- stale Save bị reject hoặc yêu cầu reopen.

**Exit criteria:** pending changes không xuất hiện trên canvas/project snapshot;
Save thành công mới tạo một semantic revision hoàn chỉnh.

### Phase 5 — Autosave SQLite integration

**Mục tiêu:** tái sử dụng autosave coordinator hiện có để persist mọi committed
change, nhưng không persist pending form.

Implementation:

- chỉ schedule autosave sau successful semantic command;
- giữ debounce mặc định 3 giây và max-wait behavior hiện tại;
- capture immutable committed snapshot kèm revision;
- write cũ hoàn thành không được đánh dấu edit mới là saved;
- flush trước app close, project switch và Sync;
- failure giữ dirty/pending-save state để retry;
- Save node không gọi SQLite trực tiếp ngoài coordinator.

Tests:

- edit pending lâu hơn 3 giây vẫn không autosave;
- Save schedule đúng một debounced write;
- nhiều committed edits coalesce đúng;
- edit trong khi write chạy không bị mất;
- write failure/retry;
- close/switch flush;
- undo/redo đều autosave committed result.

**Exit criteria:** SQLite luôn chứa một valid committed graph revision; không có
half-committed node config và không có pending form data.

### Phase 6 — Cloud Sync từ persisted snapshot

**Mục tiêu:** chỉ nút Sync mới gửi workflow lên Cloud.

Implementation:

- block Sync nếu có dirty pending form và yêu cầu Save/Discard;
- flush autosave trước Sync;
- đọc immutable SQLite snapshot/revision sau flush;
- encode full Editor Graph gồm per-node `inputSchema` và exact edge ports;
- invalidate/null stale Runtime IR và summaries trước upload;
- giữ optimistic version/conflict flow hiện tại;
- ghi nhận đúng synced local revision;
- edit mới hơn trong lúc upload vẫn giữ `local-ahead`;
- không lấy dữ liệu trực tiếp từ pending React component state.

Tests:

- dirty pending form blocks Sync;
- flush failure blocks network call;
- uploaded body bằng SQLite snapshot revision đã chốt;
- node input schemas và branch ports round-trip Cloud;
- edit-during-sync remains local-ahead;
- version conflict không làm mất local snapshot.

**Exit criteria:** Cloud payload luôn tương ứng một persisted local revision và
không bao giờ chứa pending/uncommitted form state.

### Phase 7 — Validation, IR compilation và execution gate

**Mục tiêu:** graph mới save/sync được nhưng chỉ executable khi toàn bộ semantic
contract hợp lệ.

Implementation:

- validate persisted `node.inputSchema` với selected Catalog mode/schema;
- validate bindings theo persisted/effective schema và Catalog authority;
- validate exact source ports và error-policy routes;
- invalidate IR/validation/test summaries khi committed config/schema/value đổi;
- compile binding sources sang Runtime IR;
- lấy handler, timeout, capabilities và minimum version từ Catalog;
- không serialize editor-only `node.inputSchema` vào Runtime IR node nếu Runtime
  contract không yêu cầu;
- check Runtime version, IR format và `{ type, runtimeHandler }` support;
- gate Set Variable/Switch/unsupported binding sources;
- Runtime vẫn revalidate exact IR trước execution.

Tests:

- schema drift/mismatch diagnostics;
- missing/extra/invalid bindings;
- error branch topology;
- IR literal/workflow-input/node-output mappings;
- capability union and minimum version;
- unsupported handler/mode/source blocks Test Run;
- draft Save/Sync vẫn hoạt động khi graph non-executable.

**Exit criteria:** một graph chỉ Test Run/submit khi Editor Graph và compiled IR
cùng hợp lệ trên đúng committed revision.

### Phase 8 — End-to-end rollout và legacy cleanup

**Mục tiêu:** đưa toàn bộ flow vào sử dụng an toàn với project/cache cũ.

Implementation:

- feature flag flow mới nếu Backend/Runtime rollout không đồng thời;
- chạy authenticated real-API contract test;
- E2E create → edit pending → Save → autosave → restart → Sync → reopen Cloud;
- E2E mode changes cho Tap/Swipe/Long Press;
- E2E success/error branch creation và reconnect;
- verify offline edit/autosave rồi online Sync;
- verify cache/catalog hash change và schema drift UX;
- theo dõi migration failures bằng safe diagnostics, không log workflow values;
- sau compatibility window, bỏ legacy `constant`, old cache reader và generic
  `out` edge creation;
- cập nhật user-facing docs và QA checklist.

**Exit criteria:** toàn bộ acceptance criteria ở phần 22 đạt trên clean install,
legacy project, offline flow và authenticated production API.

### Thứ tự release khuyến nghị

1. Phase 0 contract/validator support.
2. Phase 1–2 dưới feature flag, chưa bật new editor Save.
3. Phase 3 output ports và migration.
4. Phase 4–5 bật local editing/autosave.
5. Phase 6 bật Cloud Sync cho graph mới.
6. Phase 7 bật Test Run/submission.
7. Phase 8 rollout toàn bộ và dọn legacy.

Không bật Cloud Sync trước Phase 2 Backend decoder support, và không bật Test
Run chỉ vì Phase 4 UI đã hoạt động.

## 24. Trạng thái triển khai hiện tại

| Phase | Trạng thái | Ghi chú |
|---|---|---|
| 0 | Studio-side complete, external gate pending | Đã lưu exact attached response fixture và khóa parser invariants. Binding discriminator casing cùng Backend/Runtime strict-decoder support vẫn cần contract owner xác nhận. |
| 1 | Complete trong Studio | Remote parser/domain normalization đã theo response hiện tại; cache snapshot là schema v2 trong directory v4. |
| 2 | Complete trong Studio, external gate pending | `WorkflowNode.inputSchema`, strict local decode, node factories, atomic command, Catalog-aware legacy migration, undo/autosave, SQLite và Cloud graph round-trip đã được cập nhật. Backend/Runtime acceptance vẫn là rollout gate. |
| 3 | Complete cho static Catalog ports | Canvas dùng một structural `in`/`out` handle với fan-in/fan-out không giới hạn; edge commands, validation và migration vẫn giữ exact logical port keys. Switch dynamic rule/default ports cần specialized persisted-rule contract. |
| 4 | Complete cho generic Catalog editor | Pending form local, target-mode schema replacement, constraint validation, stale revision guard, Cancel và atomic Save đã được triển khai. Specialized Set Variable/Switch editors vẫn là execution gate riêng. |
| 5 | Complete | Pending form không schedule autosave; successful atomic Save dùng coordinator 3 giây, revision-safe write, retry và flush flow hiện tại. |
| 6 | Complete trong Studio, external gate pending | Dirty pending form block Sync; Sync flush local rồi Cloud service đọc SQLite snapshot. Per-node schema và exact branch ports được giữ trong payload. Backend decoder acceptance vẫn là rollout gate. |

Phase 7–8 chưa được bật bởi thay đổi này.
