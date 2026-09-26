"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
import type { SecretState } from "@/app/projects/[id]/api/actions";

/** A form whose server action returns a one-time secret (API key or webhook signing secret). */
export function SecretForm({
  action,
  submitLabel,
  children,
}: {
  action: (prev: SecretState | null, formData: FormData) => Promise<SecretState>;
  submitLabel: string;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {children}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center self-start rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Creating…" : submitLabel}
      </button>
      {state && (
        <div
          role="status"
          className={`rounded-lg p-3 text-sm ${state.ok ? "bg-pass-bg text-pass" : "bg-crit-bg text-crit"}`}
        >
          <p className="m-0">{state.message}</p>
          {state.secret && (
            <code className="mt-2 block break-all rounded bg-white p-2 font-mono text-[13px] text-ink">
              {state.secret}
            </code>
          )}
        </div>
      )}
    </form>
  );
}
