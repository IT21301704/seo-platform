"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
import type { FixActionState } from "@/app/projects/[id]/fixes/actions";

type Action = (prev: FixActionState | null, formData: FormData) => Promise<FixActionState>;

function Status({ state }: { state: FixActionState | null }) {
  if (!state) return null;
  return (
    <p role="status" className={`m-0 text-xs ${state.ok ? "text-pass" : "text-crit"}`}>
      {state.message}
    </p>
  );
}

/** "Edit" in the review table: change the value, then the rule engine re-checks it. */
export function FixValueEditor({
  action,
  value,
  label,
  multiline,
}: {
  action: Action;
  value: string;
  label: string;
  multiline: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const field = "w-full rounded-lg border border-[#CFCFC8] bg-white px-2 py-1.5 text-sm";
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-sm font-semibold text-primary">Edit</summary>
      <form action={formAction} className="mt-2 flex flex-col gap-2">
        <label className="sr-only" htmlFor={`edit-${label}`}>
          {label}
        </label>
        {multiline ? (
          <textarea
            id={`edit-${label}`}
            name="value"
            defaultValue={value}
            rows={3}
            className={field}
          />
        ) : (
          <input id={`edit-${label}`} name="value" defaultValue={value} className={field} />
        )}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-8 items-center self-start rounded-lg border border-[#CFCFC8] bg-white px-3 text-sm font-semibold disabled:opacity-60"
        >
          {pending ? "Checking…" : "Save and re-check"}
        </button>
        <Status state={state} />
      </form>
    </details>
  );
}

/**
 * The approve form. Row checkboxes live in the table and join it with form="publish-form",
 * so the inline edit forms are not nested inside it.
 */
export function PublishForm({
  action,
  label,
  disabled,
  title,
}: {
  action: Action;
  label: string;
  disabled: boolean;
  title?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form id="publish-form" action={formAction} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={disabled || pending}
        title={title}
        className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Publishing…" : label}
      </button>
      <Status state={state} />
    </form>
  );
}

/** A single button bound to a server action (Roll back batch, Undo, Re-apply). */
export function ActionButton({
  action,
  children,
  variant = "secondary",
  confirm,
}: {
  action: (prev: FixActionState | null) => Promise<FixActionState>;
  children: ReactNode;
  variant?: "secondary" | "link";
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="flex flex-col items-end gap-1"
    >
      <button
        type="submit"
        disabled={pending}
        className={
          variant === "link"
            ? "border-0 bg-transparent p-0 text-sm font-semibold text-primary underline disabled:opacity-60"
            : "inline-flex h-10 items-center rounded-lg border border-[#CFCFC8] bg-white px-4 text-sm font-semibold disabled:opacity-60"
        }
      >
        {pending ? "Working…" : children}
      </button>
      <Status state={state} />
    </form>
  );
}
