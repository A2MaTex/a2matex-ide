# Workflow Editor UX Update — Palette, Node Detail, Variables, and Connections

Status: Studio UX foundation implemented; Catalog/Runtime-dependent work remains

Date: 2026-10-26  
Updated: 2026-11-08 — Palette/Help, Node metadata detail, unlimited connections, suggestions, reconnect and deletion UX implemented; external contract gaps recorded

Owners: Product, Core/Editor, Catalog, Runtime  
Related: ADR-001, ADR-002, ADR-003; docs/03_workflow_node_and_project_spec.md; docs/04_ide_ux_and_state_plan.md

## 1. Objectives

This document specifies an update to the workflow authoring experience across four areas:

1. Make the Node Palette easier to search, categorize, and explore.
2. Open quick node parameters in a right-to-left drawer on selection, while retaining a full editor on double-click for configuration and rich-text description.
3. Allow properties to reference variables in two scopes: **flow.** and **global.**.
4. Allow unlimited connections on input/output ports, with node suggestions, reconnection, and independent deletion when dragging connections.

This document now combines the target specification with implementation status. Implemented behavior
takes precedence inside this repository. The ADR/document files referenced by the original draft are
not present in this workspace, so they could not be amended here; repositories that still carry
ADR-002 must supersede its single-cardinality policy before consuming the new workflow contract.

### 1.1 Implementation snapshot

- Implemented: sticky multi-field Palette search, collapse/expand all, compact items, hover/focus
  descriptions and Catalog-generated Help.
- Implemented: quick config drawer, double-click Node detail metadata draft, custom name, icon label
  mode, Markdown source description, safe disable eligibility and dimmed disabled canvas state.
- Implemented: unlimited compatible control connections, stable edge ordering, atomic add-and-connect,
  atomic reconnect, independent edge deletion and node-with-connections confirmation.
- Implemented: persisted local flow/subflow documents, Explorer used-node trees, multi-flow tabs,
  canvas context actions, and the searchable Ctrl/Cmd+P Action List.
- Compatibility boundary: the existing cloud draft contract still uploads only the entry workflow.
  Expanding cloud uploads to every flow requires explicit product/security approval; local save and
  project export retain the complete multi-flow document.
- Not implemented because contracts are absent: semantic color/order/complete Help from Catalog,
  `flow.`/`global.` Runtime declarations and execution, generalized `disabledBehavior`, and Runtime
  fan-in/fan-out scheduling tests.
- Partial: full Node detail currently owns metadata/description/enable draft; the schema-driven Config
  form remains in the quick drawer. The restricted Markdown toolbar and full focus trap remain follow-up
  accessibility work rather than being falsely marked complete.

## 2. Scope and Terminology

- **Node definition**: Metadata, version, and schema provided by the Node Catalog.
- **Node instance**: A specific node added to a workflow.
- **Function name**: The default `displayName` in the node definition, such as Delay or Tap.
- **Custom name**: A user-defined name for a node instance.
- **Connection/edge**: A directed link from an output port to an input port.
- **Quick node configuration drawer**: A non-modal, click-away drawer for editing common node parameters after selecting a node.
- **Node detail**: A full editor for a node instance, distinct from the quick drawer and the persistent Android UI Inspector.
- **Help**: Documentation for a node definition, not the user-authored rich-text description of a node instance.

Out of scope: arbitrary cycles, a complete data-wire UI, variable synchronization across machines/tenants, and allowing rich text to execute scripts or embed uncontrolled HTML.

## 3. Gaps Compared with the Current Implementation

| Area                   | Current                                                                                               | Requirements after update                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Palette                | Sticky search, categories, collapse/expand all, compact items, tooltip and generated Help implemented | Catalog still lacks explicit category/node order, semantic colors and complete port/property docs |
| Canvas node            | Effective custom/function label, icon-only mode, Help and disabled badge/dimming implemented          | Definition color tokens are unavailable; neutral existing theme remains                           |
| Node editing           | Single-click quick drawer and double-click metadata/description Node detail implemented               | Full draft-based Config tab and restricted Markdown toolbar remain                                |
| Instance metadata      | Name, label mode and Markdown description persist through schema/commands                             | Full compatibility test with older external workflow consumers remains                            |
| Enable/disable         | Eligible one-control-input/one-control-output nodes can be toggled and are dimmed                     | Runtime bypass and generalized Catalog `disabledBehavior` are outside this repo                   |
| Variables              | No declarations/runtime scope contract is available                                                   | Remains blocked; do not serialize guessed string references                                       |
| Connections            | Unlimited compatible edges; duplicates/cycles/types still rejected; reconnect is atomic               | Runtime ordered fan-out/fan-in execution requires external contract tests                         |
| Drag onto empty canvas | Compatible-node suggestion panel atomically adds and connects                                         | Search/category refinement and richer keyboard navigation remain                                  |
| Deletion               | Edge-only deletion retained; node deletion confirms incident edge count                               | Context-menu wording can be expanded later                                                        |

## 4. Node Palette

### 4.1 Categorization and Ordering

- Group nodes by `NodeDefinition.category`; do not infer categories from the `type` string.
- Use ordering supplied by the catalog/editor hints for categories and nodes. If the catalog does not specify an order, sort categories and `displayName` by locale with stable ordering across renders.
- Hide categories that have no nodes after filtering.
- Give each category its own collapse/expand control and a count of nodes matching the filter.
- The Palette header provides **Collapse all / Expand all**. This affects categories only, not the entire Palette panel.
- While searching, temporarily expand categories containing matches. Clearing the query must restore the pre-search collapse state without overwriting user preferences.

### 4.2 Sticky Search

- Place the search field directly below the header and keep it sticky within the Palette scroll area; scrolling the list must not hide it.
- Search is case-insensitive and trims leading/trailing whitespace.
- Search at least `displayName`, description, type, category, and property names.
- The `/` key focuses search unless focus is already in another input/editor. The first Escape clears the query; the next returns focus to the canvas.
- Loading, error, empty, and no-results states appear below search; these states must not replace the search field.

### 4.3 Items, Colors, and Hover

- Each list item displays only the icon and node name; the description does not occupy a permanent line.
- Hover or keyboard focus opens a popover/tooltip showing at least the definition's name and description.
- The tooltip has a short delay, does not cover the targeted item, and closes when pointer/focus leaves it.
- A node's color comes exclusively from its exact node definition via a semantic color token. Users cannot change or override colors per node instance.
- The catalog must not supply raw CSS, class names, or arbitrary styles. Missing/invalid color tokens fall back to a safe neutral color and generate a catalog diagnostic; the UI must not infer colors from categories.
- Color must not be the only indicator: icons, names, and focus/selection states remain readable in high-contrast mode.
- The same type always uses the same color in the Palette, canvas, Help, and Node detail.

### 4.4 Per-Node Help

- Every item has a **Help** action accessible by mouse and keyboard. The action must not initiate dragging or add a node.
- Canvas nodes and Node detail also provide Help, opening documentation for the exact `type@version`.
- The Help view displays at least:
  - node name, category, version, and description/definition;
  - each input/output with its name, kind/type, and description;
  - each property with label, key, type, required/optional status, default/constraints, and description;
  - related capabilities/permissions, if any;
  - deprecation and replacement information for deprecated definitions.
- Generate Help from catalog/schema data; do not hard-code it in React components.
- Render remote catalog content as sanitized text/Markdown; do not render raw HTML.

## 5. Canvas Nodes and Node Detail

### 5.1 Node Display

- Compute the effective label in this order: non-empty custom name → function name → type if the definition is unavailable.
- Compact nodes need to display only the effective label. Type/version and description are not permanent card content; they remain available in Help/Inspector and the accessible name.
- Each instance has a `labelMode`:
  - **icon**: show only the icon, while retaining the effective label as the accessible name;
  - **icon-and-name**: show the icon and effective label; this is the default.
- Card/stripe/port colors come from the definition's semantic color token. Selected, invalid, deprecated, and runtime states use borders/icons/badges, not merely background-color changes.
- Disabled nodes retain their position, label, ports, and connections, but the entire card is dimmed. The node must also have a **Disabled** badge/text and corresponding accessible state; opacity or color alone is insufficient.
- Disabling does not change the original color from the definition.
- Disabled nodes remain selectable, double-clickable, editable, and able to open Help, just like enabled nodes. Dimming must not disable pointer or keyboard interaction.
- Single-click selects a node and opens its quick configuration drawer. Double-click selects the node and opens full Node detail. Double-click must not create duplicate history entries, open two competing editors, or unintentionally start a drag.

### 5.1.1 Quick Node Configuration Drawer

- The persistent right-side Inspector panel belongs to Android UI Inspector and its device snapshot; it no longer renders node properties.
- Selecting any canvas node opens a non-modal quick configuration drawer immediately to the left of Android UI Inspector.
- The drawer slides from right to left over the canvas and does not resize the React Flow workspace or cover the snapshot panel.
- Selecting a different node while the drawer is open changes its content to the newly selected node.
- Clicking outside, pressing Escape, or clicking Close retracts the drawer. Dismissal does not clear `selectedNodeId`.
- The active field finishes its blur/validation/command behavior before dismissal. Invalid input must not be silently written to workflow state.
- Values already committed through workflow commands remain committed after click-away; closing the drawer is not an undo or discard action.
- Focus returns to the selected node or canvas after close. Keyboard users must have explicit Open/Close behavior equivalent to pointer click-away.
- The quick drawer contains the schema-driven parameter controls currently provided by `NodeInspector.tsx`. Rich Description, combined metadata drafts, and the explicit Done/Cancel workflow remain responsibilities of full Node detail.
- Clicking **Use in Node** in Android UI Inspector may retract the drawer as an outside click, but selected-node identity remains available so selector binding succeeds.

### 5.2 Node Detail Contents

The common section always includes:

- **Name**: Maximum 100 characters. Whitespace-only values normalize to no custom name; the canvas then uses the function name.
- **Display**: Choose Icon only or Icon and name.
- **Enabled/Disabled**: A toggle button that always indicates the current state. Switching to Disabled is allowed only when the node definition has valid disable semantics; Start/entry triggers cannot be disabled.
- The Enabled/Disabled button is in the fixed footer of Node detail and remains visible in both Config and Description tabs. It has an accessible pressed/state label. Clicking only updates the draft; **Done** commits it.
- **Help**: Opens documentation for the exact definition version.
- **Delete**: Deletes the node according to section 7.4.
- **Cancel/Close** and **Done**: Have explicit focus management and an unsaved-draft policy.

Node detail has two tabs/modes:

1. **Config**: A form generated from the node definition's schema. Each node displays only properties declared by that exact version; required status, type, enum, min/max, pattern, secret/reference handling, and validation issues still apply.
2. **Description**: A rich-text editor for recording the node instance's purpose, assumptions, or operating instructions. Its toolbar supports only the agreed Markdown subset: H1/H2/H3 headings, bold, italic, inline code/code blocks, ordered lists, unordered lists, blockquotes, horizontal rules, and links. Images, tables, attachments, raw HTML, and arbitrary rich-text plugins are not supported.

Store descriptions as normalized Markdown, not rendered HTML. Links use an allow-list of protocols, and previews must be sanitized. A proposed limit is 20,000 UTF-8 characters per node to prevent uncontrolled project growth.

### 5.3 Commit, Validation, and History

- Dialog drafts live in component-local state. **Done** creates one combined metadata/config command so one editing session corresponds to one undo step; **Cancel** does not change domain state.
- Show field validation directly in Config. Blocking errors keep the dialog open and focus the first invalid field.
- The compiler/Runtime must not interpret descriptions, and descriptions must not affect the executable graph's semantic digest. They remain part of the authoring source and must be saved and round-tripped.
- Name, label mode, and description must not be placed in `params`; `params` contains execution configuration only.
- Enabled/disabled changes are part of the same draft. **Done** commits `node.disabled` together with other changes as one undo step; **Cancel** preserves the state from before Node detail was opened.

### 5.4 Enable/Disable Semantics

- New nodes are enabled by default; an absent `disabled` field and `disabled: false` both mean enabled.
- Disabled nodes remain in the workflow source and graph. The editor must not delete or automatically reconnect edges in the file.
- Incoming/outgoing edges of disabled nodes retain their IDs, positions in ordered edges, and selection/editing capabilities. The UI may dim them or render them dashed but must not hide them.
- At compile/run time, a disabled node with exactly one control input and one control output is bypassed: an incoming control event goes directly to the output without invoking the node's runtime handler.
- If the disabled node's output has multiple outgoing edges, the event fans out according to the execution order specified in section 7.1.
- Entry triggers/Start cannot be disabled.
- Nodes with no inputs, no outputs, multiple control inputs, or multiple control outputs may only be disabled if the exact definition declares `disabledBehavior` with an explicit input → output mapping. Otherwise, the Disabled button is unavailable and Help/tooltip explains why.
- Disabled nodes do not require the Runtime capabilities/permissions of their handlers because handlers do not execute. However, definition/version, ports, edges, cycles, and `disabledBehavior` must still be validated.
- Configuration errors on disabled nodes remain visible in the editor so they can be fixed before re-enabling, but do not block Run when `disabledBehavior` is valid. Such issues have warning severity; structural graph issues remain errors.
- Re-enabling restores normal execution with the original config, description, and connections intact.

## 6. `flow.` and `global.` Variables

### 6.1 Scopes

| Prefix    | Read/write scope                                               | Default lifetime                                           |
| --------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| `flow.`   | Nodes within the same workflow invocation                      | From the beginning to the end of that workflow invocation  |
| `global.` | All workflow invocations within the same project run/run group | From the start of the project run until the run group ends |

- Both scopes are isolated by run group; they are not implicitly shared across users, projects, devices, or separate Runs.
- Persistence across Runs or application restarts is out of scope. If needed, it requires a separate storage/secret policy rather than silently redefining `global.`.
- For multiple devices in one run group, `flow.` is always isolated by workflow invocation. `global.` may be shared across devices only when the Runtime provides atomic/deterministic updates. Otherwise, the compiler must report unsupported behavior rather than introduce race conditions.

### 6.2 Syntax and Binding

- The UI presents `flow.` and `global.` as two choices in the variable picker for properties supporting bindings.
- Variable names follow the pattern `^[A-Za-z_][A-Za-z0-9_.-]{0,127}$`; the scope prefix is not part of the serialized name.
- The domain model uses a typed representation rather than storing only a concatenated string.
- The UI may render a binding as `flow.orderId` or `global.token`, but the compiler receives an object with separate `scope` and `name` fields.
- Only properties explicitly marked by the definition as supporting expressions/bindings may select variables.
- The validator checks names, scopes, declarations/types when declaration contracts are available, and node read/write permissions. Secrets must not be converted into plaintext global variables.

## 7. Connections

### 7.1 Unlimited Connections per Port

- Each input and output port accepts multiple edges. Authoring must not reject an edge merely because the port already has a connection.
- A handle/dot represents one semantic port, not one connection. Multiple edges reuse the same handle;
  the UI must not add a dot per edge. Distinct Catalog ports such as **Success** and **Error** retain
  separate handles and accessible labels.
- Compact node cards do not show permanent `N input · M output` text because that is a port count and
  can be mistaken for connection count. Exact port names remain available from handle labels and Help.
- There is no business-level limit per node or port. The existing document-wide safety limit of 10,000 edges remains in place to protect the parser/UI and must not be characterized as cardinality.
- Exact duplicate edges with the same source node/port and target node/port are still rejected.
- Source and target ports must exist and have valid direction, kind, and value type.
- Self-edges and cycles without clear loop/control-node semantics remain prohibited.
- `PortDefinition.cardinality` is no longer used to block control connections. The adapter must not default it to `one`, and the validator must not issue `INPUT_CARDINALITY`/`OUTPUT_CARDINALITY` under the new policy. If the field remains necessary for future data ports, rename or clarify its semantics, or explicitly version the contract.

Runtime semantics for control fan-out/fan-in:

- The order of entries in `WorkflowDocument.edges` is the authoritative execution order and must remain stable across save/reopen, undo/redo, migration, and adapter projection.
- An output event is delivered to every outgoing edge of that port in the order they appear in `edges`.
- Newly connected edges are appended after existing edges. Reconnection retains the edge's position in the array; deletion removes only that edge without reordering others.
- On the same device, targets are scheduled sequentially in execution order unless a control node/definition explicitly declares parallel semantics.
- A node with multiple incoming edges executes once per incoming control event. Join/wait-all behavior belongs only to dedicated nodes with explicit semantics and must not be inferred from the number of edges.
- If the UI supports changing execution order, edge reordering must be an explicit, undoable command and must not depend on React Flow rendering order.

### 7.2 Dragging a Connection and Suggesting the Next Node

- When a user drags from an output handle and releases on empty canvas, open an **Add connected node** panel at the drop position.
- The list contains only node definitions with at least one input compatible with the dragged output, while respecting catalog availability/deprecation policy.
- The panel supports search, categories, keyboard navigation, and name + icon display; hover/focus uses the same description tooltip as the Palette.
- Selecting a node atomically creates the node at the drop location, chooses a compatible input, creates the edge, and selects the new node. The entire operation is one undo step.
- If multiple compatible inputs exist, the UI asks the user to choose or applies `preferredInput` from the catalog; it must not choose based on unstable object ordering.
- Escape, clicking outside, or dropping from an invalid input/handle closes the panel without modifying the workflow.
- If adding or connecting fails, no orphan nodes/edges remain; show an actionable reason.

### 7.3 Reconnect

- Users can drag an existing edge endpoint to another port.
- Reconnection follows the same validation rules as connection and commits atomically. If canceled or the new target is invalid, the original edge remains intact.
- A successful reconnection is one undo step; it must not be implemented as a visible delete-and-add sequence that disrupts history or causes canvas flicker.

### 7.4 Delete Connection or Connection + Node

- Selecting an edge and pressing Delete/Backspace, or using **Delete connection**, removes only that edge; both endpoint nodes remain.
- **Delete node and connections** removes the selected node and all its incoming/outgoing edges. It does not automatically delete other downstream/upstream nodes.
- When the node has at least one edge, confirm the action and show the number of connections to be removed. Nodes without edges may be deleted directly according to general editor preferences.
- Deleting a node and its related edges is one command/undo step. Undo restores the node, layout, and all edges with their original IDs.
- Context menus/Node detail must use full labels to distinguish the two actions.

## 8. Proposed Contract Changes

The fields described below are additive and optional so older v1 workflows remain openable.

`NodeColorToken` is an enum/token from the Studio allow-list, such as `blue`, `green`, `amber`, `red`, `violet`, `cyan`, and `neutral`. The remote catalog must not provide arbitrary CSS values.

The command model needs additions or clearer separation.

A workflow schema bump is not required solely for adding optional fields if the old parser genuinely round-trips unknown fields. Before rollout, compatibility tests must verify open → edit another field → save using supported older versions. If any adapter drops appearance or description, the schema must be bumped and a migration added rather than relying only on parser passthrough.

The remote catalog currently lacks color, complete property Help, input ports, port descriptions, `preferredInput`, and ordering. The Catalog/API contract must add these fields or define official fallbacks; the renderer must not guess execution ports from screenshots or example UI.

## 9. State Ownership

- **Workflow source**: Custom name, appearance, description, enabled/disabled state, node config, variable bindings, and ordered edges.
- **Catalog snapshot**: Category, icon/color token, function description, property/port Help, and compatibility metadata.
- **Zustand editor session**: Category collapse state, search query, Help target, quick-drawer open state, Node detail open state, pending connection suggestion, and selected edge/node. Closing the quick drawer must not clear node selection.
- **Component-local**: Hover tooltip, rich-text draft before commit, and menu/popover focus.
- **React Flow** is a projection only; all add/update/reconnect/delete operations still go through application/domain commands.

## 10. Errors, Accessibility, and Security

- All new controls must work with a keyboard, show visible focus, and have accessible names.
- Icon-only nodes use the effective name as their screen-reader label; color is not the sole indicator.
- Hover tooltips also open on keyboard focus; important content must not be available only on hover.
- Dialogs trap focus, return focus to the node when closed, and warn about discarding uncommitted drafts if the policy requires explicit Done.
- Search/Help/Config errors must have appropriate persistent states rather than relying solely on toasts.
- Markdown, links, and catalog text must be sanitized in the Electron renderer. Scripts, iframes, inline event handlers, `javascript:` URLs, and remote styles are not supported.
- Node/edge command failures must not cause domain state and React Flow state to diverge.

## 11. Acceptance Criteria

### Palette and Help

- Search remains visible and usable while scrolling long lists.
- Collapse all closes every category; Expand all opens them; search temporarily expands matching groups and then restores the previous state.
- Normal items show only icon + name; both mouse hover and keyboard focus reveal descriptions.
- Help opened from the Palette, canvas, and Node detail shows the same data for the same `type@version`.
- Nodes with invalid color tokens use a safe fallback and never inject styles.
- There is no per-instance color control; a given type has the same color on every editor surface.

### Node Detail

- Single-click opens the correct node in the quick configuration drawer. Clicking outside/Escape/Close retracts it without clearing selection. Double-click opens the correct node in full Node detail without leaving both editors active.
- An empty name displays the function name; a custom name replaces the function name on the canvas.
- Switching between Icon only/Icon and name survives save, reload, and undo/redo.
- Config shows only properties from the exact definition version; Description round-trips Markdown without executing HTML/scripts.
- The Description toolbar contains only H1/H2/H3, bold, italic, code, ordered/unordered lists, blockquote, horizontal rule, and link; no image/table/attachment/raw HTML.
- Toggling Disabled and clicking Done dims the node, retains its connections, and creates exactly one undo step. Re-enabling restores the config and normal execution.
- Start nodes and nodes without valid `disabledBehavior` cannot be disabled.
- Cancel does not change the revision; a valid Done creates only one undo step.

### Variables

- The picker shows exactly `flow.` and `global.` for binding-capable fields.
- Serialization separates scope and name; save/reopen must not turn bindings into literal strings.
- Two run groups cannot see each other's variables; the validator rejects plaintext secrets.

### Connections

- An input and an output can each hold at least three compatible edges without cardinality errors.
- Duplicate edges, incompatible ports, and unsupported cycles are rejected with stable error codes.
- Dropping a connection onto empty canvas opens filtered suggestions; selecting a node creates node + edge in one undo step.
- Canceling suggestions does not change the revision; failure leaves no orphan node or edge.
- Invalid reconnection retains the original edge; valid reconnection can be undone in one step.
- Delete connection keeps both nodes. Delete node and connections removes exactly one node and all incident edges; undo restores the correct IDs, layout, and edges.

## 12. Minimum Test Ownership

- **Domain unit**: Metadata normalization, variable binding validation, unlimited fan-in/fan-out, ordered-edge execution, disabled bypass/unsupported topology, duplicate/type/cycle rules, atomic add-and-connect, reconnect, and cascade delete/undo.
- **Adapter unit**: Catalog color/order/Help/input mapping; workflow ↔ React Flow projection; unknown-definition fallback.
- **Component**: Sticky search, collapse all, hover/focus tooltip, Help, single-click quick drawer, click-away/Escape dismissal, double-click full detail, Markdown toolbar, enable/disable button, dimmed disabled state, validation, delete confirmation, and accessible icon-only nodes.
- **Integration**: Save/reopen appearance, Markdown description, disabled state, ordered edges, and scoped bindings; catalog refresh must not lose Help or instance metadata.
- **E2E Electron**: Drag connection onto canvas → select suggested node → verify execution order → disable/enable node → reconnect → delete edge → delete node → undo/redo → save/reopen.

## 13. Impact on the Current Implementation

Key areas to update during implementation:

- `src/domain/project/project.ts` and `project-schema.ts`: New metadata/description/bindings.
- `src/domain/workflow/node-definition.ts`: Editor hints, required color token, Help metadata, port contract, and `disabledBehavior`.
- `src/application/node-catalog/to-workflow-node-catalog.ts`: Remove default cardinality `one`; map color/order/input/Help when the API contract becomes available.
- `src/domain/workflow/workflow-commands.ts`: Remove cardinality rejection under the new policy; add metadata, enable/disable, add-and-connect, explicit edge reorder, and atomic reconnect commands.
- `src/domain/workflow/workflow-validator.ts`: Remove cardinality issues; add variable/metadata, `disabledBehavior`, and disabled-config severity validation.
- `NodePalette.tsx`: Sticky search, global collapse/expand, compact items, tooltip, and Help action.
- `AutomationNode.tsx`/`react-flow-adapter.ts`: Label mode, effective name, definition color, and dimmed disabled state.
- `WorkflowCanvas.tsx`: Double-click, connection suggestions, reconnect, and selected-edge behavior.
- Refactor `NodeInspector.tsx` into a quick `NodeConfigDrawer` (or wrap its existing schema form) with right-to-left animation, click-away/Escape/Close behavior, focus return, and preserved node selection.
- Add a separate Node detail component for common metadata, Config/Description, Help, and enable/disable behavior; do not overload the Android UI Inspector panel with node editing.
- Unit/component/E2E fixtures must include nodes with multiple ordered incoming/outgoing edges, catalog definitions with Help/color/`disabledBehavior`, and workflows containing disabled nodes.

## 14. Finalized Decisions and Open Questions

### 14.1 Finalized Decisions

1. Rich-text descriptions support only the Markdown subset in section 5.2; no images, tables, attachments, or raw HTML.
2. The order of elements in `WorkflowDocument.edges` is the execution order and a durable contract of the workflow source.
3. Node colors come exclusively from the exact node definition. Users cannot change or override an individual node instance's color.
4. Node detail has an Enabled/Disabled button. Disabled nodes are dimmed on the canvas and use the semantics specified in section 5.4.
5. `global.` can be shared across devices within the same run group.
6. The existing fixed right Inspector panel is reserved for Android UI snapshots. Selecting a node opens a separate quick configuration drawer beside it; closing that drawer does not deselect the node.

## 15. Inspector-readiness UX phases

The full UX update is not a prerequisite for Android UI Inspector. Only the phases below must be
completed before starting snapshot capture. Variables, unlimited connections, rich Description,
disabled-node semantics, connection suggestions, and full Node Detail remain independent workstreams.

### UX-F0 — Ownership and interaction contract

**Status:** Complete in documentation.

- Assign the existing right Inspector panel to Android UI Inspector.
- Define quick node configuration as a separate non-modal drawer.
- Decide that drawer dismissal preserves `selectedNodeId`.
- Define click-away, Escape, Close, focus return, and active-field blur behavior.
- Keep full Node Detail separate from the quick drawer.

**Exit criteria:** Product and implementation docs describe one non-conflicting layout and interaction
model.

### UX-F1 — Separate drawer visibility from node selection

**Status:** Implemented.

- Add `nodeConfigDrawerOpen` to editor session state.
- Selecting a node opens the drawer.
- Closing the drawer changes visibility only; it does not deselect the node.
- Selecting the same node again reopens the drawer.
- Resetting the workflow session clears both selection and drawer state.

**Exit criteria:** store tests prove visibility and selection can change independently.

### UX-F2 — Refactor workspace surfaces

**Status:** Implemented.

- Replace fixed `NodeInspector` content in the right panel with `AndroidInspectorPanel`.
- Keep an explicit placeholder where device controls and snapshots will be implemented.
- Wrap the existing schema-driven node parameter form in `NodeConfigDrawer`.
- Render the drawer inside the canvas panel so it overlays the canvas and remains immediately left of
  Android UI Inspector.
- Keep existing workflow commands, validation, duplicate, and delete behavior.

**Exit criteria:** selecting a node opens its parameter UI without changing panel sizes or covering the
Android Inspector placeholder.

### UX-F3 — Dismissal, focus, accessibility, and regression tests

**Status:** Implemented and verified in scope.

- Close on outside pointer interaction, Escape, and explicit Close.
- Let the active field finish its normal blur/commit path during pointer dismissal.
- Return focus to the selected React Flow node when possible.
- Keep the hidden drawer inert and unavailable to pointer/keyboard interaction.
- Add store and component tests for open, close, reopen, click-away, and Escape.
- Run formatting, lint, typecheck, unit/component tests, and production build.

**Exit criteria:** quality commands pass and the workflow editor retains existing add/edit/delete,
autosave, undo/redo, and panel-collapse behavior.

Verification refreshed on 2026-11-08:

- Changed files pass Prettier check.
- ESLint passes.
- Renderer and Electron TypeScript checks pass.
- All 105 Vitest tests pass across 23 files.
- Desktop production build passes.
- Inspector snapshot and selector tests remain green after the editor UX changes.

### Gate to Android UI Inspector implementation

After UX-F0 through UX-F3 pass, implementation can move directly to Inspector contracts, ADB device
enumeration, typed IPC, manual capture, snapshot rendering, hit-testing, and selector binding. The
remaining sections of this UX document must not block that work unless Inspector explicitly depends on
them.

## 16. Post-Inspector UX implementation phases

### UX-U1 — Palette and Help

**Status:** Implemented in Studio.

- Sticky search includes name, description, type, category and property keys.
- Search temporarily expands matching categories and preserves the prior collapse state.
- Collapse all / Expand all, compact icon + name items, hover/focus descriptions and independent Help
  actions are implemented.
- Help is generated from the exact `NodeDefinition`; missing text is not invented.

**External gap:** the current Catalog contract has no semantic color tokens, explicit ordering, port
descriptions or complete Help metadata. Studio intentionally does not infer or inject them.

### UX-U2 — Node metadata and detail

**Status:** Core metadata implemented; advanced editor partial.

- Workflow nodes accept optional `name`, `labelMode`, Markdown `description` and `disabled` fields.
- Double-click opens Node detail; Cancel leaves domain state unchanged and Done submits one
  `node.updateMetadata` command.
- Canvas uses effective labels, supports icon-only mode and shows a Disabled badge plus dimming.
- Entry nodes and definitions without exactly one control input/output cannot be disabled.

**Remaining:** move the schema-driven Config form into a combined draft, implement the restricted
Markdown toolbar/focus trap, and add external Runtime bypass contract tests.

### UX-U3 — Scoped variables

**Status:** Blocked by missing Catalog/Runtime contract.

No field in the current Catalog declares expression support, variable type, read/write permission or
secret policy. Storing `flow.name`/`global.name` strings would contradict the typed representation in
section 6, so Studio does not fabricate variable bindings. Implement this phase only after the shared
declaration and execution contract exists.

### UX-U4 — Connections

**Status:** Studio authoring implemented; Runtime semantics pending.

- Cardinality no longer blocks compatible control fan-in/fan-out; the 10,000-edge document safety
  limit remains.
- One handle is rendered per Catalog port, never per edge. Success and Error remain distinct, while
  every handle can carry multiple edges.
- Entry nodes expose no inferred input handle and reject incoming connections even though the current
  Catalog API lacks an explicit input-port list.
- Duplicate edges, incompatible ports and unsupported cycles retain stable validation.
- New edges append in source order; reconnect replaces an edge in place and preserves its array index.
- Dropping a connection on empty canvas shows compatible definitions and commits node + edge in one
  command.
- Edge deletion remains independent. Node deletion confirms the number of incident connections and
  cascades in one command.

**External gap:** Runtime sequential scheduling/fan-in semantics and end-to-end execution-order tests
are not present in this Studio repository.
