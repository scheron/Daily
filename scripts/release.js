import {exec, spawn} from "child_process"
import fs from "fs/promises"
import path from "path"
import readline from "readline"
import chalk from "chalk"

const BRANCH = "main"

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
    let nextVersion = incrementPatchVersion(oldVersion)

    const ans = await question(chalk.cyan(`Current version is ${oldVersion}. Bump to ${nextVersion}? (y/n/q): `))

    if (ans !== "y") {
      const custom = await question(chalk.cyan(`Enter desired version (current: v${oldVersion}) or 'q' to quit: `))

      if (!isValidVersion(custom)) {
        console.error(chalk.red("❌ Error: invalid version format."))
        process.exit(0)
      }

      nextVersion = custom
    }

    const changelogPath = path.join(cwd, "CHANGELOG.md")
    let changelog = ""
    try {
      changelog = await fs.readFile(changelogPath, "utf8")
    } catch {
      changelog = "# Changelog\n\n"
    }

    const lastTag = await getLastTag()
    const commits = await getCommitMessagesSinceLastTag(lastTag)

    const date = new Date().toISOString().split("T")[0]
    const newSection = `## v${nextVersion} - ${date}\n\n${commits}\n\n`

    changelog = changelog.replace("# Changelog\n", `# Changelog\n\n${newSection}`)
    await fs.writeFile(changelogPath, changelog, "utf8")

    console.log(chalk.cyan("Opening CHANGELOG.md for editing..."))
    await openEditor(changelogPath)

    const confirm = await question(chalk.cyan("Continue with this release description? (y/n/q): "))

    if (confirm !== "y") {
      console.log(chalk.yellow("❌ Release aborted"))
      process.exit(0)
    }

    pkg.version = nextVersion
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n")

    await run(`git add package.json CHANGELOG.md`)
    await run(`git commit -m "release: v${nextVersion}"`)

    const releaseBody = await fs.readFile(changelogPath, "utf8")
    await run(`git tag -a v${nextVersion} -m "${releaseBody.replace(/"/g, '\"')}"`)

    await Promise.all([run(`git push origin ${BRANCH}`), run(`git push origin v${nextVersion}`)])

    console.log(chalk.green(`🚀 Released v${nextVersion}`))
  } catch (error) {
    console.error(chalk.red("❌ Error during release:"), error)
    process.exit(0)
  }
})()

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
