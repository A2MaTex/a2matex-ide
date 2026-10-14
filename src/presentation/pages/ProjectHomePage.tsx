import { ArrowRight, FolderOpen, Plus, Workflow } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@presentation/components/ui/button';
import { CreateProjectDialog } from '@presentation/features/project-session/CreateProjectDialog';
import { useProjectStore } from '@presentation/features/project-session/use-project-store';

const capabilityItems = [
  'Versioned project manifest',
  'Atomic local persistence',
  'Revision-safe editor session',
];

export function ProjectHomePage() {
  const navigate = useNavigate();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const create = useProjectStore((state) => state.create);
  const open = useProjectStore((state) => state.open);
  const reopen = useProjectStore((state) => state.reopen);
  const recentProjects = useProjectStore((state) => state.recentProjects);
  const status = useProjectStore((state) => state.status);
  const error = useProjectStore((state) => state.error);
  const busy = status === 'creating' || status === 'opening';

  const enterWorkspace = (projectId: string) => navigate(`/workspace/${projectId}`);
  const handleCreate = async (name: string) => {
    const snapshot = await create(name);
    if (!snapshot) return false;
    enterWorkspace(snapshot.document.manifest.projectId);
    return true;
  };
  const handleOpen = async () => {
    const snapshot = await open();
    if (snapshot) enterWorkspace(snapshot.document.manifest.projectId);
  };
  const handleRecent = async (locationId: string) => {
    const recent = recentProjects.find((item) => item.location.id === locationId);
    if (!recent) return;
    const snapshot = await reopen(recent.location);
    if (snapshot) enterWorkspace(snapshot.document.manifest.projectId);
  };

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_65%_-10%,var(--primary-soft),transparent_34%)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 lg:px-10">
        <section className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl">
              Build Android automation as a visual system.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Create or open a local project folder. Studio validates its schema before the editor
              can change or save it.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleOpen} disabled={busy}>
              <FolderOpen />{' '}
              <span className="text-sm font-medium">
                {status === 'opening' ? 'Opening…' : 'Open project'}{' '}
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

        <section className="grid gap-4 lg:grid-cols-[1.45fr_0.55fr]">
          <article className="overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-black/10">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold">Recent projects</h2>

              <span className="rounded-md bg-secondary px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {recentProjects.length}
              </span>
            </div>
            {recentProjects.length === 0 ? (
              <div className="grid min-h-64 place-items-center p-8 text-center">
                <div>
                  <div className="mx-auto grid size-12 place-items-center rounded-xl border border-border bg-secondary text-muted-foreground">
                    <Workflow className="size-5" />
                  </div>
                  <h3 className="mt-4 text-sm font-medium">No local projects yet</h3>
                  <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
                    Create a versioned project or open an existing folder. Recent capability grants
                    remain available during this session.
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
                {recentProjects.map((project) => (
                  <button
                    key={project.location.id}
                    type="button"
                    onClick={() => handleRecent(project.location.id)}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-accent"
                  >
                    <div className="grid size-9 place-items-center rounded-lg bg-secondary text-cyan-400">
                      <Workflow className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {project.document.manifest.name}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {project.location.displayPath}
                      </div>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </button>
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
              Renderer operations use short-lived location grants rather than arbitrary filesystem
              paths.
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
    </div>
  );
}
