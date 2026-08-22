import { create } from 'zustand';

export type ToastVariant = 'success' | 'info' | 'warning' | 'error';

export interface Toast {
  id: string;
  variant: ToastVariant;
  message: string;
  /** Milliseconds before auto-dismiss. Errors stay until dismissed. */
  duration: number;
  action?: { label: string; onClick: () => void };
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 4000,
  info: 4500,
  warning: 6000,
  // Errors need a decision from the user, so they do not disappear on their own.
  error: 0,
};

/** Cap the stack so a burst of batch errors cannot bury the page. */
const MAX_VISIBLE = 4;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],

  push: ({ variant, message, action, duration }) => {
    const id = crypto.randomUUID();
    const toast: Toast = {
      id,
      variant,
      message,
      action,
      duration: duration ?? DEFAULT_DURATION[variant],
    };

    set((state) => ({ toasts: [...state.toasts, toast].slice(-MAX_VISIBLE) }));

    if (toast.duration > 0) {
      setTimeout(() => get().dismiss(id), toast.duration);
    }
    return id;
  },

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Imperative helpers for call sites that are not React components. */
export const toast = {
  success: (message: string) => useToasts.getState().push({ variant: 'success', message }),
  info: (message: string) => useToasts.getState().push({ variant: 'info', message }),
  warning: (message: string) => useToasts.getState().push({ variant: 'warning', message }),
  error: (message: string, action?: Toast['action']) =>
    useToasts.getState().push({ variant: 'error', message, action }),
};
