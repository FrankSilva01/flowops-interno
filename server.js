import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("./", import.meta.url));
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function getFilePath(requestUrl, rootDirectory) {
  const normalizedRoot = resolve(rootDirectory);
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, "http://127.0.0.1").pathname);
  } catch {
    return null;
  }
  if (pathname.includes("\\")) return null;
  if (pathname.split("/").some((segment) => segment.startsWith("."))) return null;
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(normalizedRoot, `.${requestedPath}`);

  if (filePath !== normalizedRoot && !filePath.startsWith(`${normalizedRoot}${sep}`)) return null;
  return filePath;
}

export function createStaticServer({ rootDirectory = projectRoot } = {}) {
  return createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (!["GET", "HEAD"].includes(request.method || "")) {
      response.writeHead(405, { Allow: "GET, HEAD, OPTIONS" });
      response.end();
      return;
    }

    const filePath = getFilePath(request.url || "/", rootDirectory);
    if (!filePath) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    try {
      const body = await readFile(filePath);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 8080);
  const server = createStaticServer();

  server.listen(port, host, () => {
    console.log(`FlowOps local server listening at http://${host}:${port}`);
  });
}
