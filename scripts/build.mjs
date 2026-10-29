import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dbFile = path.resolve(rootDir, "backend", "planner_logistica.db");

function run(cmd, cwd = rootDir) {
  console.log(`[build] Running: ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

try {
  execSync('python3 -c "import fastapi, uvicorn, sqlalchemy, jose, passlib, multipart, openpyxl"', {
    cwd: rootDir,
    stdio: "ignore",
  });
} catch {
  try {
    execSync("which pip3", { cwd: rootDir, stdio: "ignore" });
    run("pip3 install --break-system-packages -r requirements.txt");
  } catch {
    console.log("[build] Skipping pip3 install (managed by runtime server)");
  }
}

if (!fs.existsSync(dbFile)) {
  try {
    execSync("which python3", { cwd: rootDir, stdio: "ignore" });
    run("python3 scripts/init_sqlite.py");
  } catch {
    console.log("[build] Skipping SQLite init (managed by runtime server)");
  }
}

run("npm --prefix frontend run build");
