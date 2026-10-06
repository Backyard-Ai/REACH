"use client";

import { useState } from "react";

type FormState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

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
  const [state, setState] = useState<FormState>({ status: "idle" });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const details = String(new FormData(form).get("details") ?? "").trim();
    const submitterEmail = String(
      new FormData(form).get("submitterEmail") ?? "",
    ).trim();

    setState({ status: "sending" });
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "correction",
          organisation_id: organisationId,
          region_id: regionId,
          payload: {
            resource_slug: resourceSlug,
            resource_name: resourceName,
            details,
            submitted_at: new Date().toISOString(),
          },
          submitter_email: submitterEmail || undefined,
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setState({
        status: "ok",
        message: "Thank you — a person will review this listing.",
      });
      form.reset();
    } catch {
      setState({
        status: "error",
        message:
          "The report could not be sent right now. Please try again in a moment.",
      });
    }
  }

  if (state.status === "ok") {
    return (
      <p role="status" className="bg-surface rounded-md p-4 text-base m-0">
        {state.message}
      </p>
    );
  }

  const busy = state.status === "sending";

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
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
          minLength={3}
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
      {state.status === "error" && (
        <p role="alert" className="text-base font-semibold text-crisis m-0">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="justify-self-start min-h-11 px-5 rounded-md bg-brand-primary text-white font-headline font-bold hover:bg-brand-primary-hover disabled:opacity-60"
      >
        {busy ? "Sending…" : "Send report"}
      </button>
    </form>
  );
}
