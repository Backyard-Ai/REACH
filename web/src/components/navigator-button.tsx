"use client";

import Script from "next/script";

declare global {
  interface Window {
    CustomGPT?: { init: (opts: Record<string, string>) => void };
  }
}

/** CustomGPT floating Navigator button — loads on every page. */
export function NavigatorButton() {
  return (
    <Script
      src="https://cdn.customgpt.ai/js/chat.js"
      strategy="afterInteractive"
      onLoad={() => {
        window.CustomGPT?.init({
          p_id: "98395",
          p_key: "9c61f735888610586c49282a97758dce",
        });
      }}
    />
  );
}
