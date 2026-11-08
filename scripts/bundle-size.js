import {readdir, stat} from "node:fs/promises"
import {join, relative} from "node:path"
import {fileURLToPath} from "node:url"
import Chalk from "chalk"

const buildDir = fileURLToPath(new URL("../apps/desktop/out/renderer/assets/", import.meta.url))

function formatBytes(bytes) {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

async function analyzeBundle() {
  try {
    const entries = await readdir(buildDir, {recursive: true, withFileTypes: true})
    const fileSizes = []

    for (const entry of entries) {
      if (!entry.isFile()) continue
      const filePath = join(entry.parentPath, entry.name)
      fileSizes.push({name: relative(buildDir, filePath), size: (await stat(filePath)).size})
    }

    fileSizes.sort((a, b) => b.size - a.size)

    console.log(Chalk.blueBright("\n📦 Bundle Size Analysis\n"))
    console.log(Chalk.green("Top 10 largest files:\n"))

    fileSizes.slice(0, 10).forEach((file, index) => {
      const sizeStr = formatBytes(file.size)
      const bar = "█".repeat(Math.floor((file.size / (fileSizes[0].size || 1)) * 30))
      console.log(`${String(index + 1).padStart(2)}. ${Chalk.cyan(file.name.padEnd(50))} ${Chalk.yellow(sizeStr.padStart(10))} ${Chalk.gray(bar)}`)
    })

    const allTotal = fileSizes.reduce((sum, file) => sum + file.size, 0)
    console.log(Chalk.green(`\nTotal bundle size: ${Chalk.yellow(formatBytes(allTotal))}`))
    console.log(Chalk.gray(`Total files: ${fileSizes.length}\n`))

    const largeFiles = fileSizes.filter((f) => f.size > 500 * 1024)
    if (largeFiles.length > 0) {
      console.log(Chalk.yellow("⚠️  Large files detected (>500KB):"))
      largeFiles.forEach((file) => {
        console.log(Chalk.yellow(`   - ${file.name}: ${formatBytes(file.size)}`))
      })
      console.log()
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(Chalk.red("❌ Build directory not found. Run 'pnpm --filter @daily/desktop build:compress' first."))
    } else {
      console.error(Chalk.red("Error analyzing bundle:"), error)
    }
    process.exit(1)
  }
}

analyzeBundle()
