"use client";

// The Ask thread: ask a question, get a streamed grounded answer, then ask
// follow-ups in the same thread without resetting. Prior turns stay on screen and
// the last few are sent back as context so references like "what about X?" resolve
// (the server caps how much history it actually uses). Every state from the design
// handoff §4 lives here — empty, loading, answer, not-covered, failure.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  splitNdjson,
  parseEvent,
  isNotCovered,
  type Citation,
  type Loc,
} from "@/lib/ask/stream";

// fetch/anchor hrefs aren't basePath-aware (unlike next/link), so spell /vault.
const ASK_URL = "/vault/api/ask";
const FILE_BASE = "/vault/api/files";
const RECENT_KEY = "mv-recent-questions";
const MAX_RECENT = 6;
// Mirror of the server's MAX_HISTORY_TURNS: don't send more than we know it uses.
const MAX_CLIENT_HISTORY = 3;

const SUGGESTIONS = [
  "What is customer acquisition cost and how is it calculated?",
  "Explain the four Ps of the marketing mix.",
  "What makes a good product roadmap?",
];

type TurnStatus = "loading" | "streaming" | "done" | "error";

interface Turn {
  id: number;
  question: string;
  citations: Citation[];
  answer: string;
  status: TurnStatus;
  errorMsg: string;
}

export function AskThread({ initialQuestion }: { initialQuestion: string }) {
  const [input, setInput] = useState(initialQuestion);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const nextIdRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  // Snapshot of turns for building history at ask-time without stale closures.
  const turnsRef = useRef<Turn[]>(turns);
  turnsRef.current = turns;

  const busy = turns.some((t) => t.status === "loading" || t.status === "streaming");

  // Load recent questions on the client only (avoids an SSR hydration mismatch —
  // the server has no localStorage, so the list must populate after mount).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from localStorage is inherently a post-mount effect
      if (raw) setRecent(JSON.parse(raw) as string[]);
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  const rememberQuestion = useCallback((question: string) => {
    setRecent((prev) => {
      const next = [question, ...prev.filter((q) => q !== question)].slice(0, MAX_RECENT);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota / disabled storage */
      }
      return next;
    });
  }, []);

  const updateTurn = useCallback((id: number, patch: (t: Turn) => Partial<Turn>) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch(t) } : t)));
  }, []);

  // Stream one turn to completion, updating it in place by id.
  const runTurn = useCallback(
    async (id: number, question: string, history: { question: string; answer: string }[]) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      updateTurn(id, () => ({ status: "loading", answer: "", citations: [], errorMsg: "" }));

      try {
        const res = await fetch(ASK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, history }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const message = await readErrorMessage(res);
          updateTurn(id, () => ({ status: "error", errorMsg: message }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { lines, rest } = splitNdjson(buffer);
          buffer = rest;
          for (const line of lines) {
            const event = parseEvent(line);
            if (!event) continue;
            if (event.type === "citations") {
              updateTurn(id, () => ({ citations: event.citations }));
            } else if (event.type === "text") {
              updateTurn(id, (t) => ({ status: "streaming", answer: t.answer + event.text }));
            } else if (event.type === "error") {
              updateTurn(id, () => ({ status: "error", errorMsg: "Couldn’t get an answer. Please try again." }));
              return;
            }
          }
        }
        updateTurn(id, () => ({ status: "done" }));
      } catch {
        if (controller.signal.aborted) return; // superseded by a newer question
        updateTurn(id, () => ({
          status: "error",
          errorMsg: "Couldn’t reach the vault. Check your connection and try again.",
        }));
      }
    },
    [updateTurn],
  );

  // Prior completed turns (before `beforeId`, or all) → capped follow-up context.
  const buildHistory = useCallback((beforeId?: number) => {
    const all = turnsRef.current;
    const upto = beforeId === undefined ? all : all.slice(0, all.findIndex((t) => t.id === beforeId));
    return upto
      .filter((t) => t.status === "done")
      .slice(-MAX_CLIENT_HISTORY)
      .map((t) => ({ question: t.question, answer: t.answer }));
  }, []);

  const ask = useCallback(
    (question: string) => {
      const trimmed = question.trim();
      if (!trimmed) return;
      const history = buildHistory();
      const id = nextIdRef.current++;
      setTurns((prev) => [
        ...prev,
        { id, question: trimmed, citations: [], answer: "", status: "loading", errorMsg: "" },
      ]);
      rememberQuestion(trimmed);
      setInput("");
      void runTurn(id, trimmed, history);
    },
    [buildHistory, rememberQuestion, runTurn],
  );

  const retry = useCallback(
    (id: number) => {
      const turn = turnsRef.current.find((t) => t.id === id);
      if (turn) void runTurn(id, turn.question, buildHistory(id));
    },
    [buildHistory, runTurn],
  );

  // Auto-ask a query handed in from Browse (?q=…), once.
  const didAutoAsk = useRef(false);
  useEffect(() => {
    if (initialQuestion && !didAutoAsk.current) {
      didAutoAsk.current = true;
      ask(initialQuestion);
    }
  }, [initialQuestion, ask]);

  // Keep the newest turn + input in view as the thread grows.
  useEffect(() => {
    if (turns.length > 0) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    ask(input);
  };

  const empty = turns.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {empty && <AskInput value={input} onChange={setInput} onSubmit={onSubmit} busy={busy} />}

      {empty ? (
        <EmptyState recent={recent} onPick={ask} />
      ) : (
        <>
          <div className="flex flex-col gap-6">
            {turns.map((turn) => (
              <TurnView key={turn.id} turn={turn} onRetry={() => retry(turn.id)} />
            ))}
          </div>
          <AskInput value={input} onChange={setInput} onSubmit={onSubmit} busy={busy} />
          <div ref={bottomRef} />
        </>
      )}
    </div>
  );
}

/* ---------- turn ---------- */

function TurnView({ turn, onRetry }: { turn: Turn; onRetry: () => void }) {
  const notCovered = turn.status === "done" && isNotCovered(turn.answer);
  return (
    <section className="flex flex-col gap-4" aria-live="polite">
      <QuestionBubble text={turn.question} />
      {turn.status === "loading" && <LoadingCard />}
      {(turn.status === "streaming" || turn.status === "done") && !notCovered && (
        <AnswerCard text={turn.answer} citations={turn.citations} streaming={turn.status === "streaming"} />
      )}
      {notCovered && <NotCoveredCard />}
      {turn.status === "error" && <ErrorCard message={turn.errorMsg} onRetry={onRetry} />}
    </section>
  );
}

/* ---------- input ---------- */

function AskInput({
  value,
  onChange,
  onSubmit,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  busy: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <div className="flex flex-1 items-center gap-2 rounded-xl border border-bd bg-card px-4 py-3 shadow-sm focus-within:border-acc">
        <span aria-hidden className="text-mut">◍</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ask a follow-up…"
          aria-label="Ask a question"
          className="flex-1 bg-transparent text-[14px] text-tx outline-none placeholder:text-mut"
        />
      </div>
      <button
        type="submit"
        disabled={busy || value.trim().length === 0}
        className="rounded-xl bg-acc px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
      >
        Ask
      </button>
    </form>
  );
}

/* ---------- empty ---------- */

function EmptyState({ recent, onPick }: { recent: string[]; onPick: (q: string) => void }) {
  return (
    <div className="flex flex-col gap-6 py-4">
      <h1 className="max-w-xl font-serif text-[22px] font-semibold leading-snug text-tx">
        Ask anything about your MBA &amp; Product School coursework.
      </h1>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-full border border-accbd bg-accbg px-4 py-2 text-left text-[13px] text-acc hover:border-acc"
          >
            {s}
          </button>
        ))}
      </div>

      {recent.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mut">Recent questions</p>
          <ul className="overflow-hidden rounded-xl border border-bd bg-card">
            {recent.slice(0, 4).map((q) => (
              <li key={q} className="border-b border-bd2 last:border-b-0">
                <button
                  onClick={() => onPick(q)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] text-tx2 hover:bg-hdr"
                >
                  <span aria-hidden className="text-mut">↺</span>
                  <span className="flex-1 truncate">{q}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------- exchange ---------- */

function QuestionBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-[14px] rounded-br-[4px] bg-qbub px-4 py-2.5 text-[14px] text-tx">
        {text}
      </p>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="flex flex-col gap-3 rounded-[14px] rounded-bl-[4px] border border-bd bg-card p-4">
      <div className="flex items-center gap-2 text-[13px] text-tx2">
        <Spinner />
        <span>Reading your materials…</span>
      </div>
      <div className="flex flex-col gap-2">
        <div className="mv-shimmer h-3 w-full rounded" />
        <div className="mv-shimmer h-3 w-[92%] rounded" />
        <div className="mv-shimmer h-3 w-[70%] rounded" />
      </div>
    </div>
  );
}

function AnswerCard({ text, citations, streaming }: { text: string; citations: Citation[]; streaming: boolean }) {
  return (
    <div className="rounded-[14px] rounded-bl-[4px] border border-bd bg-card p-4">
      <p className="whitespace-pre-wrap font-serif text-[14.5px] leading-[1.55] text-tx">
        {text}
        {streaming && <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-acc align-text-bottom" aria-hidden />}
      </p>
      {citations.length > 0 && (
        <>
          <hr className="my-3 border-bd2" />
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-mut">Sources</p>
          <div className="flex flex-wrap gap-2">
            {citations.map((c) => (
              <CitationChip key={c.n} citation={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CitationChip({ citation }: { citation: Citation }) {
  return (
    <a
      href={fileHref(citation.file, citation.loc)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-accbd bg-accbg px-2.5 py-1.5 text-[11.5px] text-tx2 hover:border-acc"
    >
      <span className="font-semibold text-acc">{typeTag(citation.file)}</span>
      <span className="truncate">{citationLabel(citation)}</span>
    </a>
  );
}

function NotCoveredCard() {
  return (
    <div className="rounded-[14px] rounded-bl-[4px] border border-dashed border-bd bg-card p-5 text-center">
      <p className="font-serif text-[15px] font-semibold text-tx">Not covered in your materials</p>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] text-tx2">
        The coursework doesn’t seem to cover this, so nothing was made up. Try rephrasing, or{" "}
        <a href="/vault/browse" className="text-acc hover:underline">
          browse your materials
        </a>
        .
      </p>
    </div>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[14px] rounded-bl-[4px] border border-err/40 bg-err/10 p-4">
      <div>
        <p className="text-[14px] font-semibold text-err">Couldn’t get an answer</p>
        <p className="mt-0.5 text-[13px] text-tx2">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="rounded-lg border border-bd bg-card px-3 py-1.5 text-[13px] font-medium text-tx hover:bg-hdr"
      >
        Retry
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-bd border-t-acc"
    />
  );
}

/** Turn a non-OK /api/ask response into a user-facing message. The route returns
 *  {error} JSON for 400/429/503; fall back to a generic line otherwise. */
async function readErrorMessage(res: Response): Promise<string> {
  if (res.status === 429) return "You’ve asked a lot in a short time. Please try again in a little while.";
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
      return (body as { error: string }).error;
    }
  } catch {
    /* non-JSON body */
  }
  return "Something went wrong getting your answer. Please try again.";
}

/* ---------- pure view helpers ---------- */

function fileHref(file: string, loc: Loc): string {
  const path = file.split("/").map(encodeURIComponent).join("/");
  const base = `${FILE_BASE}/${path}`;
  // Browsers honor #page=N when opening a PDF in the built-in viewer.
  return loc.kind === "page" ? `${base}#page=${loc.index}` : base;
}

function citationLabel(c: Citation): string {
  const name = c.file.split("/").pop() ?? c.file;
  if (c.loc.kind === "page") return `${name} · p. ${c.loc.index}`;
  if (c.loc.kind === "slide") return `${name} · slide ${c.loc.index}`;
  return name;
}

function typeTag(file: string): string {
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = { pdf: "PDF", pptx: "PPT", ppt: "PPT", docx: "DOC", doc: "DOC", xlsx: "XLS", xls: "XLS" };
  return map[ext] ?? (ext ? ext.toUpperCase() : "FILE");
}
