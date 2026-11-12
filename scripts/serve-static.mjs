import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const [rootArg = "public", portArg = "5174", defaultFile = "index.html"] = process.argv.slice(2);
const root = resolve(rootArg);
const port = Number(portArg);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function resolveFilePath(urlPath) {
  const relative = urlPath === "/" ? `/${defaultFile}` : decodeURIComponent(urlPath);
  const filePath = normalize(join(root, relative));
  return filePath.startsWith(root) ? filePath : null;
}

createServer(async (request, response) => {
  const { pathname } = new URL(request.url, `http://localhost:${port}`);
  const filePath = resolveFilePath(pathname);

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(filePath)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Não encontrado");
  }
}).listen(port, () => console.log(`Servindo ${root} em http://localhost:${port}`));
