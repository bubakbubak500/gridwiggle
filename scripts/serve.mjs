import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
if (!existsSync(resolve(root, "index.html"))) {
  console.error(
    "Chybi sestavena aplikace. Nejprve spust pnpm install a pnpm build.",
  );
  process.exit(1);
}
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
const server = createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
  } catch {
    response.writeHead(400).end();
    return;
  }
  const path = resolve(root, "." + pathname);
  if (
    !path.startsWith(root.endsWith(sep) ? root : root + sep) &&
    path !== root
  ) {
    response.writeHead(403).end();
    return;
  }
  const file = extname(pathname) ? path : resolve(root, "index.html");
  if (!existsSync(file)) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader(
    "Content-Type",
    types[extname(file)] ?? "application/octet-stream",
  );
  response.setHeader("Cache-Control", "no-cache");
  const stream = createReadStream(file);
  stream.on("error", () => {
    if (!response.headersSent) response.writeHead(404);
    response.end();
  });
  stream.pipe(response);
});
const port = Number(process.env.GRIDWIGGLE_PORT || 8080);
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${port} uz pouziva jina aplikace. Zavri jeji server nebo nastav GRIDWIGGLE_PORT.`
      : error.message,
  );
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(
    `GridWiggle Wallpaper Studio\n${url}\nPro ukonceni stiskni Ctrl+C. Fotografie zustavaji v prohlizeci.`,
  );
  if (process.argv.includes("--open")) {
    const command =
      process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : process.platform === "darwin"
          ? ["open", [url]]
          : ["xdg-open", [url]];
    spawn(command[0], command[1], { windowsHide: true, stdio: "ignore" }).on(
      "error",
      () => {},
    );
  }
});
