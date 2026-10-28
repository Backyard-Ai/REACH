"use client";

import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------- types ----

type FormState = {
  // step 1: about
  name: string;
  description: string;
  website: string;
  phone: string;
  email: string;
  // step 2: location
  hasAddress: boolean;
  street: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  countiesServed: string[];
  // step 3: services
  categories: string[];
  populations: string[];
  payment: string[];
  access: string[];
  languages: string[];
  // step 4: submitter
  submitterName: string;
  submitterEmail: string;
  submitterRole: string;
};

const INITIAL: FormState = {
  name: "", description: "", website: "", phone: "", email: "",
  hasAddress: true, street: "", city: "", state: "TN", zip: "", county: "", countiesServed: [],
  categories: [], populations: [], payment: [], access: [], languages: [],
  submitterName: "", submitterEmail: "", submitterRole: "",
};

const STEPS = ["About", "Location", "Services", "Review"] as const;

export type LookupData = {
  categories: { slug: string; name: string }[];
  counties: { fips: string; name: string }[];
  attributes: Record<string, { slug: string; label: string }[]>;
};

// ------------------------------------------------------------- component ---

export function SubmissionWizard({ lookups }: { lookups: LookupData }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"idle" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleIn = (key: "categories" | "populations" | "payment" | "access" | "languages" | "countiesServed", value: string) =>
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));

  const stepValid = (n: number): boolean => {
    if (n === 0) return form.name.trim().length >= 3;
    if (n === 1) return !form.hasAddress || (form.street.trim().length >= 3 && form.city.trim().length >= 2);
    if (n === 2) return true; // categories are optional at this stage
    return true;
  };

  const next = () => {
    if (!stepValid(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  // focus management: move to the step heading when the step changes
  useEffect(() => {
    if (stepHeadingRef.current) {
      stepHeadingRef.current.focus();
    }
  }, [step]);

  // Turnstile
  useEffect(() => {
    const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!SITE_KEY || step !== STEPS.length - 1) return;
    let cancelled = false;
    const container = containerRef.current?.querySelector("[data-turnstile-slot]");
    if (!container || container.childElementCount > 0) return;
    const render = () => {
      if (cancelled || !container || !window.turnstile) return;
      window.turnstile.render(container as HTMLElement, {
        sitekey: SITE_KEY,
        theme: "light",
        callback: (t: string) => setToken(t),
        "expired-callback": () => setToken(""),
      });
    };
    if (window.turnstile) { render(); return; }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", render, { once: true });
    document.head.appendChild(script);
    return () => { cancelled = true; };
  }, [step]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    setResult("idle");
    setErrorMsg("");
    try {
      const payload = buildPayload(form);
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "new_listing",
          payload,
          submitter_name: form.submitterName || undefined,
          submitter_email: form.submitterEmail || undefined,
          submitter_org_role: form.submitterRole || undefined,
          turnstile_token: token || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      setResult("ok");
    } catch (err) {
      setResult("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setToken("");
      if (window.turnstile) {
        const widget = containerRef.current?.querySelector("[data-turnstile-slot] > div");
        if (widget?.id) window.turnstile.reset(widget.id);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (result === "ok") {
    return (
      <div className="bg-surface-raise rounded-lg border border-surface p-6 text-center" role="status">
        <p className="font-headline font-bold text-2xl text-brand-primary mt-0 mb-2">
          Thank you!
        </p>
        <p className="text-base m-0">
          Your listing has been submitted for review. A person will look at it
          before it appears in the directory — this usually takes a few
          business days.
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="grid gap-6">
      {/* progress */}
      <nav aria-label="Form progress">
        <ol className="list-none p-0 m-0 flex flex-wrap gap-2">
          {STEPS.map((label, i) => (
            <li key={label}>
              <span
                aria-current={i === step ? "step" : undefined}
                className={`flex items-center min-h-11 px-4 rounded-full text-sm font-semibold ${
                  i === step
                    ? "bg-brand-primary text-white"
                    : i < step
                      ? "bg-brand-action text-white"
                      : "bg-surface text-text-body/60"
                }`}
              >
                {i + 1}. {label}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      <form onSubmit={handleSubmit} className="bg-surface-raise rounded-lg border border-surface p-5 sm:p-6 grid gap-5">
        <div aria-live="polite">
          {step === 0 && (
            <StepAbout form={form} set={set} headingRef={stepHeadingRef} />
          )}
          {step === 1 && (
            <StepLocation form={form} set={set} lookups={lookups} toggleIn={toggleIn} headingRef={stepHeadingRef} />
          )}
          {step === 2 && (
            <StepServices form={form} lookups={lookups} toggleIn={toggleIn} headingRef={stepHeadingRef} />
          )}
          {step === 3 && (
            <StepReview form={form} set={set} headingRef={stepHeadingRef} />
          )}
        </div>

        {result === "error" && (
          <p role="alert" className="text-base font-semibold text-crisis m-0">
            {errorMsg || "The submission could not be sent. Please try again."}
          </p>
        )}

        {/* turnstile slot (rendered by effect on the last step) */}
        {step === STEPS.length - 1 && (
          <div data-turnstile-slot className="min-h-16" aria-label="Verification" />
        )}

        {/* nav */}
        <div className="flex flex-wrap gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={back}
              className="min-h-11 px-5 rounded-md border border-[#C9C9CE] bg-surface-raise text-text-body font-headline font-bold hover:border-brand-action"
            >
              ← Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={next}
              disabled={!stepValid(step)}
              className="min-h-11 px-5 rounded-md bg-brand-action text-white font-headline font-bold hover:bg-brand-action-hover disabled:opacity-50"
            >
              Next →
            </button>
          ) : (
            <button
              type="submit"
              disabled={submitting}
              className="min-h-11 px-5 rounded-md bg-brand-primary text-white font-headline font-bold hover:bg-brand-primary-hover disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit listing"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}


function ChipGroup({
  title, items, selected, onToggle,
}: {
  title: string;
  items: { slug: string; label: string }[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div>
      <p className={labelCls}>{title}</p>
      <ul className="list-none p-0 m-0 flex flex-wrap gap-2">
        {items.map((item) => {
          const active = selected.includes(item.label);
          return (
            <li key={item.slug}>
              <button
                type="button"
                onClick={() => onToggle(item.label)}
                aria-pressed={active}
                className={`min-h-11 px-4 rounded-full text-sm font-semibold ${
                  active ? "bg-brand-action text-white" : "bg-surface text-text-body border border-[#C9C9CE] hover:border-brand-action"
                }`}
              >
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="grid sm:grid-cols-[180px_1fr] gap-1 sm:gap-3 py-1 border-b border-surface last:border-0">
      <dt className="text-sm font-semibold text-text-body/70">{label}</dt>
      <dd className="m-0 text-base">{value || <span className="text-text-body/50">—</span>}</dd>
    </div>
  );
}

// ------------------------------------------------------------ step views ---

const inputCls =
  "w-full min-h-11 px-3 rounded-md text-base text-text-body bg-surface-raise border border-[#C9C9CE] focus:border-brand-action";
const labelCls = "block font-semibold text-brand-primary mb-1";

function StepAbout({
  form, set, headingRef,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <fieldset className="grid gap-4 border-0 p-0 m-0">
      <legend className="sr-only">About the organisation</legend>
      <h3 ref={headingRef} tabIndex={-1} className="font-headline font-bold text-xl text-brand-primary m-0 outline-none">
        Tell us about the organisation
      </h3>
      <div>
        <label htmlFor="sw-name" className={labelCls}>Name *</label>
        <input id="sw-name" type="text" required minLength={3} value={form.name}
          onChange={(e) => set("name", e.target.value)} className={inputCls}
          placeholder="Organisation or programme name" />
      </div>
      <div>
        <label htmlFor="sw-desc" className={labelCls}>What does it do?</label>
        <textarea id="sw-desc" rows={4} value={form.description}
          onChange={(e) => set("description", e.target.value)} className={inputCls}
          placeholder="A short description in plain language — what someone would find when they walk in or call" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sw-phone" className={labelCls}>Phone</label>
          <input id="sw-phone" type="tel" autoComplete="tel" value={form.phone}
            onChange={(e) => set("phone", e.target.value)} className={inputCls}
            placeholder="(423) 555-0100" />
        </div>
        <div>
          <label htmlFor="sw-email" className={labelCls}>Email</label>
          <input id="sw-email" type="email" autoComplete="email" value={form.email}
            onChange={(e) => set("email", e.target.value)} className={inputCls}
            placeholder="info@example.org" />
        </div>
      </div>
      <div>
        <label htmlFor="sw-website" className={labelCls}>Website</label>
        <input id="sw-website" type="url" autoComplete="url" value={form.website}
          onChange={(e) => set("website", e.target.value)} className={inputCls}
          placeholder="https://…" />
      </div>
    </fieldset>
  );
}

function StepLocation({
  form, set, lookups, toggleIn, headingRef,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  lookups: LookupData;
  toggleIn: (key: "countiesServed", value: string) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <fieldset className="grid gap-4 border-0 p-0 m-0">
      <legend className="sr-only">Location and coverage</legend>
      <h3 ref={headingRef} tabIndex={-1} className="font-headline font-bold text-xl text-brand-primary m-0 outline-none">
        Where is it?
      </h3>
      <div>
        <label className="flex items-center min-h-11 gap-3 cursor-pointer">
          <input type="checkbox" checked={form.hasAddress}
            onChange={(e) => set("hasAddress", e.target.checked)}
            className="w-5 h-5 accent-[#177A8C]" />
          <span className="text-base">It has a walk-in address</span>
        </label>
      </div>
      {form.hasAddress && (
        <div className="grid gap-4">
          <div>
            <label htmlFor="sw-street" className={labelCls}>Street address</label>
            <input id="sw-street" type="text" value={form.street}
              onChange={(e) => set("street", e.target.value)} className={inputCls}
              placeholder="123 Main Street" required minLength={3} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="sw-city" className={labelCls}>City</label>
              <input id="sw-city" type="text" value={form.city}
                onChange={(e) => set("city", e.target.value)} className={inputCls}
                placeholder="Johnson City" required minLength={2} />
            </div>
            <div>
              <label htmlFor="sw-zip" className={labelCls}>ZIP</label>
              <input id="sw-zip" type="text" value={form.zip}
                onChange={(e) => set("zip", e.target.value)} className={inputCls}
                placeholder="37601" />
            </div>
            <div>
              <label htmlFor="sw-county" className={labelCls}>County</label>
              <select id="sw-county" value={form.county}
                onChange={(e) => set("county", e.target.value)} className={`select-chevron ${inputCls}`}>
                <option value="">Select…</option>
                {lookups.counties.map((c) => (
                  <option key={c.fips} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
      <div>
        <p className={labelCls}>Which counties does it serve?</p>
        <p className="text-sm text-text-body/70 mt-0 mb-2">
          Select all that apply — include counties with no walk-in office.
        </p>
        <ul className="list-none p-0 m-0 flex flex-wrap gap-2">
          {lookups.counties.map((c) => {
            const active = form.countiesServed.includes(c.name);
            return (
              <li key={c.fips}>
                <button
                  type="button"
                  onClick={() => toggleIn("countiesServed", c.name)}
                  aria-pressed={active}
                  className={`min-h-11 px-4 rounded-full text-sm font-semibold ${
                    active ? "bg-brand-action text-white" : "bg-surface text-text-body border border-[#C9C9CE] hover:border-brand-action"
                  }`}
                >
                  {c.name}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </fieldset>
  );
}

function StepServices({
  form, lookups, toggleIn, headingRef,
}: {
  form: FormState;
  lookups: LookupData;
  toggleIn: (key: "categories" | "populations" | "payment" | "access" | "languages", value: string) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <fieldset className="grid gap-5 border-0 p-0 m-0">
      <legend className="sr-only">Services and accessibility</legend>
      <h3 ref={headingRef} tabIndex={-1} className="font-headline font-bold text-xl text-brand-primary m-0 outline-none">
        What services does it provide?
      </h3>
      <ChipGroup
        title="Categories (select all that apply)"
        items={lookups.categories.map((c) => ({ slug: c.slug, label: c.name }))}
        selected={form.categories}
        onToggle={(v) => toggleIn("categories", v)}
      />
      <ChipGroup
        title="Who does it serve?"
        items={lookups.attributes.population ?? []}
        selected={form.populations}
        onToggle={(v) => toggleIn("populations", v)}
      />
      <ChipGroup
        title="Payment accepted"
        items={lookups.attributes.payment ?? []}
        selected={form.payment}
        onToggle={(v) => toggleIn("payment", v)}
      />
      <ChipGroup
        title="Accessibility"
        items={lookups.attributes.access ?? []}
        selected={form.access}
        onToggle={(v) => toggleIn("access", v)}
      />
      <ChipGroup
        title="Languages"
        items={lookups.attributes.language ?? []}
        selected={form.languages}
        onToggle={(v) => toggleIn("languages", v)}
      />
    </fieldset>
  );
}

function StepReview({
  form, set, headingRef,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <fieldset className="grid gap-4 border-0 p-0 m-0">
      <legend className="sr-only">Review and submit</legend>
      <h3 ref={headingRef} tabIndex={-1} className="font-headline font-bold text-xl text-brand-primary m-0 outline-none">
        Review your listing
      </h3>
      <dl className="bg-surface rounded-lg p-4 m-0">
        <ReviewRow label="Name" value={form.name} />
        <ReviewRow label="Description" value={form.description} />
        <ReviewRow label="Phone" value={form.phone} />
        <ReviewRow label="Email" value={form.email} />
        <ReviewRow label="Website" value={form.website} />
        {form.hasAddress ? (
          <>
            <ReviewRow label="Address" value={`${form.street}, ${form.city}${form.zip ? ` ${form.zip}` : ""}`} />
            {form.county && <ReviewRow label="County" value={form.county} />}
          </>
        ) : (
          <ReviewRow label="Address" value="No walk-in address" />
        )}
        {form.countiesServed.length > 0 && (
          <ReviewRow label="Counties served" value={form.countiesServed.join(", ")} />
        )}
        {form.categories.length > 0 && (
          <ReviewRow label="Categories" value={form.categories.join(", ")} />
        )}
        {form.populations.length > 0 && (
          <ReviewRow label="Populations" value={form.populations.join(", ")} />
        )}
        {form.payment.length > 0 && (
          <ReviewRow label="Payment" value={form.payment.join(", ")} />
        )}
        {form.access.length > 0 && (
          <ReviewRow label="Accessibility" value={form.access.join(", ")} />
        )}
        {form.languages.length > 0 && (
          <ReviewRow label="Languages" value={form.languages.join(", ")} />
        )}
      </dl>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sw-subname" className={labelCls}>Your name (optional)</label>
          <input id="sw-subname" type="text" autoComplete="name" value={form.submitterName}
            onChange={(e) => set("submitterName", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="sw-subemail" className={labelCls}>Your email (optional)</label>
          <input id="sw-subemail" type="email" autoComplete="email" value={form.submitterEmail}
            onChange={(e) => set("submitterEmail", e.target.value)} className={inputCls} />
        </div>
      </div>
      <div>
        <label htmlFor="sw-subrole" className={labelCls}>Your role (optional)</label>
        <input id="sw-subrole" type="text" value={form.submitterRole}
          onChange={(e) => set("submitterRole", e.target.value)} className={inputCls}
          placeholder="e.g. Director, Peer Specialist, Volunteer" />
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------- payload --

function buildPayload(form: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: form.name,
    description: form.description || undefined,
    website: form.website || undefined,
    phone: form.phone || undefined,
    email: form.email || undefined,
  };

  if (form.hasAddress) {
    payload.address = {
      street: form.street,
      city: form.city,
      state: form.state,
      zip: form.zip || undefined,
      county: form.county || undefined,
    };
  } else {
    payload.address = null;
  }

  if (form.countiesServed.length > 0) {
    payload.counties_served = form.countiesServed;
  }

  if (form.categories.length > 0) payload.categories = form.categories;
  if (form.populations.length > 0) payload.populations = form.populations;
  if (form.payment.length > 0) payload.payment = form.payment;
  if (form.access.length > 0) payload.accessibility = form.access;
  if (form.languages.length > 0) payload.languages = form.languages;

  payload.submitted_at = new Date().toISOString();

  return payload;
}
