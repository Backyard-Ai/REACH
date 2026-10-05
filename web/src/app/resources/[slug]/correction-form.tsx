"use client";

import { useActionState } from "react";
import {
  submitCorrectionAction,
  type CorrectionState,
} from "./actions";

const INITIAL: CorrectionState = { status: "idle" };

export function CorrectionForm({
  regionId,
  organisationId,
  resourceSlug,
  resourceName,
}: {
  regionId: number;
  organisationId: number;
  resourceSlug: string;
  resourceName: string;
}) {
  const [state, action, pending] = useActionState(
    submitCorrectionAction,
    INITIAL,
  );

  if (state.status === "ok") {
    return (
      <p role="status" className="bg-surface rounded-md p-4 text-base m-0">
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="regionId" value={regionId} />
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="resourceSlug" value={resourceSlug} />
      <input type="hidden" name="resourceName" value={resourceName} />
      <div>
        <label
          htmlFor="correction-details"
          className="block font-semibold text-brand-primary mb-1"
        >
          What&rsquo;s wrong or missing?
        </label>
        <textarea
          id="correction-details"
          name="details"
          rows={3}
          required
          maxLength={2000}
          placeholder="For example: the phone number changed, or the hours are out of date."
          className="w-full px-3 py-2 rounded-md text-base text-text-body bg-surface-raise border-2 border-transparent focus:border-brand-action"
        />
      </div>
      <div>
        <label
          htmlFor="correction-email"
          className="block font-semibold text-brand-primary mb-1"
        >
          Your email (optional — only if we can follow up)
        </label>
        <input
          id="correction-email"
          name="submitterEmail"
          type="email"
          className="w-full min-h-11 px-3 rounded-md text-base text-text-body bg-surface-raise border-2 border-transparent focus:border-brand-action"
        />
      </div>
      {state.status === "error" && state.message && (
        <p role="alert" className="text-base font-semibold text-crisis m-0">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="justify-self-start min-h-11 px-5 rounded-md bg-brand-primary text-white font-headline font-bold hover:bg-brand-primary-hover disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send report"}
      </button>
    </form>
  );
}
