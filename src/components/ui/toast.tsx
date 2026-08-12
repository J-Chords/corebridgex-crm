"use client";

import * as React from "react";
import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const ToastProvider = ToastPrimitive.Provider;
const useToastManager = ToastPrimitive.useToastManager;

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Viewport
      className={cn(
        "fixed top-auto right-4 bottom-4 z-50 mx-auto w-[calc(100vw-2rem)] sm:w-90",
        className
      )}
      {...props}
    />
  );
}

function ToastList() {
  const { toasts } = useToastManager();
  return toasts.map((toast) => (
    <ToastPrimitive.Root
      key={toast.id}
      toast={toast}
      className="absolute right-0 bottom-0 left-auto z-[calc(1000-var(--toast-index))] mr-0 w-full origin-bottom rounded-xl bg-popover p-3 text-sm text-popover-foreground ring-1 ring-foreground/10 transition-all data-ending-style:opacity-0 data-starting-style:translate-y-4 data-starting-style:opacity-0 [transform:translateY(calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*-0.75rem)))]"
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <ToastPrimitive.Title className="text-sm font-medium" />
          <ToastPrimitive.Description className="text-sm text-muted-foreground" />
        </div>
        <ToastPrimitive.Close
          render={<Button variant="ghost" size="icon-sm" className="shrink-0" />}
        >
          <XIcon />
          <span className="sr-only">Dismiss</span>
        </ToastPrimitive.Close>
      </div>
    </ToastPrimitive.Root>
  ));
}

/** Mounted once near the app root — any descendant can call useToastManager() to queue a toast. */
function Toaster() {
  return (
    <ToastPrimitive.Portal>
      <ToastViewport>
        <ToastList />
      </ToastViewport>
    </ToastPrimitive.Portal>
  );
}

export { ToastProvider, Toaster, useToastManager };
