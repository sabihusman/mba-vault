// The login page (/vault/login). A Server Component shell: if the visitor already
// has a valid session, bounce them to the app; otherwise render the client form.
// This route is public by design — PR4's proxy gate allowlists it.
import { redirect } from "next/navigation";
import { getSession, isLoggedIn } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getSession();
  if (isLoggedIn(session)) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">MBA-Vault</h1>
        <p className="text-sm text-neutral-500">Sign in to continue.</p>
      </div>
      <LoginForm />
    </main>
  );
}
