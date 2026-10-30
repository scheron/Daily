import {execFileSync} from "node:child_process"
import {existsSync, lstatSync, rmSync} from "node:fs"
import {homedir} from "node:os"
import {join} from "node:path"

if (process.platform !== "darwin") throw new Error("Daily Demo is supported on macOS only.")

const commands = execFileSync("ps", ["-axo", "command="], {encoding: "utf8"})
const isRunning = commands
  .split("\n")
  .some(
    (command) =>
      command.includes("Daily Demo.app/Contents/MacOS/Daily Demo") ||
      /Electron(?:\.app\/Contents\/MacOS\/Electron)?\s+.*out-demo\/main\/main\.js/.test(command),
  )

if (isRunning) throw new Error("Quit Daily Demo before resetting its demo data.")

const demoDirectory = join(homedir(), "Library", "Application Support", "Daily-Demo")
if (existsSync(demoDirectory) && lstatSync(demoDirectory).isSymbolicLink()) throw new Error("Refusing to reset a symlinked demo data directory.")

rmSync(demoDirectory, {recursive: true, force: true})
console.log(`Reset demo data at ${demoDirectory}. The next launch will create the sample workspace again.`)
