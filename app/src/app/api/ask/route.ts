// POST /vault/api/ask — retrieve-then-generate, streamed as NDJSON. Gated by the
// proxy (not in isPublicPath), rate-limited, and length-capped. The response is a
// stream of JSON lines: first a {type:"citations"} line, then {type:"text"} lines,
// and a {type:"error"} line if generation fails mid-stream.
import { clientIp } from "@/lib/auth/request-ip";
import { getIndex } from "@/lib/ask/index-store";
import { createGeminiClient } from "@/lib/ask/gemini";
import { answerQuestion, MAX_QUESTION_CHARS, type AskDeps } from "@/lib/ask/answer";
import { consumeAsk } from "@/lib/ask/ratelimit";

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  const question = readQuestion(body);
  if (question === null) {
    return Response.json({ error: "A non-empty question is required." }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return Response.json(
      { error: `Question too long (max ${MAX_QUESTION_CHARS} characters).` },
      { status: 400 },
    );
  }

  const limit = await consumeAsk(clientIp(request));
  if (limit.blocked) {
    return Response.json(
      { error: "Too many questions. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Ask is not configured (missing GEMINI_API_KEY)." }, { status: 503 });
  }

  const client = createGeminiClient(apiKey);
  const deps: AskDeps = {
    getIndex,
    embedQuery: (q) => client.embedQuery(q),
    generate: (system, prompt) => client.generate(system, prompt),
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of answerQuestion(deps, question)) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "answer failed";
        controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message }) + "\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Extract a trimmed, non-empty question string from the request body. */
function readQuestion(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const question = (body as Record<string, unknown>).question;
  if (typeof question !== "string") return null;
  const trimmed = question.trim();
  return trimmed.length > 0 ? trimmed : null;
}
