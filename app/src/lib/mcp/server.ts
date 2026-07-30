// MCP server wiring: one handler instance serving the single read-only tool.
// Uses the v2 SDK's createMcpHandler — per-request McpServer instances over a
// stateless streamable HTTP transport (sessionIdGenerator: undefined under the
// hood), whose .fetch(Request) => Response face plugs directly into a Next
// route handler. AUTH IS NOT HANDLED HERE — the proxy gate (proxy.ts) rejects
// unauthenticated requests before this module ever sees them, and the SDK
// handler performs no token verification of its own (verified in its docs).
import { createMcpHandler, McpServer, type McpHttpHandler } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getIndex } from "../ask/index-store";
import { createGeminiClient } from "../ask/gemini";
import { searchVault, formatHits, validateQuery, MAX_QUERY_CHARS } from "./search-vault";

function buildServer(): McpServer {
  const server = new McpServer({ name: "mba-vault", version: "1.0.0" });

  server.registerTool(
    "search_vault",
    {
      description:
        "Search the owner's MBA + Product School coursework (~790 documents) by " +
        "semantic similarity. Returns the most relevant excerpts with citations " +
        "(course / file / page-or-slide). Retrieval only — no generated answer.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .max(MAX_QUERY_CHARS)
          .describe("What to look for, as a natural-language question or topic."),
      },
    },
    async ({ query }) => {
      // Defense in depth: the zod schema already enforces this, but the check
      // is cheap and keeps the invariant local.
      const invalid = validateQuery(query);
      if (invalid) {
        return { content: [{ type: "text", text: `Invalid query: ${invalid}` }], isError: true };
      }
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return {
          content: [{ type: "text", text: "Search is not configured (no embedding key)." }],
          isError: true,
        };
      }
      const gemini = createGeminiClient(apiKey);
      const hits = await searchVault(
        { getIndex, embedQuery: (q) => gemini.embedQuery(q) },
        query,
      );
      return { content: [{ type: "text", text: formatHits(hits) }] };
    },
  );

  return server;
}

let handler: McpHttpHandler | null = null;

/** The process-wide MCP handler (lazy — nothing is built until first request). */
export function getMcpHandler(): McpHttpHandler {
  handler ??= createMcpHandler(() => buildServer());
  return handler;
}
