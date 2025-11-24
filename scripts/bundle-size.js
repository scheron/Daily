import {readdir, stat} from "node:fs/promises"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import Chalk from "chalk"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const buildDir = join(__dirname, "..", "build", "renderer", "assets")

function formatBytes(bytes) {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

async function getFileSize(filePath) {
  try {
    const stats = await stat(filePath)
    return stats.size
  } catch {
    return 0
  }
}

async function analyzeBundle() {
  try {
    const files = await readdir(buildDir, {recursive: true})
    const fileSizes = []

    for (const file of files) {
      const filePath = join(buildDir, file)
      const size = await getFileSize(filePath)
      if (size > 0) {
        fileSizes.push({name: file, size})
      }
    }

    fileSizes.sort((a, b) => b.size - a.size)

    console.log(Chalk.blueBright("\n📦 Bundle Size Analysis\n"))
    console.log(Chalk.green("Top 10 largest files:\n"))

    let totalSize = 0
    fileSizes.slice(0, 10).forEach((file, index) => {
      totalSize += file.size
      const sizeStr = formatBytes(file.size)
      const bar = "█".repeat(Math.floor((file.size / fileSizes[0].size) * 30))
      console.log(`${String(index + 1).padStart(2)}. ${Chalk.cyan(file.name.padEnd(50))} ${Chalk.yellow(sizeStr.padStart(10))} ${Chalk.gray(bar)}`)
    })

    const allTotal = fileSizes.reduce((sum, file) => sum + file.size, 0)
    console.log(Chalk.green(`\nTotal bundle size: ${Chalk.yellow(formatBytes(allTotal))}`))
    console.log(Chalk.gray(`Total files: ${fileSizes.length}\n`))

    // Warnings
    const largeFiles = fileSizes.filter((f) => f.size > 500 * 1024) // > 500KB
    if (largeFiles.length > 0) {
      console.log(Chalk.yellow("⚠️  Large files detected (>500KB):"))
      largeFiles.forEach((file) => {
        console.log(Chalk.yellow(`   - ${file.name}: ${formatBytes(file.size)}`))
      })
      console.log()
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(Chalk.red("❌ Build directory not found. Run 'pnpm build:compress' first."))
    } else {
      console.error(Chalk.red("Error analyzing bundle:"), error)
    }
    process.exit(1)
  }
}

analyzeBundle()
