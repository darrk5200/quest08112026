import { createServer } from "http";
import { readFile, stat } from "fs/promises";
import { extname, join, normalize, resolve } from "path";

const port = process.env["PORT"] || 8080;
const publicDir = resolve(process.cwd(), "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".txt": "text/plain; charset=utf-8",
};

async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const safe = normalize(clean).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(publicDir, safe);
  if (!filePath.startsWith(publicDir)) return null;
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    return null;
  }
  return filePath;
}

const server = createServer(async (req, res) => {
  let filePath = await resolveFile(req.url || "/");

  // SPA-style fallback to the game entry point
  if (!filePath) filePath = join(publicDir, "index.html");

  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found\n");
  }
});

server.listen(port, () => {
  console.log(`Game server running on http://localhost:${port}`);
});
