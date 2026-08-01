// MCP server wiring: one handler instance serving the three read-only tools.
// Uses the v2 SDK's createMcpHandler — per-request McpServer instances over a
// stateless streamable HTTP transport, whose .fetch(Request) => Response face
// plugs directly into a Next route handler.
//
// AUTH LAYERS — who checks what:
// - REACHABILITY: the proxy gate (proxy.ts) — kill switch + token validity.
//   Nothing here runs for an unauthenticated request.
// - PER-TOOL SCOPE: here. The route passes the verified token's scopes as
//   authInfo (the SDK is strictly pass-through, ctx.http.authInfo); each tool
//   requires its scope — "search" for search_vault, "read" for
//   list_files/get_document. Fail closed: missing authInfo ⇒ no scopes ⇒
//   every tool refuses with a reconnect hint (pre-"read" tokens hit this
//   until the connector is reconnected and re-consented).
import { createMcpHandler, McpServer, type McpHttpHandler } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getIndex } from "../ask/index-store";
import { createGeminiClient } from "../ask/gemini";
import { listDirectory, resolveFile } from "../browse/catalog";
import { SCOPE_SEARCH, SCOPE_READ } from "../oauth/config";
import {
  searchVault,
  formatHits,
  validateQuery,
  clampCount,
  MAX_QUERY_CHARS,
  MCP_MAX_K,
} from "./search-vault";
import { listFiles } from "./list-files";
import { getDocument } from "./get-document";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function text(message: string, isError = false): ToolResult {
  return { content: [{ type: "text", text: message }], isError };
}

/** Scope gate for one tool call. Returns an error result, or null when allowed. */
function missingScope(scopes: string[] | undefined, required: string): ToolResult | null {
  if (scopes?.includes(required)) return null;
  return text(
    `This connection doesn't have the "${required}" scope. Ask the owner to disconnect and ` +
      "reconnect the connector in Claude — the new consent grants it.",
    true,
  );
}

/** Phase 4 (F5): unexpected failures return GENERIC text. A raw exception
 *  message (e.g. a Gemini SDK error) could carry request/config detail we
 *  never want surfaced or logged — and per the logging rule, nothing is
 *  console.*'d here either. */
async function guarded(run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run();
  } catch {
    return text("The tool hit an internal error — try again.", true);
  }
}

function buildServer(): McpServer {
  const server = new McpServer({ name: "mba-vault", version: "1.1.0" });

  server.registerTool(
    "search_vault",
    {
      description:
        "Search the owner's MBA + Product School coursework (~790 documents) by " +
        "semantic similarity. Returns the most relevant excerpts with citations and a " +
        "`path:` per hit usable with get_document. Retrieval only — no generated answer.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .max(MAX_QUERY_CHARS)
          .describe("What to look for, as a natural-language question or topic."),
        count: z
          .number()
          .int()
          .optional()
          .describe(`How many results to return (default 8, clamped to 1–${MCP_MAX_K}).`),
      },
    },
    async ({ query, count }, ctx) =>
      guarded(async () => {
        const denied = missingScope(ctx.http?.authInfo?.scopes, SCOPE_SEARCH);
        if (denied) return denied;
        const invalid = validateQuery(query);
        if (invalid) return text(`Invalid query: ${invalid}`, true);
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return text("Search is not configured (no embedding key).", true);
        const gemini = createGeminiClient(apiKey);
        const hits = await searchVault(
          { getIndex, embedQuery: (q) => gemini.embedQuery(q) },
          query,
          clampCount(count),
        );
        return text(formatHits(hits));
      }),
  );

  server.registerTool(
    "list_files",
    {
      description:
        "List the coursework files and folders, like a directory listing. Omit path for " +
        "the top-level course folders. Paths from the output feed get_document (files) " +
        "or list_files (folders). Read-only.",
      inputSchema: {
        path: z
          .string()
          .max(500)
          .optional()
          .describe('Forward-slash relative folder path, e.g. "Course A/Week 1". Omit for the root.'),
      },
    },
    async ({ path }, ctx) =>
      guarded(async () => {
        const denied = missingScope(ctx.http?.authInfo?.scopes, SCOPE_READ);
        if (denied) return denied;
        const result = await listFiles({ listDirectory }, path);
        return result.kind === "ok" ? text(result.text) : text(result.message, true);
      }),
  );

  server.registerTool(
    "get_document",
    {
      description:
        "Read a coursework document's full text from the Q&A index, in document order " +
        "(page/slide headers included). Large documents are truncated at a chunk boundary " +
        "with an explicit marker. Excel and image-only PDFs aren't in the index and can't " +
        "be read this way. Read-only.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .max(500)
          .describe('A [file] path exactly as list_files or a search_vault `path:` line printed it.'),
      },
    },
    async ({ path }, ctx) =>
      guarded(async () => {
        const denied = missingScope(ctx.http?.authInfo?.scopes, SCOPE_READ);
        if (denied) return denied;
        const result = await getDocument({ getIndex, resolveFile }, path);
        switch (result.kind) {
          case "ok":
            return text(result.text);
          case "browse_only":
            // Informative, not an error — the model should relay it, not retry.
            return text(result.message);
          case "not_found":
            return text(result.message, true);
        }
      }),
  );

  return server;
}

let handler: McpHttpHandler | null = null;

/** The process-wide MCP handler (lazy — nothing is built until first request). */
export function getMcpHandler(): McpHttpHandler {
  handler ??= createMcpHandler(() => buildServer());
  return handler;
}
