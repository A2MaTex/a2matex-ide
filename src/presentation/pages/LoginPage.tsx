import { AlertCircle, Eye, EyeOff, LoaderCircle, LockKeyhole, UserRound } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@presentation/components/ui/button';
import { useAuth } from '@presentation/features/auth/use-auth';

interface LoginLocationState {
  from?: string;
}

function getSafeReturnPath(state: unknown): string {
  const from = (state as LoginLocationState | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')
    ? from
    : '/projects';
}

export function LoginPage() {
  const { clearError, error, login, session, status } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const returnPath = getSafeReturnPath(location.state);
  const submitting = status === 'submitting';

  useEffect(() => () => clearError(), [clearError]);

  if (status !== 'restoring' && session.status === 'authenticated') {
    return <Navigate replace to={returnPath} />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();
    const normalizedAccount = account.trim();
    if (!normalizedAccount || !password) {
      setValidationMessage('Enter your account and password.');
      return;
    }

    setValidationMessage(null);
    try {
      await login({ account: normalizedAccount, password });
      navigate(returnPath, { replace: true });
    } catch {
      // The provider exposes the sanitized error for rendering.
    } finally {
      setPassword('');
    }
  }

  const message = validationMessage ?? error?.message;

  return (
    <main className="relative grid min-h-screen overflow-hidden bg-background px-5 py-10 text-foreground sm:place-items-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgb(24_216_248/0.13),transparent_36rem)]" />
      <section className="relative mx-auto w-full max-w-md rounded-2xl border border-border/80 bg-panel/95 p-6 shadow-[0_28px_100px_rgb(0_0_0/0.55),0_0_60px_rgb(16_136_248/0.08)] sm:p-8">
        <div className="mb-8 text-center">
        <div className="flex items-center justify-center">
            <img src="/full-logo.webp" alt="" aria-hidden="true" className="object-contain w-36" />
            <div className="truncate text-2xl mt-1.5 font-medium tracking-tight text-white/60">
              Studio
            </div>
          </div>
            
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Please sign in to access your workspace
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2 text-sm font-medium">
            <label className="block" htmlFor="account">
              Account
            </label>
            <span className="relative block">
              <UserRound
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="account"
                name="account"
                autoComplete="username"
                autoFocus
                className="h-11 w-full rounded-lg border border-border bg-background/75 pl-10 pr-3 text-sm outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/15"
                value={account}
                onChange={(event) => {
                  setAccount(event.target.value);
                  setValidationMessage(null);
                }}
                disabled={submitting}
              />
            </span>
          </div>

          <div className="space-y-2 text-sm font-medium">
            <label className="block" htmlFor="password">
              Password
            </label>
            <span className="relative block">
              <LockKeyhole
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="h-11 w-full rounded-lg border border-border bg-background/75 pl-10 pr-11 text-sm outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/15"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setValidationMessage(null);
                }}
                disabled={submitting}
              />
              <button
                type="button"
                className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((visible) => !visible)}
                disabled={submitting}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </span>
          </div>

          {message ? (
            <div
              className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
              role="alert"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{message}</span>
            </div>
          ) : null}

          <Button className="h-11 w-full" type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                <span className='font-medium'>Signing in...</span>
              </>
            ) : (
              <span className='font-medium'>Sign in</span>
            )}
          </Button>
        </form>
      </section>
    </main>
  );
}
