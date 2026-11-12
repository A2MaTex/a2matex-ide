import {
  AlertCircle,
  AlertTriangle,
  ListCheck,
  LoaderCircle,
  RotateCw,
  XCircle,
} from 'lucide-react';

import type { WorkflowValidationDiagnostic } from '@application/workflow-validation/workflow-validation';
import type { WorkflowIssue } from '@domain/workflow/workflow-validator';
import { Button } from '@presentation/components/ui/button';
import type { WorkflowValidationRunState } from '@presentation/features/workflow-editor/useWorkflowValidation';
import { useEditorStore, type BottomPanelTab } from '@presentation/stores/editor-store';

interface ProblemsPanelProps {
  issues: WorkflowIssue[];
  revision: number;
  savedRevision: number;
  validation: WorkflowValidationRunState;
  onValidate(): void;
}

const tabs: { id: BottomPanelTab; label: string }[] = [
  { id: 'problems', label: 'Problems' },
  { id: 'diagnostics', label: 'Diagnostics' },
];

function diagnosticPath(path: Array<string | number>) {
  if (path.length === 0) return '$';
  return path.reduce(
    (result, segment) =>
      typeof segment === 'number' ? `${result}[${segment}]` : `${result}.${segment}`,
    '$',
  );
}

function focusCanvasNode(nodeId: string) {
  const focus = () => {
    const node = [...document.querySelectorAll<HTMLElement>('.react-flow__node')].find(
      (candidate) => candidate.dataset.id === nodeId,
    );
    node?.focus();
  };
  if (window.requestAnimationFrame) window.requestAnimationFrame(focus);
  else window.setTimeout(focus, 0);
}

function DiagnosticRow({
  diagnostic,
  severity,
  onSelectNode,
  onSelectEdge,
}: {
  diagnostic: WorkflowValidationDiagnostic;
  severity: 'error' | 'warning';
  onSelectNode(nodeId: string): void;
  onSelectEdge(edgeId: string): void;
}) {
  const selectable = Boolean(diagnostic.nodeId || diagnostic.edgeId);
  const Icon = severity === 'error' ? XCircle : AlertTriangle;
  const content = (
    <>
      <Icon
        className={
          'mt-0.5 size-3.5 shrink-0 ' + (severity === 'error' ? 'text-destructive' : 'text-warning')
        }
      />
      <span className="min-w-0">
        <span className="block text-[11px] text-secondary-foreground">{diagnostic.message}</span>
        <span className="block break-all font-mono text-[10px] text-muted-foreground">
          {diagnostic.code} · {diagnosticPath(diagnostic.path)}
          {diagnostic.nodeId ? ` · node ${diagnostic.nodeId}` : ''}
          {diagnostic.edgeId ? ` · edge ${diagnostic.edgeId}` : ''}
        </span>
      </span>
    </>
  );

  if (!selectable) return <div className="flex items-start gap-2 px-4 py-2">{content}</div>;
  return (
    <button
      type="button"
      onClick={() => {
        if (diagnostic.nodeId) onSelectNode(diagnostic.nodeId);
        else if (diagnostic.edgeId) onSelectEdge(diagnostic.edgeId);
      }}
      className="flex w-full items-start gap-2 px-4 py-2 text-left hover:bg-accent"
    >
      {content}
    </button>
  );
}

function DiagnosticsContent({
  validation,
  onValidate,
  onSelectNode,
  onSelectEdge,
}: {
  validation: WorkflowValidationRunState;
  onValidate(): void;
  onSelectNode(nodeId: string): void;
  onSelectEdge(edgeId: string): void;
}) {
  if (validation.phase === 'idle') {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        <p>Workflow has not been validated on the server.</p>
        <Button className="mt-3" size="sm" variant="secondary" onClick={onValidate}>
          Validate saved workflow
        </Button>
      </div>
    );
  }

  if (validation.phase === 'saving' || validation.phase === 'validating') {
    return (
      <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground" role="status">
        <LoaderCircle className="size-4 animate-spin text-primary" />
        {validation.phase === 'saving'
          ? 'Saving locally before validation…'
          : `Validating saved revision ${validation.revision}…`}
      </div>
    );
  }

  if (validation.phase === 'failed') {
    return (
      <div className="p-4" role="alert">
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <div className="flex items-start gap-2">
            <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-destructive">Validation did not run</p>
              <p className="mt-1 text-xs leading-5 text-secondary-foreground">
                {validation.error.message}
              </p>
              <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                {validation.error.code}
              </p>
            </div>
          </div>
          <Button className="mt-3" size="sm" variant="secondary" onClick={onValidate}>
            <RotateCw /> Retry save and validate
          </Button>
        </div>
      </div>
    );
  }

  const diagnostics = [
    ...validation.output.errors.map((diagnostic) => ({ diagnostic, severity: 'error' as const })),
    ...validation.output.warnings.map((diagnostic) => ({
      diagnostic,
      severity: 'warning' as const,
    })),
  ];

  return (
    <div>
      {validation.stale ? (
        <div className="mx-3 my-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          <p>This result is outdated because the workflow changed after validation started.</p>
          <Button className="mt-2" size="sm" variant="secondary" onClick={onValidate}>
            <RotateCw /> Validate current revision
          </Button>
        </div>
      ) : null}

      {validation.output.truncated ? (
        <div className="mx-3 mb-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning font-mono">
          Only the first 100 diagnostics are shown.
        </div>
      ) : null}

      {diagnostics.length > 0 ? (
        <div className="">
          {diagnostics.map(({ diagnostic, severity }, index) => (
            <DiagnosticRow
              key={`${severity}:${diagnostic.code}:${diagnostic.nodeId ?? ''}:${diagnostic.edgeId ?? ''}:${diagnosticPath(diagnostic.path)}:${index}`}
              diagnostic={diagnostic}
              severity={severity}
              onSelectNode={onSelectNode}
              onSelectEdge={onSelectEdge}
            />
          ))}
        </div>
      ) : (
        <pre className="flex items-center p-4 font-mono text-xs leading-5 text-muted-foreground">
          <ListCheck size={14} /> No server diagnostics.
        </pre>
      )}
    </div>
  );
}

export function ProblemsPanel({
  issues,
  savedRevision,
  validation,
  onValidate,
}: ProblemsPanelProps) {
  const activeTab = useEditorStore((state) => state.activeBottomTab);
  const setActiveTab = useEditorStore((state) => state.setActiveBottomTab);
  const selectNode = useEditorStore((state) => state.selectNode);
  const selectEdge = useEditorStore((state) => state.selectEdge);
  const diagnosticCount =
    validation.phase === 'completed'
      ? validation.output.errors.length + validation.output.warnings.length
      : 0;

  return (
    <section className="flex h-full flex-col bg-panel" aria-label="Problems and output panel">
      <div className="flex h-12 shrink-0 items-center gap-1 p-2 text-sm font-medium">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={
              'h-full px-3 text-[10px] font-medium' +
              (activeTab === tab.id
                ? 'text-foreground bg-blue-300/10 rounded-lg'
                : 'border-transparent text-muted-foreground hover:text-foreground')
            }
          >
            {tab.label}
            {tab.id === 'problems' && issues.length > 0 ? ` (${issues.length})` : ''}
            {tab.id === 'diagnostics' && diagnosticCount > 0 ? ` (${diagnosticCount})` : ''}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === 'problems' ? (
          issues.length === 0 ? (
            <pre className="flex items-center p-4 font-mono text-xs leading-5 text-muted-foreground">
              <ListCheck size={14} /> No workflow problems detected.
            </pre>
          ) : (
            <div className="divide-y divide-border">
              {issues.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => entry.nodeId && selectNode(entry.nodeId)}
                  className="flex w-full items-start gap-2 px-4 py-2 text-left hover:bg-accent"
                >
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                  <span className="min-w-0">
                    <span className="block text-[11px] text-secondary-foreground">
                      {entry.message}
                    </span>
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      {entry.code}
                      {entry.nodeId ? ` · ${entry.nodeId}` : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )
        ) : (
          <DiagnosticsContent
            validation={validation}
            onValidate={onValidate}
            onSelectNode={(nodeId) => {
              selectNode(nodeId);
              focusCanvasNode(nodeId);
            }}
            onSelectEdge={selectEdge}
          />
        )}
      </div>
      <div className="sr-only">Saved revision {savedRevision}</div>
    </section>
  );
}
