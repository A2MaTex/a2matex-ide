import { ArrowRight, FolderOpen, Plus, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@presentation/components/ui/button';

const capabilityItems = [
  'Visual workflow canvas',
  'Schema-driven node inspector',
  'Shared Runtime execution',
];

export function ProjectsPage() {
  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_65%_-10%,var(--primary-soft),transparent_34%)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 lg:px-10">
        <section className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <span className="size-1.5 rounded-full bg-primary" />
              Foundation · Phase 0
            </div>
            <h1 className="max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl">
              Build Android automation as a visual system.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Design workflows, validate node contracts, and run the same artifact through the
              shared A2MaTeX Runtime.
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline">
              <FolderOpen /> Open project
            </Button>
            <Button>
              <Plus /> New project
            </Button>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.45fr_0.55fr]">
          <article className="overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-black/10">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold">Recent projects</h2>
                <p className="mt-1 text-xs text-muted-foreground">Local workspace</p>
              </div>
              <span className="rounded-md bg-secondary px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Ready
              </span>
            </div>

            <div className="grid min-h-64 place-items-center p-8 text-center">
              <div>
                <div className="mx-auto grid size-12 place-items-center rounded-xl border border-border bg-secondary text-muted-foreground">
                  <Workflow className="size-5" />
                </div>
                <h3 className="mt-4 text-sm font-medium">No local projects yet</h3>
                <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
                  Phase 1 will connect these actions to the atomic project repository. Open the
                  workspace shell now to inspect the editor foundation.
                </p>
                <Button asChild className="mt-5" size="sm" variant="secondary">
                  <Link to="/workspace/local-sandbox">
                    Open workspace shell <ArrowRight />
                  </Link>
                </Button>
              </div>
            </div>
          </article>

          <aside className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
              Studio pipeline
            </p>
            <h2 className="mt-3 text-lg font-semibold">One model, one Runtime</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              The editor stays separate from execution infrastructure through typed ports.
            </p>
            <ul className="mt-5 space-y-3">
              {capabilityItems.map((item, index) => (
                <li
                  key={item}
                  className="flex items-center gap-3 text-xs text-secondary-foreground"
                >
                  <span className="grid size-6 place-items-center rounded-md border border-border bg-secondary font-mono text-[10px] text-primary">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </aside>
        </section>
      </div>
    </div>
  );
}
