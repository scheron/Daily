import {spawn} from "node:child_process"
import {existsSync} from "node:fs"
import {createRequire} from "node:module"
import {fileURLToPath} from "node:url"

if (process.platform !== "darwin") throw new Error("Daily Demo is supported on macOS only.")

const require = createRequire(import.meta.url)
const entry = fileURLToPath(new URL("../apps/server/out/index.js", import.meta.url))
if (!existsSync(entry)) throw new Error("Build the demo server first with pnpm --filter @daily/server build.")

const child = spawn(require("electron"), [entry, "start"], {
  stdio: "inherit",
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    DAILY_SERVER_HOST: "127.0.0.1",
    DAILY_SERVER_PORT: "18787",
    DAILY_SERVER_PUBLIC_URL: "http://127.0.0.1:18787",
    DAILY_SERVER_NAME: "Orbit Demo Server",
    DAILY_SERVER_DATA_DIR: "/tmp/daily-demo-server-state",
    DAILY_SERVER_TLS: "plain",
    DAILY_SERVER_BACKUP_INTERVAL_HOURS: "0",
  },
})

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal))
process.on("exit", () => child.kill())
child.on("error", (error) => {
  console.error(error.message)
  process.exitCode = 1
})
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" ? 0 : 1)
})
