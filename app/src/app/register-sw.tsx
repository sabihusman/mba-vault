"use client";

import { useEffect } from "react";

// Registers the service worker (public/sw.js) once the page has loaded.
// Rendered invisibly from the root layout. The SW gives us the offline browse shell;
// the Ask feature still needs the network and is never served from cache.
export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      // Served at /vault/sw.js (basePath); its default scope is therefore /vault/,
      // so it can never intercept the study guide at / or the /wellmark app.
      navigator.serviceWorker
        .register("/vault/sw.js", { scope: "/vault/", updateViaCache: "none" })
        .catch((err) => console.error("Service worker registration failed:", err));
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
