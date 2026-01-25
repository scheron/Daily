import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import readline from "readline"
import chalk from "chalk"
import PouchDB from "pouchdb"

/**
 * Get database path based on platform
 */
function getDbPath() {
  const platform = os.platform()
  const home = os.homedir()

  let appDataPath

  if (platform === "darwin") {
    appDataPath = path.join(home, "Library", "Application Support", "Daily")
  } else if (platform === "win32") {
    appDataPath = path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Daily")
  } else {
    appDataPath = path.join(home, ".config", "Daily")
  }

  return path.join(appDataPath, "db")
}

/**
 * Ask user for confirmation
 */
function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes")
    })
  })
}

/**
 * Main function
 */
async function main() {
  try {
    const dbPath = getDbPath()

    console.log(chalk.red.bold("\n⚠️  Clearing Daily database\n"))
    console.log(chalk.gray(`Database path: ${dbPath}\n`))

    if (!fs.existsSync(dbPath)) {
      console.log(chalk.yellow("Database not found, nothing to delete."))
      return
    }

    try {
      const db = new PouchDB(dbPath)
      const result = await db.allDocs({})

      console.log(chalk.cyan(`📊 Found documents: ${result.total_rows}\n`))

      await db.close()
    } catch (error) {
      console.log(chalk.yellow("Failed to read database statistics\n"))
    }

    const forceMode = process.argv.includes("--force") || process.argv.includes("-f")

    if (!forceMode) {
      console.log(chalk.red.bold("⚠️  WARNING: This action is irreversible!"))
      console.log(chalk.red("All tasks, tags, settings and files will be deleted.\n"))

      const confirmed = await askConfirmation(chalk.yellow("Are you sure? (y/N): "))

      if (!confirmed) {
        console.log(chalk.gray("\n✋ Operation cancelled"))
        return
      }
      console.log()
    }

    console.log(chalk.blue("🗑️  Deleting database..."))

    const db = new PouchDB(dbPath)
    await db.destroy()

    console.log(chalk.green("✅ Database successfully cleared!"))
    console.log(chalk.gray("\nA new empty database will be created on the next application launch.\n"))
  } catch (error) {
    console.error(chalk.red("❌ Error:"), error)
    process.exit(1)
  }
}

main()
