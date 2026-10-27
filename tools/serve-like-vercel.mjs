// Minimal stand-in for Vercel: cleanUrls, the redirects and headers from vercel.json, 404.html.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
const root = process.argv[2], port = +process.argv[3] || 8790;
const cfg = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".mp4": "video/mp4", ".xml": "application/xml", ".txt": "text/plain" };
const toRe = (src) => new RegExp("^" + src.replace(/\(\.\*\)/g, "(.*)").replace(/\/\(([^)]+)\)\//g, "/($1)/") + "$");
createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const host = req.headers["x-host"] || req.headers.host;
  for (const r of cfg.redirects) {
    if (toRe(r.source).test(url.pathname) && (!r.has || r.has.every((h) => h.type === "host" && h.value === host))) {
      res.writeHead(r.permanent ? 308 : 307, { Location: r.destination }); return res.end();
    }
  }
  for (const h of cfg.headers) if (toRe(h.source).test(url.pathname)) for (const { key, value } of h.headers) res.setHeader(key, value);
  let p = url.pathname === "/" ? "/index.html" : url.pathname;
  let f = join(root, p);
  if (!existsSync(f) || statSync(f).isDirectory()) f = join(root, p + ".html");
  if (!existsSync(f)) { res.writeHead(404, { "Content-Type": types[".html"] }); return res.end(readFileSync(join(root, "404.html"))); }
  const buf = readFileSync(f);
  const range = req.headers.range;
  if (range && extname(f) === ".mp4") {
    const [a, b] = range.replace("bytes=", "").split("-");
    const start = +a, end = b ? +b : buf.length - 1;
    res.writeHead(206, { "Content-Type": "video/mp4", "Content-Range": `bytes ${start}-${end}/${buf.length}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
    return res.end(buf.subarray(start, end + 1));
  }
  res.writeHead(200, { "Content-Type": types[extname(f)] || "application/octet-stream" });
  res.end(buf);
}).listen(port, "127.0.0.1", () => console.log("on", port));
