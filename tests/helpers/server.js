import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export async function startTestServer() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "happy-eat-test-"));
  const databasePath = path.join(tmpDir, "happy-eat.sqlite");
  const accessCode = "test-family";
  const port = await getFreePort();
  const child = spawn("node", ["server/index.js"], {
    cwd: path.resolve(import.meta.dirname, "../.."),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: databasePath,
      FAMILY_ACCESS_CODE: accessCode,
      DASHSCOPE_API_KEY: "",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  let exited = false;
  child.once("exit", () => {
    exited = true;
  });
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  await waitFor(() => output.includes(`http://localhost:${port}`), 8000, () => output);

  return {
    accessCode,
    baseUrl: `http://localhost:${port}`,
    databasePath,
    token: accessCode,
    async stop() {
      if (!exited) {
        child.kill("SIGTERM");
        await once(child, "exit").catch(() => {});
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

export async function api(server, path, options = {}) {
  const response = await fetch(`${server.baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.auth === false ? {} : { Authorization: `Bearer ${server.token}` }),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));

  return { response, payload };
}

async function getFreePort() {
  const net = await import("node:net");
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  server.close();
  await once(server, "close");
  return port;
}

async function waitFor(check, timeoutMs, getDebug) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for test server.\n${getDebug()}`);
}
