import { exec, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "backend");
const dbFile = path.resolve(backendDir, "planner_logistica.db");
const distDir = path.resolve(__dirname, "frontend", "dist");
const runtimeCacheArchive = path.resolve(__dirname, "runtime_cache.bin");
const runtimeCacheDir = "/tmp/planner_runtime_cache";
const cachedPyDir = path.join(runtimeCacheDir, "py_packages");
const cachedDistDir = path.join(runtimeCacheDir, "frontend_dist");
const cachedDbFile = path.join(runtimeCacheDir, "planner_logistica.db");

const FRONTEND_PORT = 3000;
const BACKEND_PORT = 8001;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

const API_PREFIXES = [
  "/api/",
  "/auth/",
  "/producao/",
  "/tabela-b/",
  "/linhas/",
  "/parametros/",
  "/colunas-extras/",
  "/ferramentaria/",
  "/dashboard/",
  "/auditoria/",
  "/exportacao/",
  "/import/",
  "/labels/",
  "/users/",
  "/comentarios/",
  "/checklist/",
  "/anexos/",
  "/ws/",
];

const API_EXACT = new Set([
  "/api",
  "/auth",
  "/producao",
  "/tabela-b",
  "/linhas",
  "/parametros",
  "/colunas-extras",
  "/ferramentaria",
  "/dashboard",
  "/auditoria",
  "/exportacao",
  "/import",
  "/labels",
  "/users",
  "/comentarios",
  "/checklist",
  "/anexos",
  "/docs",
  "/redoc",
  "/openapi.json",
]);

function isApiRequest(req) {
  const urlPath = (req.url || "/").split("?")[0];
  if (API_EXACT.has(urlPath) || API_PREFIXES.some((p) => urlPath.startsWith(p))) {
    if (
      req.method === "GET" &&
      (req.headers.accept || "").includes("text/html") &&
      !urlPath.startsWith("/api/") &&
      urlPath !== "/docs" &&
      urlPath !== "/redoc"
    ) {
      return false;
    }
    return true;
  }
  return false;
}

function bufferRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function proxyToBackend(req, res) {
  let bodyBuffer = Buffer.alloc(0);
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      bodyBuffer = await bufferRequestBody(req);
    } catch {
      res.writeHead(400);
      res.end("Bad Request");
      return;
    }
  }

  const maxAttempts = 60;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const handled = await new Promise((resolve) => {
      const proxyReq = http.request(
        {
          hostname: "127.0.0.1",
          port: BACKEND_PORT,
          path: req.url,
          method: req.method,
          headers: {
            ...req.headers,
            host: `127.0.0.1:${BACKEND_PORT}`,
          },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          proxyRes.pipe(res);
          resolve(true);
        }
      );

      proxyReq.on("error", () => {
        resolve(false);
      });

      if (bodyBuffer.length > 0) {
        proxyReq.write(bodyBuffer);
      }
      proxyReq.end();
    });

    if (handled) return;
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!res.headersSent) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ detail: "Backend starting up, please retry." }));
  }
}

function resolveStaticRoot() {
  if (fs.existsSync(path.join(distDir, "index.html"))) {
    return distDir;
  }
  if (fs.existsSync(path.join(cachedDistDir, "index.html"))) {
    return cachedDistDir;
  }
  return distDir;
}

function serveStaticOrSpa(req, res) {
  const activeDist = resolveStaticRoot();
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const cleanPath = urlPath.replace(/^\/+/, "");
  let targetFile = path.join(activeDist, cleanPath);

  if (!cleanPath || !fs.existsSync(targetFile) || fs.statSync(targetFile).isDirectory()) {
    targetFile = path.join(activeDist, "index.html");
  }

  if (!fs.existsSync(targetFile)) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<!doctype html><html><body><p>Starting Gestamp Planner Logistica...</p></body></html>");
    return;
  }

  const ext = path.extname(targetFile).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const stat = fs.statSync(targetFile);

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stat.size,
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(targetFile).pipe(res);
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || "/").split("?")[0];
  if (urlPath === "/health" || urlPath === "/api/health") {
    const payload = JSON.stringify({ status: "ok" });
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    });
    if (req.method === "HEAD") {
      res.end();
    } else {
      res.end(payload);
    }
    return;
  }

  if (isApiRequest(req)) {
    proxyToBackend(req, res);
    return;
  }

  serveStaticOrSpa(req, res);
});

server.on("upgrade", (req, socket, head) => {
  const upstream = net.connect(BACKEND_PORT, "127.0.0.1", () => {
    const reqLines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      reqLines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    }
    reqLines.push("", "");
    upstream.write(reqLines.join("\r\n"));
    if (head && head.length > 0) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });

  upstream.on("error", () => {
    socket.destroy();
  });
  socket.on("error", () => {
    upstream.destroy();
  });
});

// Bind port 3000 immediately so control-plane readiness succeeds in <50ms
server.listen(FRONTEND_PORT, "0.0.0.0", () => {
  console.log(`[server] Listening on http://0.0.0.0:${FRONTEND_PORT}`);
  startBackendWorker();
});

let backendChild = null;

async function startBackendWorker() {
  if (fs.existsSync(runtimeCacheArchive) && !fs.existsSync(cachedPyDir)) {
    try {
      fs.mkdirSync(runtimeCacheDir, { recursive: true });
      await execAsync(`tar -xzf "${runtimeCacheArchive}" -C "${runtimeCacheDir}"`);
      if (!fs.existsSync(path.join(distDir, "index.html")) && fs.existsSync(cachedDistDir)) {
        fs.cpSync(cachedDistDir, distDir, { recursive: true });
      }
      if (!fs.existsSync(dbFile) && fs.existsSync(cachedDbFile)) {
        fs.copyFileSync(cachedDbFile, dbFile);
      }
    } catch (err) {
      console.warn("[server] Failed to unpack runtime_cache.bin:", err);
    }
  }

  const pythonPath = [
    backendDir,
    fs.existsSync(cachedPyDir) ? cachedPyDir : "",
    process.env.PYTHONPATH,
  ]
    .filter(Boolean)
    .join(":");

  const env = {
    ...process.env,
    PYTHONPATH: pythonPath,
    PORT: String(BACKEND_PORT),
    DATABASE_URL: process.env.DATABASE_URL || `sqlite:///${dbFile}`,
    JWT_SECRET_KEY:
      process.env.JWT_SECRET_KEY ||
      "10f9919deb23ef2dabd560f2f107440b58392d0ec80cb701ca64f75d5dde79b3",
    JWT_ALGORITHM: process.env.JWT_ALGORITHM || "HS256",
    JWT_EXPIRE_MINUTES: process.env.JWT_EXPIRE_MINUTES || "1440",
    CORS_ORIGINS: process.env.CORS_ORIGINS || "*",
  };

  try {
    await execAsync(
      'python3 -c "import fastapi, uvicorn, sqlalchemy, jose, passlib, multipart, openpyxl"',
      { cwd: __dirname, env }
    );
  } catch {
    console.log("[server] Installing missing Python dependencies...");
    try {
      await execAsync("python3 -m pip --version", { cwd: __dirname, env });
    } catch {
      await execAsync(
        "curl -sSL https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py && python3 /tmp/get-pip.py --break-system-packages",
        { cwd: __dirname, env }
      );
    }
    await execAsync(
      "python3 -m pip install --break-system-packages -r requirements.txt",
      { cwd: __dirname, env }
    );
  }

  if (!fs.existsSync(dbFile)) {
    console.log("[server] Initializing SQLite database from seed...");
    await execAsync("python3 scripts/init_sqlite.py", { cwd: __dirname, env });
  }

  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    console.log("[server] Building frontend bundle...");
    await execAsync("npm --prefix frontend run build", { cwd: __dirname, env });
  }

  console.log(`[server] Starting FastAPI worker on 127.0.0.1:${BACKEND_PORT}...`);
  backendChild = spawn(
    "python3",
    [
      "-m",
      "uvicorn",
      "app.main:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(BACKEND_PORT),
    ],
    {
      cwd: backendDir,
      env,
      stdio: "inherit",
    }
  );
}

const shutdown = (signal) => {
  if (backendChild && !backendChild.killed) {
    backendChild.kill(signal);
  }
  server.close(() => process.exit(0));
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
