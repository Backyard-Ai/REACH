"use client";

import { useState } from "react";

/**
 * Deterministic copy-results: receives the pre-formatted export text
 * from the server, copies it to the clipboard verbatim. No client-side
 * formatting — the export is exactly the filtered set the server rendered.
 */
export function CopyResultsButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className="min-h-11 px-5 rounded-md bg-brand-action text-white font-headline font-bold hover:bg-brand-action-hover"
      >
        {state === "copied" ? "Copied ✓" : state === "error" ? "Copy failed" : "Copy results"}
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="min-h-11 px-5 rounded-md border border-[#C9C9CE] bg-surface-raise text-text-body font-headline font-bold hover:border-brand-action"
      >
        Print
      </button>
      {state === "error" && (
        <p role="alert" className="text-sm text-crisis m-0">
          Clipboard not available — select the text manually.
        </p>
      )}
    </div>
  );
}
