import { AlertCircle, CheckCircle2 } from 'lucide-react';

import type { WorkflowIssue } from '@domain/workflow/workflow-validator';
import { useEditorStore, type BottomPanelTab } from '@presentation/stores/editor-store';

interface ProblemsPanelProps {
  issues: WorkflowIssue[];
  revision: number;
  savedRevision: number;
}

const tabs: { id: BottomPanelTab; label: string }[] = [
  { id: 'problems', label: 'Problems' },
  { id: 'output', label: 'Output' },
  { id: 'diagnostics', label: 'Diagnostics' },
];

export function ProblemsPanel({ issues, revision, savedRevision }: ProblemsPanelProps) {
  const activeTab = useEditorStore((state) => state.activeBottomTab);
  const setActiveTab = useEditorStore((state) => state.setActiveBottomTab);
  const selectNode = useEditorStore((state) => state.selectNode);

  return (
    <section className="flex h-full flex-col bg-panel" aria-label="Problems and output panel">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2 text-sm font-medium">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={
              'h-full border-b-2 px-3 text-[10px] font-medium uppercase tracking-wider ' +
              (activeTab === tab.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground')
            }
          >
            {tab.label}
            {tab.id === 'problems' && issues.length > 0 ? ' (' + issues.length + ')' : ''}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === 'problems' ? (
          issues.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 text-[11px] text-success">
              <CheckCircle2 className="size-4" /> No workflow problems detected.
            </div>
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
                    <span className="block font-mono text-[9px] text-muted-foreground">
                      {entry.code}
                      {entry.nodeId ? ' · ' + entry.nodeId : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )
        ) : activeTab === 'output' ? (
          <pre className="p-4 font-mono text-[10px] leading-5 text-muted-foreground">
            [editor] workflow revision {revision}
            {'\n'}
            [validator] {issues.length} issue(s)
          </pre>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 p-4 font-mono text-[10px]">
            <dt className="text-muted-foreground">Working revision</dt>
            <dd>{revision}</dd>
            <dt className="text-muted-foreground">Saved revision</dt>
            <dd>{savedRevision}</dd>
            <dt className="text-muted-foreground">Validation</dt>
            <dd>{issues.length === 0 ? 'ready' : 'blocked'}</dd>
          </dl>
        )}
      </div>
    </section>
  );
}
