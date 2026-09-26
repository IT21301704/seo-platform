"use client";

import { useActionState, useState } from "react";
import type { ReactNode } from "react";
import type { BulkResult } from "@/app/projects/[id]/issues/actions";

const control = "h-9 rounded-lg border border-[#CFCFC8] bg-white px-2 text-sm";
const button =
  "inline-flex h-9 items-center rounded-lg border border-[#CFCFC8] bg-white px-3 text-sm font-semibold hover:bg-canvas disabled:opacity-50";

/**
 * Wraps the issue table in one form so the row checkboxes (name="selection") and the bulk
 * action bar submit together (screen 04).
 */
export function BulkForm({
  action,
  users,
  exportHref,
  editable,
  children,
}: {
  action: (prev: BulkResult | null, formData: FormData) => Promise<BulkResult>;
  users: { id: string; name: string }[];
  exportHref: string;
  editable: boolean;
  children: ReactNode;
}) {
  const [result, formAction, pending] = useActionState(action, null);
  const [selected, setSelected] = useState(0);

  return (
    <form
      action={formAction}
      onChange={(e) => {
        const form = e.currentTarget;
        setSelected(form.querySelectorAll('input[name="selection"]:checked').length);
      }}
      className="flex flex-col gap-4"
    >
      <div
        className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[#C9D3F5] bg-primary-soft px-4 py-3"
        role="group"
        aria-label="Bulk actions"
      >
        <span className="mr-auto text-sm font-semibold">
          {selected === 0 ? "Select issues or pages" : `${selected} selected`}
        </span>
        <button type="button" disabled className={button} title="Auto-fix arrives in Phase 3">
          Auto-fix
        </button>
        {editable && (
          <>
            <label className="sr-only" htmlFor="bulk-assignee">
              Assignee
            </label>
            <select id="bulk-assignee" name="assigneeId" className={control} defaultValue="">
              <option value="" disabled>
                Assign to…
              </option>
              <option value="none">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              name="action"
              value="assign"
              className={button}
              disabled={pending || selected === 0}
            >
              Assign
            </button>
            <label className="sr-only" htmlFor="bulk-status">
              New status
            </label>
            <select id="bulk-status" name="status" className={control} defaultValue="">
              <option value="" disabled>
                Status…
              </option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="fixed">Fixed</option>
            </select>
            <button
              type="submit"
              name="action"
              value="status"
              className={button}
              disabled={pending || selected === 0}
            >
              Set status
            </button>
            <label className="sr-only" htmlFor="bulk-reason">
              Reason for ignoring
            </label>
            <input
              id="bulk-reason"
              name="reason"
              placeholder="Reason to ignore"
              className={`${control} w-40`}
            />
            <button
              type="submit"
              name="action"
              value="ignore"
              className={button}
              disabled={pending || selected === 0}
            >
              Ignore…
            </button>
            <label className="sr-only" htmlFor="bulk-due">
              Due date
            </label>
            <input id="bulk-due" name="dueDate" type="date" className={control} />
            <button
              type="submit"
              name="action"
              value="due"
              className={button}
              disabled={pending || selected === 0}
            >
              Due date
            </button>
          </>
        )}
        <a href={exportHref} className={`${button} text-ink no-underline hover:text-ink`}>
          Export CSV
        </a>
        <a
          href={exportHref.replace("/export", "/export/xlsx")}
          className={`${button} text-ink no-underline hover:text-ink`}
        >
          Excel
        </a>
      </div>
      {result && (
        <p
          role="status"
          className={`m-0 rounded-lg p-3 text-sm ${result.ok ? "bg-pass-bg text-pass" : "bg-crit-bg text-crit"}`}
        >
          {result.message}
        </p>
      )}
      {children}
    </form>
  );
}
