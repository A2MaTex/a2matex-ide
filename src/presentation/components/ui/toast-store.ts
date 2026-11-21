import { createElement } from 'react';
import hotToast, { type ToastOptions as HotToastOptions } from 'react-hot-toast';
import { Info, TriangleAlert } from 'lucide-react';

interface ToastOptions {
  description?: string;
  duration?: number | null;
  id?: string;
}

function content(title: string, description?: string) {
  return createElement(
    'div',
    { className: 'min-w-0 py-0.5' },
    createElement('p', { className: 'text-[13px] font-semibold leading-4 text-foreground' }, title),
    description
      ? createElement(
          'p',
          { className: 'mt-1 text-[11px] leading-4 text-muted-foreground' },
          description,
        )
      : null,
  );
}

function options(input: ToastOptions = {}): HotToastOptions {
  return {
    duration: input.duration === null ? Infinity : input.duration,
    id: input.id,
  };
}

export const toast = {
  dismiss: (id?: string) => hotToast.dismiss(id),
  error: (title: string, input?: ToastOptions) =>
    hotToast.error(content(title, input?.description), options(input)),
  info: (title: string, input?: ToastOptions) =>
    hotToast(content(title, input?.description), {
      ...options(input),
      icon: createElement(Info, { className: 'size-5 text-primary', strokeWidth: 2 }),
    }),
  loading: (title: string, input?: ToastOptions) =>
    hotToast.loading(content(title, input?.description), options({ ...input, duration: null })),
  success: (title: string, input?: ToastOptions) =>
    hotToast.success(content(title, input?.description), options(input)),
  warning: (title: string, input?: ToastOptions) =>
    hotToast(content(title, input?.description), {
      ...options(input),
      icon: createElement(TriangleAlert, {
        className: 'size-5 text-warning',
        strokeWidth: 2,
      }),
    }),
};
