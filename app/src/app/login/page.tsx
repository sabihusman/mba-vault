// The login page (/vault/login). A Server Component shell: if the visitor already
// has a valid session, bounce them to the app; otherwise render the client form.
// This route is public by design — PR4's proxy gate allowlists it.
// ?next= (validated, app-internal only) says where to land after sign-in — the
// proxy sets it when it bounces a page request here, so e.g. the OAuth consent
// page resumes after login instead of dumping you at the root.
import { redirect } from "next/navigation";
import { getSession, isLoggedIn } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/next-param";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(next);
  const session = await getSession();
  if (isLoggedIn(session)) {
    redirect(nextPath);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="font-serif text-[27px] font-bold tracking-tight text-tx">MBA-Vault</h1>
        <p className="text-sm text-tx2">Sign in to continue.</p>
      </div>
      <LoginForm nextPath={nextPath} />
    </main>
  );
}
