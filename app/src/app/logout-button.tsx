"use client";

// Minimal sign-out control: POSTs to the logout endpoint, then sends the user to
// the login page. Uses window.location rather than the router so the whole app
// (and any cached RSC payload) is discarded on the way out.
import { useState } from "react";

const LOGOUT_ENDPOINT = "/vault/api/logout";
const LOGIN_PATH = "/vault/login";

export function LogoutButton() {
  const [pending, setPending] = useState(false);

  async function onClick(): Promise<void> {
    setPending(true);
    try {
      await fetch(LOGOUT_ENDPOINT, { method: "POST" });
    } finally {
      window.location.assign(LOGIN_PATH);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded border border-neutral-300 px-3 py-1 text-sm disabled:opacity-60"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
