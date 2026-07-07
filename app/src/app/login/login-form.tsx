"use client";

// The login form. Collects username + password + 6-digit TOTP and POSTs them as
// JSON to the login route. It shows a single generic error for any failure and a
// distinct notice for rate-limiting. On success it navigates to the app root.
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

// basePath is a fixed project constant ("/vault", set in next.config). fetch() is
// NOT basePath-aware (unlike next/navigation's router), so we spell the full path.
const LOGIN_ENDPOINT = "/vault/api/login";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      username: String(form.get("username") ?? ""),
      password: String(form.get("password") ?? ""),
      token: String(form.get("token") ?? ""),
    };

    try {
      const res = await fetch(LOGIN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        // router is basePath-aware, so "/" resolves to /vault. replace() so the
        // login page isn't left in history behind the authenticated app.
        router.replace("/");
        return;
      }

      const data: unknown = await res.json().catch(() => null);
      const message =
        data && typeof data === "object" && "error" in data && typeof data.error === "string"
          ? data.error
          : "Something went wrong. Please try again.";
      setError(message);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-tx2">
        Username
        <input
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          required
          className="rounded-xl border border-bd bg-card px-3 py-2 text-tx outline-none focus:border-acc"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-tx2">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-xl border border-bd bg-card px-3 py-2 text-tx outline-none focus:border-acc"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-tx2">
        Authenticator code
        <input
          name="token"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          placeholder="123456"
          required
          className="rounded-xl border border-bd bg-card px-3 py-2 tracking-widest text-tx outline-none focus:border-acc"
        />
      </label>

      {error ? (
        <p role="alert" className="text-sm text-err">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-acc px-3 py-2 font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
