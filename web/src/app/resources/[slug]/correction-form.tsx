"use client";

import { useEffect, useRef, useState } from "react";

type FormState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

interface TurnstileOptions {
  sitekey: string;
  theme?: string;
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
}

interface TurnstileApi {
  render: (el: HTMLElement, opts: TurnstileOptions) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Inlined at build time: absent key = no widget, and the API route
// skips verification when the secret is absent — dev keeps working.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

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
  const [token, setToken] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;

    const renderWidget = () => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        theme: "light",
        callback: (t) => setToken(t),
        "expired-callback": () => setToken(""),
        "error-callback": () => setToken(""),
      });
    };

    if (window.turnstile) {
      renderWidget();
      return;
    }

    let script = document.querySelector<HTMLScriptElement>(
      "script[data-reach-turnstile]",
    );
    if (!script) {
      script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.reachTurnstile = "true";
      document.head.appendChild(script);
    }
    script.addEventListener("load", renderWidget, { once: true });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, []);

  const resetWidget = () => {
    setToken("");
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const details = String(new FormData(form).get("details") ?? "").trim();
    const submitterEmail = String(
      new FormData(form).get("submitterEmail") ?? "",
    ).trim();

    if (SITE_KEY && !token) {
      setState({
        status: "error",
        message: "Please complete the verification and try again.",
      });
      return;
    }

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
          turnstile_token: token || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      setState({
        status: "ok",
        message: "Thank you — a person will review this listing.",
      });
      form.reset();
      resetWidget();
    } catch (e) {
      setState({
        status: "error",
        message:
          e instanceof Error && e.message && !e.message.startsWith("Request failed")
            ? e.message
            : "The report could not be sent right now. Please try again in a moment.",
      });
      resetWidget();
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
          className="w-full px-3 py-2 rounded-md text-base text-text-body bg-surface-raise border border-[#C9C9CE] focus:border-brand-action"
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
          autoComplete="email"
          className="w-full min-h-11 px-3 rounded-md text-base text-text-body bg-surface-raise border border-[#C9C9CE] focus:border-brand-action"
        />
      </div>
      {SITE_KEY && (
        <div
          ref={containerRef}
          aria-label="Verification"
          className="min-h-16"
        />
      )}
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
