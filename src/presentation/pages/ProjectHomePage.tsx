import { ArrowRight, FolderOpen, Info, Plus, RefreshCw, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@presentation/components/ui/button';
import { mergeRecentProjects } from '@application/project/recent-projects';
import { CreateProjectDialog } from '@presentation/features/project-session/CreateProjectDialog';
import { ProjectDetailsDialog } from '@presentation/features/project-session/ProjectDetailsDialog';
import type { RecentProjectItem } from '@application/project/recent-projects';
import { useProjectStore } from '@presentation/features/project-session/use-project-store';

const capabilityItems = [
  'Versioned project manifest',
  'Atomic local persistence',
  'Revision-safe editor session',
];

export function ProjectHomePage() {
  const navigate = useNavigate();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailsItem, setDetailsItem] = useState<RecentProjectItem | null>(null);
  const create = useProjectStore((state) => state.create);
  const importProject = useProjectStore((state) => state.importProject);
  const loadRecent = useProjectStore((state) => state.loadRecent);
  const open = useProjectStore((state) => state.open);
  const refreshCloudProjects = useProjectStore((state) => state.refreshCloudProjects);
  const recentProjects = useProjectStore((state) => state.recentProjects);
  const cloudIndex = useProjectStore((state) => state.cloudIndex);
  const cloudStatus = useProjectStore((state) => state.cloudStatus);
  const cloudError = useProjectStore((state) => state.cloudError);
  const status = useProjectStore((state) => state.status);
  const error = useProjectStore((state) => state.error);
  const busy = ['creating', 'importing', 'loading', 'opening'].includes(status);
  const refreshingCloud = cloudStatus === 'refreshing';
  const recentItems = mergeRecentProjects(recentProjects, cloudIndex.projects);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const enterWorkspace = (projectId: string) => navigate(`/workspace/${projectId}`);
  const handleCreate = async (input: { description?: string; name: string }) => {
    const snapshot = await create(input);
    if (!snapshot) return false;
    enterWorkspace(snapshot.localId);
    return true;
  };
  const handleImport = async () => {
    const snapshot = await importProject();
    if (snapshot) enterWorkspace(snapshot.localId);
  };
  const handleRecent = async (localId: string) => {
    const snapshot = await open(localId);
    if (snapshot) enterWorkspace(snapshot.localId);
  };

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_65%_-10%,var(--primary-soft),transparent_34%)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 lg:px-10">
        <section className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <h1 className="max-w-3xl text-2xl font-black tracking-[0.03em] md:text-4xl">
              Every Action, Under Your Control.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Design powerful Android workflows visually. From your first node to real execution.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void refreshCloudProjects()}
              disabled={busy || refreshingCloud}
              title="Refresh the cloud project index without overwriting local drafts"
            >
              <RefreshCw className={refreshingCloud ? 'animate-spin' : undefined} />
              <span className="text-sm font-medium">
                {refreshingCloud ? 'Syncing…' : 'Sync'}
              </span>
            </Button>
            <Button variant="outline" onClick={handleImport} disabled={busy}>
              <FolderOpen />{' '}
              <span className="text-sm font-medium">
                {status === 'importing' ? 'Importing…' : 'Import project'}{' '}
              </span>
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)} disabled={busy}>
              <Plus /> <span className="text-sm font-medium">New project</span>
            </Button>
          </div>
        </section>

        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/35 bg-destructive/10 px-4 py-3 text-xs text-destructive"
          >
            {error}
          </div>
        ) : null}
        {cloudError ? (
          <div className="rounded-lg border border-warning/35 bg-warning/10 px-4 py-3 text-xs text-warning">
            Cloud refresh: {cloudError}. Showing the last cached index when available.
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1.45fr_0.55fr]">
          <article className="overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-black/10">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold">Recent projects</h2>

              <span className="rounded-md bg-secondary px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {cloudStatus === 'refreshing' ? 'syncing…' : recentItems.length}
              </span>
            </div>
            {recentItems.length === 0 ? (
              <div className="grid min-h-64 place-items-center p-8 text-center">
                <div>
                  <div className="mx-auto grid size-12 place-items-center rounded-xl border border-border bg-secondary text-muted-foreground">
                    <Workflow className="size-5" />
                  </div>
                  <h3 className="mt-4 text-sm font-medium">No local projects yet</h3>
                  <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
                    Create a local-first project or import an existing project folder. Your working
                    copy remains available after Studio restarts.
                  </p>
                  <Button
                    className="mt-5"
                    size="sm"
                    variant="secondary"
                    onClick={() => setCreateDialogOpen(true)}
                  >
                    Create first project <ArrowRight />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentItems.map((project) => (
                  <div
                    key={project.key}
                    className="flex items-center pr-3 transition-colors hover:bg-accent"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        project.local
                          ? handleRecent(project.local.localId)
                          : setDetailsItem(project)
                      }
                      className="flex min-w-0 flex-1 items-center gap-4 px-5 py-4 text-left"
                    >
                      <div className="grid size-9 place-items-center rounded-lg bg-secondary text-cyan-400">
                        <Workflow className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{project.name}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          Updated {new Date(project.effectiveUpdatedAt).toLocaleString()}
                        </div>
                      </div>
                      {project.local ? (
                        <ArrowRight className="size-4 text-muted-foreground" />
                      ) : null}
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`View details for ${project.name}`}
                      onClick={() => setDetailsItem(project)}
                    >
                      <Info />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </article>
          <aside className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-400">
              Project contract
            </p>
            <h2 className="mt-3 text-lg font-semibold">Safe by default</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              SQLite is the working source of truth. Folder access is limited to explicit import and
              export actions.
            </p>
            <ul className="mt-5 space-y-3">
              {capabilityItems.map((item, index) => (
                <li
                  key={item}
                  className="flex items-center gap-3 text-xs text-secondary-foreground"
                >
                  <span className="grid size-6 place-items-center rounded-md border border-border bg-secondary font-mono text-[10px] text-cyan-400">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </aside>
        </section>
      </div>
      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreate={handleCreate}
        busy={status === 'creating'}
      />
      {detailsItem ? (
        <ProjectDetailsDialog
          key={detailsItem.key}
          item={detailsItem}
          open
          onOpenChange={(open) => !open && setDetailsItem(null)}
        />
      ) : null}
    </div>
  );
}
