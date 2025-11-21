import FileSystem from "node:fs"
import Path from "node:path"
import {fileURLToPath} from "node:url"
import Chalk from "chalk"
import {build} from "vite"

import compileTs from "./private/tsc.js"

const __dirname = Path.dirname(fileURLToPath(import.meta.url))

function buildRenderer() {
  return build({
    configFile: Path.join(__dirname, "..", "vite.config.js"),
    base: "./",
    mode: "production",
  })
}

function buildMain() {
  const mainPath = Path.join(__dirname, "..", "src", "main")
  return compileTs(mainPath)
}

function copyStaticFiles() {
  const resourcesSrc = Path.join(__dirname, "..", "resources")
  const staticDest = Path.join(__dirname, "..", "build", "main", "static")
  
  if (FileSystem.existsSync(resourcesSrc)) {
    FileSystem.cpSync(resourcesSrc, staticDest, { recursive: true })
    console.log(Chalk.blueBright("Static files copied successfully"))
  }
}

FileSystem.rmSync(Path.join(__dirname, "..", "build"), {
  recursive: true,
  force: true,
})

console.log(Chalk.blueBright("Transpiling renderer & main..."))

Promise.allSettled([buildRenderer(), buildMain()]).then(() => {
  copyStaticFiles()
  console.log(Chalk.greenBright("Renderer & main successfully transpiled! (ready to be built with electron-builder)"))
})
