import {exec, spawn} from "child_process"
import fs from "fs/promises"
import path from "path"
import readline from "readline"
import chalk from "chalk"

const BRANCH = "main"

const flags = parseFlags(process.argv.slice(2))
const isNonInteractive = !!flags.version && !!flags.changelogFile

;(async () => {
  try {
    const branch = await run("git rev-parse --abbrev-ref HEAD")

    if (branch !== BRANCH) {
      console.error(chalk.red(`❌ Error: run from ${BRANCH} branch.`))
      process.exit(0)
    }

    const status = await run("git status --porcelain")
    if (status) {
      console.error(chalk.red(`❌ Error: there are uncommitted changes on ${BRANCH} branch.`))
      process.exit(0)
    }

    const cwd = process.cwd()
    const pkgPath = path.join(cwd, "package.json")
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"))
    const oldVersion = pkg.version
    const nextVersion = isNonInteractive ? flags.version : await promptVersion(oldVersion)

    if (!isValidVersion(nextVersion)) {
      console.error(chalk.red(`❌ Error: invalid version format: ${nextVersion}`))
      process.exit(0)
    }

    const changelogPath = path.join(cwd, "CHANGELOG.md")
    let changelog = ""
    try {
      changelog = await fs.readFile(changelogPath, "utf8")
    } catch {
      changelog = "# Changelog\n\n"
    }

    const newSection = isNonInteractive ? await loadCuratedSection(flags.changelogFile, nextVersion) : await buildAutoSection(nextVersion)

    changelog = insertSection(changelog, newSection)
    await fs.writeFile(changelogPath, changelog, "utf8")

    if (!isNonInteractive) {
      console.log(chalk.cyan("Opening CHANGELOG.md for editing..."))
      await openEditor(changelogPath)

      const confirm = await question(chalk.cyan("Continue with this release description? (y/n/q): "))
      if (confirm !== "y") {
        console.log(chalk.yellow("❌ Release aborted"))
        process.exit(0)
      }
    }

    pkg.version = nextVersion
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n")

    await run(`git add package.json CHANGELOG.md`)
    await run(`git commit -m "release: v${nextVersion}"`)

    await run(`git tag v${nextVersion}`)

    await Promise.all([run(`git push origin ${BRANCH}`), run(`git push origin v${nextVersion}`)])

    console.log(chalk.green(`🚀 Released v${nextVersion}`))
  } catch (error) {
    console.error(chalk.red("❌ Error during release:"), error)
    process.exit(0)
  }
})()

/**
 * Parse CLI args. Supports `--version=X.Y.Z` / `--version X.Y.Z` and
 * `--changelog-file=path.md` / `--changelog-file path.md`. When both are
 * present the script runs non-interactively (no prompts, no editor).
 */
function parseFlags(argv) {
  const out = {version: null, changelogFile: null}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const [key, inlineValue] = arg.includes("=") ? arg.split("=") : [arg, null]
    const value = inlineValue ?? argv[i + 1]
    if (key === "--version") {
      out.version = value
      if (!inlineValue) i++
    } else if (key === "--changelog-file") {
      out.changelogFile = value
      if (!inlineValue) i++
    }
  }
  return out
}

async function promptVersion(oldVersion) {
  let nextVersion = incrementPatchVersion(oldVersion)
  const ans = await question(chalk.cyan(`Current version is ${oldVersion}. Bump to ${nextVersion}? (y/n/q): `))
  if (ans !== "y") {
    const custom = await question(chalk.cyan(`Enter desired version (current: v${oldVersion}) or 'q' to quit: `))
    nextVersion = custom
  }
  return nextVersion
}

async function buildAutoSection(nextVersion) {
  const lastTag = await getLastTag()
  const commits = await getCommitMessagesSinceLastTag(lastTag)
  const date = new Date().toISOString().split("T")[0]
  return `## v${nextVersion} - ${date}\n\n${commits}\n\n`
}

/**
 * Load a pre-curated release section from a file. The file may contain the
 * full section (with `## v...` header) or just the body — both are accepted,
 * a missing header is added automatically using nextVersion + today's date.
 * A trailing `---` separator is appended if missing, to match project style.
 */
async function loadCuratedSection(filePath, nextVersion) {
  const date = new Date().toISOString().split("T")[0]
  let body = (await fs.readFile(filePath, "utf8")).trim()

  const headerRe = new RegExp(`^## v[\\d.]+(?:-[\\w.-]+)?(?:\\+[\\w.-]+)? - \\d{4}-\\d{2}-\\d{2}`, "m")
  if (!headerRe.test(body)) {
    body = `## v${nextVersion} - ${date}\n\n${body}`
  }
  if (!body.endsWith("---")) {
    body = `${body}\n\n---`
  }
  return `${body}\n\n`
}

/**
 * Insert the new release section into the changelog. Replaces the
 * `## [Unreleased]` placeholder block if present (anything between
 * `## [Unreleased]` and the next `## ` heading), otherwise inserts right
 * after the `# Changelog` heading.
 */
function insertSection(changelog, newSection) {
  const unreleasedRe = /## \[Unreleased\][\s\S]*?(?=\n## |$)/
  if (unreleasedRe.test(changelog)) {
    return changelog.replace(unreleasedRe, newSection.trim())
  }
  return changelog.replace("# Changelog\n", `# Changelog\n\n${newSection}`)
}

function question(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  return new Promise((resolve) =>
    rl.question(prompt, (answer) => {
      rl.close()
      const trimmed = answer.trim().toLowerCase()
      if (trimmed === "q") {
        console.log(chalk.yellow("Release cancelled"))
        process.exit(0)
      }
      resolve(trimmed)
    }),
  )
}

async function run(cmd, exitOnError = true) {
  console.log(chalk.gray(`Running: ${cmd}`))
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error && exitOnError) {
        console.error(chalk.red(`Command failed: ${cmd}`))
        process.exit(0)
      }
      resolve(stdout.trim())
    })
  })
}

async function getLastTag() {
  try {
    return await run("git describe --tags --abbrev=0", false)
  } catch {
    console.log(chalk.yellow("No tags found."))
    return null
  }
}

async function getCommitMessagesSinceLastTag(lastTag) {
  const range = lastTag ? `${lastTag}..HEAD` : "HEAD"
  return await run(`git log ${range} --pretty=format:"- %s" --no-merges`)
}

function incrementPatchVersion(version) {
  const parts = version.split(".")
  const patch = parseInt(parts[2]) + 1
  return `${parts[0]}.${parts[1]}.${patch}`
}

function isValidVersion(version) {
  return /^(\d+)\.(\d+)\.(\d+)(?:-([\w-]+(?:\.[\w-]+)*))?(?:\+([\w-]+(?:\.[\w-]+)*))?$/.test(version)
}

async function openEditor(filePath) {
  return new Promise((resolve, reject) => {
    const editor = process.env.EDITOR || "vim" || "vi"
    const child = spawn(editor, [filePath], {stdio: "inherit"})

    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Editor exited with code ${code}`))
      }
    })
  })
}
