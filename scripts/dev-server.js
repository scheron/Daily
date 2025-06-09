import ChildProcess from "node:child_process"
import {cpSync} from "node:fs"
import {EOL} from "node:os"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import Chalk from "chalk"
import Chokidar from "chokidar"
import Electron from "electron"
import {createServer} from "vite"

import compileTs from "./private/tsc.js"

process.env.NODE_ENV = "development"

let viteServer = null
let electronProcess = null
let electronProcessLocker = false
let rendererPort = 0
const __dirname = dirname(fileURLToPath(import.meta.url))

async function startRenderer() {
  viteServer = await createServer({
    configFile: join(__dirname, "..", "vite.config.js"),
    mode: "development",
  })

  return viteServer.listen()
}

async function startElectron() {
  if (electronProcess) {
    // single instance lock
    return
  }

  try {
    await compileTs(join(__dirname, "..", "src", "main"))
  } catch {
    console.log(Chalk.redBright("Could not start Electron because of the above typescript error(s)."))
    electronProcessLocker = false
    return
  }

  const args = [join(__dirname, "..", "build", "main", "main.js"), rendererPort]
  electronProcess = ChildProcess.spawn(Electron, args)
  electronProcessLocker = false

  electronProcess.stdout.on("data", (data) => {
    if (data === EOL) return
    process.stdout.write(Chalk.blueBright(`[electron] `) + Chalk.white(data.toString()))
  })

  electronProcess.stderr.on("data", (data) => process.stderr.write(Chalk.blueBright(`[electron] `) + Chalk.white(data.toString())))

  electronProcess.on("exit", () => stop())
}

function restartElectron() {
  if (electronProcess) {
    electronProcess.removeAllListeners("exit")
    electronProcess.kill()
    electronProcess = null
  }

  if (!electronProcessLocker) {
    electronProcessLocker = true
    startElectron()
  }
}

function copyStaticFiles() {
  copy("static")
}

/*
The working dir of Electron is build/main instead of src/main because of TS.
tsc does not copy static files, so copy them over manually for dev server.
*/
function copy(path) {
  cpSync(join(__dirname, "..", "src", "main", path), join(__dirname, "..", "build", "main", path), {recursive: true})
}

function stop() {
  viteServer.close()
  process.exit()
}

async function start() {
  console.log(`${Chalk.greenBright("=======================================")}`)
  console.log(`${Chalk.greenBright("Starting Electron + Vite Dev Server...")}`)
  console.log(`${Chalk.greenBright("=======================================")}`)

  const devServer = await startRenderer()
  rendererPort = devServer.config.server.port

  copyStaticFiles()
  startElectron()

  const path = join(__dirname, "..", "src", "main")
  Chokidar.watch(path, {
    cwd: path,
  }).on("change", (path) => {
    console.log(Chalk.blueBright(`[electron] `) + `Change in ${path}. reloading... 🚀`)

    if (path.startsWith(join("static", "/"))) {
      copy(path)
    }

    restartElectron()
  })
}

start()
