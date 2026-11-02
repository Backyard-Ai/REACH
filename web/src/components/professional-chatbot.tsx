"use client";

import { useEffect, useRef } from "react";

/**
 * Professional-mode CustomGPT chatbot, embedded on the For Professionals
 * page. The script uses non-standard attributes (div_id, p_id, p_key)
 * that React won't render, so we create the element programmatically.
 */
export function ProfessionalChatbot() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || container.querySelector("script")) return;

    const script = document.createElement("script");
    script.src = "https://cdn.customgpt.ai/js/embed.js";
    script.defer = true;
    script.setAttribute("div_id", "customgpt_chat");
    script.setAttribute("p_id", "98394");
    script.setAttribute("p_key", "8b760648f8e66a32d9a99287181a34a8");
    container.appendChild(script);
  }, []);

  return (
    <div className="grid gap-4">
      <div
        id="customgpt_chat"
        ref={containerRef}
        className="min-h-[500px] rounded-lg border border-[#C9C9CE] bg-surface-raise overflow-hidden"
        aria-label="Professional Navigator chatbot"
      />
    </div>
  );
}
