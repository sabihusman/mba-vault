// GET /vault/api/files/<...path> — stream a single coursework file for download
// or inline viewing. The path segments are validated by resolveFile (which goes
// through the traversal guard), so a request can only ever read a regular file
// inside the data dir. Gated by the proxy like every other /api/* route.
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { resolveFile } from "@/lib/browse/catalog";
import { contentTypeFor, dispositionFor, contentDisposition } from "@/lib/browse/content-type";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params;
  const file = await resolveFile(path);
  if (file === null) {
    return new Response("Not found", { status: 404 });
  }

  const kind = dispositionFor(file.ext);
  const body = Readable.toWeb(createReadStream(file.absPath)) as unknown as ReadableStream<Uint8Array>;

  return new Response(body, {
    headers: {
      "Content-Type": contentTypeFor(file.ext),
      "Content-Length": String(file.size),
      "Content-Disposition": contentDisposition(kind, file.name),
      // Private user materials — never store in shared/proxy caches.
      "Cache-Control": "private, no-store",
    },
  });
}
