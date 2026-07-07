"use client";

// Manual light/dark toggle (design handoff §5). Flips the `.dark` class on <html>
// and persists the choice in localStorage('mv-theme'); the no-flash inline script
// in layout.tsx reads that key (falling back to the OS preference) on first paint,
// so this only handles explicit user toggles. A mounted guard keeps the icon from
// flashing the wrong glyph during hydration.
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [state, setState] = useState({ mounted: false, dark: false });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the real theme from the DOM after mount
    setState({ mounted: true, dark: document.documentElement.classList.contains("dark") });
  }, []);

  function toggle() {
    const next = !state.dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("mv-theme", next ? "dark" : "light");
    } catch {
      /* storage disabled — the class still applies for this session */
    }
    setState({ mounted: true, dark: next });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      title="Toggle light / dark"
      className="rounded-lg border border-bd px-2 py-1.5 text-[14px] text-tx2 hover:bg-hdr hover:text-tx"
    >
      <span aria-hidden>{state.mounted && state.dark ? "☀" : "☾"}</span>
    </button>
  );
}
