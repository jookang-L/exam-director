"use client";

import * as React from "react";

type ToastVariant = "default" | "destructive" | "warning" | "success";

export type ToastItem = {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
};

type ToastState = {
  toasts: ToastItem[];
};

const listeners: Array<(state: ToastState) => void> = [];
let memoryState: ToastState = { toasts: [] };

function dispatch(next: ToastState) {
  memoryState = next;
  listeners.forEach((l) => l(memoryState));
}

let count = 0;
function newToastId() {
  count += 1;
  return `t_${Date.now()}_${count}`;
}

export function toast(opts: Omit<ToastItem, "id">): string {
  const id = newToastId();
  const item: ToastItem = { id, duration: 4000, variant: "default", ...opts };
  dispatch({ toasts: [item, ...memoryState.toasts].slice(0, 5) });
  return id;
}

export function dismissToast(id: string) {
  dispatch({ toasts: memoryState.toasts.filter((t) => t.id !== id) });
}

export function useToast() {
  const [state, setState] = React.useState<ToastState>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const i = listeners.indexOf(setState);
      if (i > -1) listeners.splice(i, 1);
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: dismissToast,
  };
}
