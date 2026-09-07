import {exec, spawn} from "child_process"
import fs from "fs/promises"
import path from "path"
import readline from "readline"
import chalk from "chalk"

const BRANCH = "main"

const ARTIFACTS = {
  app: {
    label: "desktop",
    manifestPath: "apps/desktop/package.json",
    tagPrefix: "v",
    commitPrefix: "release: v",
    hasChangelog: true,
    paths: ["apps/desktop", "packages/core", "packages/protocol", "packages/std"],
  },
  server: {
    label: "server",
    manifestPath: "apps/server/package.json",
    tagPrefix: "server-v",
    commitPrefix: "release: server-v",
    hasChangelog: false,
    paths: ["apps/server", "packages/protocol", "Dockerfile", "deploy"],
  },
}

const USAGE = `usage: node scripts/release.js [app|server] [--status] [--dry-run] [--version=X.Y.Z] [--changelog-file=path]`

const flags = parseFlags(process.argv.slice(2))

if (flags.artifact && !ARTIFACTS[flags.artifact]) {
  console.error(chalk.red(`❌ Error: unknown artifact "${flags.artifact}". ${USAGE}`))
  process.exit(0)
}

;(async () => {
  try {
    const statuses = await surveyArtifacts()
    printSurvey(statuses)

    if (flags.status) return

    const branch = await run("git rev-parse --abbrev-ref HEAD")

    if (!flags.dryRun && branch !== BRANCH) {
      console.error(chalk.red(`❌ Error: run from ${BRANCH} branch.`))
      process.exit(0)
    }

    const status = await run("git status --porcelain")
    if (status) {
      console.error(chalk.red(`❌ Error: there are uncommitted changes on ${BRANCH} branch.`))
      process.exit(0)
    }

    const queue = flags.artifact ? [flags.artifact] : await pickArtifacts(statuses)

    if (!queue.length) {
      console.log(chalk.yellow("Nothing selected — no release cut."))
      return
    }

    if (flags.artifact) warnAboutUnreleased(statuses, flags.artifact)

    for (const key of queue) {
      await releaseArtifact(key, statuses[key])
    }
  } catch (error) {
    console.error(chalk.red("❌ Error during release:"), error)
    process.exit(0)
  }
})()

/**
 * Read every artifact's released version, its own last tag, and how many
 * commits have touched its paths since that tag. Each artifact is measured
 * against tags of its own prefix, so releasing one never shifts the other's
 * baseline.
 */
async function surveyArtifacts() {
  const entries = await Promise.all(
    Object.entries(ARTIFACTS).map(async ([key, artifact]) => {
      const pkg = JSON.parse(await fs.readFile(path.join(process.cwd(), artifact.manifestPath), "utf8"))
      const lastTag = await lastTagFor(artifact.tagPrefix)
      const pending = await countPendingCommits(lastTag, artifact.paths)
      return [key, {key, artifact, version: pkg.version, lastTag, pending}]
    }),
  )
  return Object.fromEntries(entries)
}

function printSurvey(statuses) {
  console.log(chalk.bold("\nRelease status\n"))

  for (const {artifact, version, lastTag, pending} of Object.values(statuses)) {
    const name = artifact.label.padEnd(10)
    const current = String(version).padEnd(10)
    const detail = pending
      ? chalk.yellow(`${pending} unreleased commit${pending === 1 ? "" : "s"} since ${lastTag ?? "the beginning"}`)
      : chalk.gray(`up to date (${lastTag ?? "never released"})`)
    console.log(`  ${name}${current}${detail}`)
  }

  console.log("")
}

async function pickArtifacts(statuses) {
  const pending = Object.values(statuses).filter((status) => status.pending)

  if (!pending.length) {
    console.log(chalk.gray("Every artifact is up to date with its last tag."))
    return []
  }

  const selected = []

  for (const status of pending) {
    const next = incrementPatchVersion(status.version)
    const ans = await question(chalk.cyan(`Release ${status.artifact.label} ${status.version} -> ${next} or higher? (y/n/q): `))
    if (ans === "y") selected.push(status.key)
  }

  return selected
}

function warnAboutUnreleased(statuses, releasingKey) {
  for (const status of Object.values(statuses)) {
    if (status.key === releasingKey || !status.pending) continue

    const plural = status.pending === 1 ? "" : "s"
    const since = status.lastTag ?? "the beginning"
    console.log(
      chalk.yellow(`⚠️  ${status.artifact.label} also has ${status.pending} unreleased commit${plural} since ${since} — not part of this release.`),
    )
  }
}

async function releaseArtifact(key, status) {
  const {artifact, version: oldVersion} = status
  const cwd = process.cwd()
  const pkgPath = path.join(cwd, artifact.manifestPath)
  const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"))
  const isNonInteractive = artifact.hasChangelog ? !!flags.version && !!flags.changelogFile : !!flags.version

  let nextVersion
  if (flags.dryRun) {
    nextVersion = flags.version || incrementPatchVersion(oldVersion)
  } else if (isNonInteractive) {
    nextVersion = flags.version
  } else {
    nextVersion = await promptVersion(oldVersion)
  }

  if (!isValidVersion(nextVersion)) {
    console.error(chalk.red(`❌ Error: invalid version format: ${nextVersion}`))
    process.exit(0)
  }

  const changelogPath = path.join(cwd, "CHANGELOG.md")
  let newSection = null

  if (artifact.hasChangelog) {
    let changelog = ""
    try {
      changelog = await fs.readFile(changelogPath, "utf8")
    } catch {
      changelog = "# Changelog\n\n"
    }

    newSection = flags.changelogFile
      ? await loadCuratedSection(flags.changelogFile, nextVersion)
      : await buildAutoSection(nextVersion, status.lastTag)

    if (!flags.dryRun) {
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
    }
  }

  const tag = `${artifact.tagPrefix}${nextVersion}`
  const commitMessage = `${artifact.commitPrefix}${nextVersion}`

  if (flags.dryRun) {
    console.log(chalk.cyan(`Dry run for ${key}:`))
    console.log(chalk.cyan(`  manifest: ${artifact.manifestPath}`))
    console.log(chalk.cyan(`  version:  ${oldVersion} -> ${nextVersion}`))
    console.log(chalk.cyan(`  since:    ${status.lastTag ?? "the beginning"} (${status.pending} commit${status.pending === 1 ? "" : "s"})`))
    if (artifact.hasChangelog) {
      console.log(chalk.cyan("  changelog section:"))
      console.log(newSection)
    }
    console.log(chalk.cyan(`  tag:      ${tag}`))
    console.log(chalk.cyan(`  commit:   ${commitMessage}`))
    console.log(chalk.yellow("Dry run: no file written, no commit, no tag, no push."))
    return
  }

  pkg.version = nextVersion
  await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n")

  const filesToAdd = artifact.hasChangelog ? `${artifact.manifestPath} CHANGELOG.md` : artifact.manifestPath
  await run(`git add ${filesToAdd}`)
  await run(`git commit -m "${commitMessage}"`)

  await run(`git tag ${tag}`)

  await Promise.all([run(`git push origin ${BRANCH}`), run(`git push origin ${tag}`)])

  console.log(chalk.green(`🚀 Released ${tag}`))
}

/**
 * Parse CLI args. The first positional argument optionally names one artifact,
 * `app` or `server`; with none, the script surveys both and asks which to cut.
 * Also supports `--status` (survey and exit), `--dry-run`, and
 * `--version=X.Y.Z` / `--version X.Y.Z` and `--changelog-file=path.md` /
 * `--changelog-file path.md`. When an artifact is named and both `--version`
 * and `--changelog-file` are present (or just `--version` for an artifact with
 * no changelog) the script runs non-interactively (no prompts, no editor).
 */
function parseFlags(argv) {
  const out = {artifact: null, status: false, dryRun: false, version: null, changelogFile: null}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--dry-run") {
      out.dryRun = true
      continue
    }
    if (arg === "--status") {
      out.status = true
      continue
    }
    if (!arg.startsWith("--")) {
      out.artifact = out.artifact ?? arg
      continue
    }
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

async function buildAutoSection(nextVersion, lastTag) {
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

/**
 * The most recent tag carrying this artifact's own prefix. Matching on the
 * prefix is what keeps `server-v0.1.0` from becoming the app's baseline.
 */
async function lastTagFor(tagPrefix) {
  const tag = await run(`git describe --tags --abbrev=0 --match '${tagPrefix}[0-9]*' HEAD`, false)
  return tag || null
}

async function countPendingCommits(lastTag, paths) {
  const range = lastTag ? `${lastTag}..HEAD` : "HEAD"
  const commits = await run(`git log ${range} --no-merges --pretty=format:%h -- ${paths.join(" ")}`, false)
  return commits ? commits.split("\n").length : 0
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
