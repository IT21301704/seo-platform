"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";

interface State {
  ok: boolean;
  message: string;
}

/** A form bound to a server action that returns { ok, message }. */
export function ActionForm({
  action,
  submitLabel,
  disabled,
  children,
  className,
}: {
  action: (prev: State | null, formData: FormData) => Promise<State>;
  submitLabel: string;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className ?? "flex flex-col gap-3"}>
      <fieldset disabled={disabled} className="m-0 flex flex-col gap-3 border-0 p-0">
        {children}
      </fieldset>
      {!disabled && (
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center self-start rounded-lg border border-[#CFCFC8] bg-white px-3 text-sm font-semibold disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
      )}
      {state && (
        <p role="status" className={`m-0 text-sm ${state.ok ? "text-pass" : "text-crit"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
