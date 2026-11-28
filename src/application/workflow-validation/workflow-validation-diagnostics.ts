export const WorkflowValidationDiagnosticCode = {
  EDITOR_GRAPH_CONTRACT_INVALID: 'EDITOR_GRAPH_CONTRACT_INVALID',
  GRAPH_SCHEMA_VERSION_UNSUPPORTED: 'GRAPH_SCHEMA_VERSION_UNSUPPORTED',
  NODE_ID_DUPLICATED: 'NODE_ID_DUPLICATED',
  EDGE_ID_DUPLICATED: 'EDGE_ID_DUPLICATED',
  START_NODE_COUNT_INVALID: 'START_NODE_COUNT_INVALID',
  ENTRY_NODE_INVALID: 'ENTRY_NODE_INVALID',
  END_NODE_UNREACHABLE: 'END_NODE_UNREACHABLE',
  EDGE_SOURCE_NODE_NOT_FOUND: 'EDGE_SOURCE_NODE_NOT_FOUND',
  EDGE_TARGET_NODE_NOT_FOUND: 'EDGE_TARGET_NODE_NOT_FOUND',
  EDGE_SOURCE_PORT_NOT_FOUND: 'EDGE_SOURCE_PORT_NOT_FOUND',
  END_NODE_HAS_OUTGOING_EDGE: 'END_NODE_HAS_OUTGOING_EDGE',
  NODE_UNREACHABLE: 'NODE_UNREACHABLE',
  GRAPH_CYCLE_DETECTED: 'GRAPH_CYCLE_DETECTED',
  NODE_TYPE_NOT_ACTIVE: 'NODE_TYPE_NOT_ACTIVE',
  NODE_CONFIG_INVALID: 'NODE_CONFIG_INVALID',
  NODE_ERROR_POLICY_INVALID: 'NODE_ERROR_POLICY_INVALID',
  NODE_BINDINGS_INVALID: 'NODE_BINDINGS_INVALID',
  NODE_VALUE_BINDING_INVALID: 'NODE_VALUE_BINDING_INVALID',
  NODE_PORT_EDGE_COUNT_INVALID: 'NODE_PORT_EDGE_COUNT_INVALID',
  SWITCH_PORT_EDGE_COUNT_INVALID: 'SWITCH_PORT_EDGE_COUNT_INVALID',
  WORKFLOW_INPUT_SCHEMA_INVALID: 'WORKFLOW_INPUT_SCHEMA_INVALID',
  RUNTIME_IR_PAYLOAD_TOO_LARGE: 'RUNTIME_IR_PAYLOAD_TOO_LARGE',
  GRAPH_NODE_LIMIT_EXCEEDED: 'GRAPH_NODE_LIMIT_EXCEEDED',
  GRAPH_EDGE_LIMIT_EXCEEDED: 'GRAPH_EDGE_LIMIT_EXCEEDED',
} as const;

export type WorkflowValidationDiagnosticCodeType =
  (typeof WorkflowValidationDiagnosticCode)[keyof typeof WorkflowValidationDiagnosticCode];

export const WorkflowIssueCode = {
  PROPERTY_REQUIRED: 'PROPERTY_REQUIRED',
  PROPERTY_INVALID: 'PROPERTY_INVALID',
  PROPERTY_UNKNOWN: 'PROPERTY_UNKNOWN',
  BINDING_SOURCE_INVALID: 'BINDING_SOURCE_INVALID',
  NODE_ID_DUPLICATE: 'NODE_ID_DUPLICATE',
  NODE_DEFINITION_MISSING: 'NODE_DEFINITION_MISSING',
  PERMISSION_MISSING: 'PERMISSION_MISSING',
  START_NODE_COUNT_INVALID: 'START_NODE_COUNT_INVALID',
  ENTRY_NODE_INVALID: 'ENTRY_NODE_INVALID',
  EDGE_ID_DUPLICATE: 'EDGE_ID_DUPLICATE',
  EDGE_DUPLICATE: 'EDGE_DUPLICATE',
  EDGE_NODE_MISSING: 'EDGE_NODE_MISSING',
  EDGE_PORT_MISSING: 'EDGE_PORT_MISSING',
  EDGE_TYPE_INCOMPATIBLE: 'EDGE_TYPE_INCOMPATIBLE',
  ERROR_POLICY_UNSUPPORTED: 'ERROR_POLICY_UNSUPPORTED',
  ERROR_ROUTE_REQUIRED: 'ERROR_ROUTE_REQUIRED',
  ERROR_ROUTE_FORBIDDEN: 'ERROR_ROUTE_FORBIDDEN',
  SWITCH_ROUTE_REQUIRED: 'SWITCH_ROUTE_REQUIRED',
  INPUT_REQUIRED: 'INPUT_REQUIRED',
  GRAPH_CYCLE: 'GRAPH_CYCLE',
} as const;

export type WorkflowIssueCodeType = (typeof WorkflowIssueCode)[keyof typeof WorkflowIssueCode];

interface WorkflowValidationDiagnosticContent {
  title: string;
  message: string;
}

export const WORKFLOW_ISSUE_TITLES = {
  PROPERTY_REQUIRED: 'Required field missing',
  PROPERTY_INVALID: 'Invalid field',
  PROPERTY_UNKNOWN: 'Unsupported field',
  BINDING_SOURCE_INVALID: 'Invalid input source',
  NODE_ID_DUPLICATE: 'Duplicate node',
  NODE_DEFINITION_MISSING: 'Unavailable node type',
  PERMISSION_MISSING: 'Permission required',
  START_NODE_COUNT_INVALID: 'Invalid Start node count',
  ENTRY_NODE_INVALID: 'Invalid workflow entry',
  EDGE_ID_DUPLICATE: 'Duplicate connection ID',
  EDGE_DUPLICATE: 'Duplicate connection',
  EDGE_NODE_MISSING: 'Missing connected node',
  EDGE_PORT_MISSING: 'Missing connection port',
  EDGE_TYPE_INCOMPATIBLE: 'Incompatible connection',
  ERROR_POLICY_UNSUPPORTED: 'Unsupported error policy',
  ERROR_ROUTE_REQUIRED: 'Error connection required',
  ERROR_ROUTE_FORBIDDEN: 'Error connection not allowed',
  SWITCH_ROUTE_REQUIRED: 'Switch connection required',
  INPUT_REQUIRED: 'Input connection required',
  GRAPH_CYCLE: 'Unsupported workflow loop',
} satisfies Record<WorkflowIssueCodeType, string>;

export function workflowIssueContent(issue: {
  code: string;
  message: string;
}): WorkflowValidationDiagnosticContent {
  return {
    title: WORKFLOW_ISSUE_TITLES[issue.code as WorkflowIssueCodeType] ?? 'Workflow problem',
    message: issue.message,
  };
}

export const WORKFLOW_VALIDATION_DIAGNOSTICS = {
  EDITOR_GRAPH_CONTRACT_INVALID: {
    title: 'Invalid workflow data',
    message:
      'Some workflow data has an invalid format. Review the affected node, then save and validate again.',
  },
  GRAPH_SCHEMA_VERSION_UNSUPPORTED: {
    title: 'Unsupported workflow version',
    message: 'Update Studio or migrate this workflow before validating again.',
  },
  NODE_ID_DUPLICATED: {
    title: 'Duplicate node',
    message: 'Two or more nodes have the same ID. Give each node a unique ID.',
  },
  EDGE_ID_DUPLICATED: {
    title: 'Duplicate connection',
    message: 'Two or more connections have the same ID. Recreate the duplicate connection.',
  },
  START_NODE_COUNT_INVALID: {
    title: 'Invalid Start node',
    message: 'The workflow must contain exactly one Start node.',
  },
  ENTRY_NODE_INVALID: {
    title: 'Invalid entry point',
    message: 'The workflow entry point must reference its single Start node.',
  },
  END_NODE_UNREACHABLE: {
    title: 'No reachable End node',
    message: 'Add an End node that can be reached from the Start node.',
  },
  EDGE_SOURCE_NODE_NOT_FOUND: {
    title: 'Missing source node',
    message: 'A connection starts from a node that no longer exists. Remove or reconnect it.',
  },
  EDGE_TARGET_NODE_NOT_FOUND: {
    title: 'Missing target node',
    message: 'A connection points to a node that no longer exists. Remove or reconnect it.',
  },
  EDGE_SOURCE_PORT_NOT_FOUND: {
    title: 'Invalid source output',
    message: 'A connection uses an unavailable output. Reconnect it to a valid output.',
  },
  END_NODE_HAS_OUTGOING_EDGE: {
    title: 'Invalid End node connection',
    message: 'An End node cannot connect to another node. Remove its outgoing connection.',
  },
  NODE_UNREACHABLE: {
    title: 'Unreachable node',
    message: 'This node cannot be reached from the Start node. Connect it or remove it.',
  },
  GRAPH_CYCLE_DETECTED: {
    title: 'Unsupported workflow loop',
    message: 'The Runtime cannot control this loop. Remove the circular connection.',
  },
  NODE_TYPE_NOT_ACTIVE: {
    title: 'Unavailable node type',
    message: 'Replace this node or activate its definition in the Node Catalog.',
  },
  NODE_CONFIG_INVALID: {
    title: 'Invalid node settings',
    message: 'Open this node configuration and correct its invalid values.',
  },
  NODE_ERROR_POLICY_INVALID: {
    title: 'Unsupported error policy',
    message: 'Choose an error policy supported by this node.',
  },
  NODE_BINDINGS_INVALID: {
    title: 'Invalid node inputs',
    message: 'Review the inputs for this node and its selected target mode.',
  },
  NODE_VALUE_BINDING_INVALID: {
    title: 'Unavailable input source',
    message: 'This node uses an invalid or unavailable input source. Select an available source.',
  },
  NODE_PORT_EDGE_COUNT_INVALID: {
    title: 'Invalid output connections',
    message: 'Each required node output must have exactly one outgoing connection.',
  },
  SWITCH_PORT_EDGE_COUNT_INVALID: {
    title: 'Invalid Switch branches',
    message: 'Each Switch branch must have exactly one outgoing connection.',
  },
  WORKFLOW_INPUT_SCHEMA_INVALID: {
    title: 'Invalid workflow inputs',
    message: 'Review the workflow input names, types, and constraints.',
  },
  RUNTIME_IR_PAYLOAD_TOO_LARGE: {
    title: 'Workflow is too large',
    message: 'Reduce the workflow size and try again.',
  },
  GRAPH_NODE_LIMIT_EXCEEDED: {
    title: 'Too many nodes',
    message: 'Split this workflow into smaller workflows, then validate again.',
  },
  GRAPH_EDGE_LIMIT_EXCEEDED: {
    title: 'Too many connections',
    message: 'Split this workflow into smaller workflows, then validate again.',
  },
} satisfies Record<WorkflowValidationDiagnosticCodeType, WorkflowValidationDiagnosticContent>;

export function workflowValidationDiagnosticContent(diagnostic: {
  code: string;
  message: string;
}): WorkflowValidationDiagnosticContent {
  return (
    WORKFLOW_VALIDATION_DIAGNOSTICS[diagnostic.code as WorkflowValidationDiagnosticCodeType] ?? {
      title: 'Workflow validation issue',
      message: diagnostic.message,
    }
  );
}
