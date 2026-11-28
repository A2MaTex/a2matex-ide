export type WorkflowCommandErrorCode =
  | 'DUPLICATE_EDGE'
  | 'DUPLICATE_NODE'
  | 'EDGE_NOT_FOUND'
  | 'GRAPH_CYCLE'
  | 'INVALID_NODE_CONFIGURATION'
  | 'INVALID_NODE_METADATA'
  | 'NODE_DEFINITION_MISSING'
  | 'NODE_NOT_FOUND'
  | 'PORT_INCOMPATIBLE'
  | 'PORT_NOT_FOUND'
  | 'START_NODE_ALREADY_EXISTS'
  | 'START_NODE_REQUIRED';

export class WorkflowCommandError extends Error {
  readonly code: WorkflowCommandErrorCode;

  constructor(code: WorkflowCommandErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'WorkflowCommandError';
  }
}
