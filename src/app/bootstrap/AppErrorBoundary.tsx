import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@presentation/components/ui/button';
import { createLogger } from '@shared/logging/logger';

const logger = createLogger('renderer.error-boundary');

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('unhandled_render_error', {
      errorName: error.name,
      componentStackPresent: Boolean(info.componentStack),
    });
  }

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
          <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-destructive">
              Renderer error
            </p>
            <h1 className="text-xl font-semibold">Studio could not render this screen</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Reload the workspace. Your project files are not modified by this recovery action.
            </p>
            <Button className="mt-5" onClick={this.reload}>
              Reload Studio
            </Button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
