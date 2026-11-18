import { X } from 'lucide-react';
import { Toaster, ToastBar, toast as hotToast } from 'react-hot-toast';

export function ToastViewport() {
  return (
    <Toaster
      position="top-right"
      reverseOrder={false}
      gutter={10}
      containerStyle={{ top: 16, right: 16 }}
      toastOptions={{
        duration: 4_200,
        removeDelay: 260,
        success: {
          duration: 3_800,
          iconTheme: { primary: 'var(--success)', secondary: 'var(--card)' },
        },
        error: {
          duration: 6_500,
          iconTheme: { primary: 'var(--destructive)', secondary: 'var(--card)' },
        },
        loading: {
          iconTheme: { primary: 'var(--primary)', secondary: 'var(--muted)' },
        },
      }}
    >
      {(item) => (
        <ToastBar
          toast={item}
          style={{
            ...item.style,
            animation: item.visible
              ? 'studio-toast-enter 320ms cubic-bezier(0.16, 1, 0.3, 1) both'
              : 'studio-toast-leave 220ms cubic-bezier(0.4, 0, 1, 1) both',
            background: 'color-mix(in srgb, var(--card) 94%, black)',
            border: '1px solid color-mix(in srgb, var(--border) 72%, transparent)',
            borderRadius: 14,
            boxShadow:
              '0 16px 42px rgb(0 0 0 / 38%), 0 4px 12px rgb(0 0 0 / 24%), inset 0 1px rgb(255 255 255 / 3%)',
            color: 'var(--foreground)',
            maxWidth: 'min(380px, calc(100vw - 32px))',
            padding: '11px 10px 11px 13px',
          }}
        >
          {({ icon, message }) => (
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center" aria-hidden>
                {icon}
              </span>
              <div className="min-w-0 flex-1">{message}</div>
              <button
                type="button"
                onClick={() => hotToast.dismiss(item.id)}
                className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-white/6 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Dismiss notification"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
        </ToastBar>
      )}
    </Toaster>
  );
}
