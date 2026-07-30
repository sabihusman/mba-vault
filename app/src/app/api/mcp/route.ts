// /vault/api/mcp — the MCP connector endpoint (streamable HTTP). Thin shell:
// auth NEVER happens here. The proxy gate (proxy.ts) has already (a) 404'd the
// path unless MCP_ENABLED=true and (b) rejected any request without a valid
// bearer token — so by the time this handler runs, the request is authorized.
// The SDK handler does its own method/protocol handling (405s GET/DELETE in
// stateless mode, JSON-RPC errors for bad bodies).
import { getMcpHandler } from "@/lib/mcp/server";

export async function POST(request: Request): Promise<Response> {
  return getMcpHandler().fetch(request);
}

export async function GET(request: Request): Promise<Response> {
  return getMcpHandler().fetch(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return getMcpHandler().fetch(request);
}
