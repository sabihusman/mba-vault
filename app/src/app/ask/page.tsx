// /vault/ask — the RAG question surface. Gated by the proxy (only the
// authenticated user reaches it). The page is a thin server shell; all the
// streaming and state handling lives in the client thread. A `?q=` param lets
// Browse's "Ask the vault" hand a query straight into an asked question.
import type { Metadata } from "next";
import { AskThread } from "./ask-thread";

export const metadata: Metadata = { title: "Ask" };

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const initialQuestion = typeof q === "string" ? q.trim() : "";

  return (
    <main className="mx-auto w-full max-w-[1020px] flex-1 px-5 py-6 font-ui text-tx">
      <AskThread initialQuestion={initialQuestion} />
    </main>
  );
}
