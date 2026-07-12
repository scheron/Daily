import {mkdir, mkdtemp, readFile, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import path from "node:path"
import {beforeEach, describe, expect, it} from "vitest"

import {buildPathEntryChunk, ensurePathEntry, hasPathEntry} from "@main/utils/shell/pathEntry"

const HOME = "/Users/test"
const BIN_DIR = "/Users/test/.local/bin"
const ENTRY = `# Added by Daily\nexport PATH="/Users/test/.local/bin:$PATH"\n\n`

describe("hasPathEntry", () => {
  it("detects the absolute binDir form", () => {
    expect(hasPathEntry(`export PATH="/Users/test/.local/bin:$PATH"`, BIN_DIR, HOME)).toBe(true)
  })

  it("detects the $HOME form", () => {
    expect(hasPathEntry(`export PATH="$HOME/.local/bin:$PATH"`, BIN_DIR, HOME)).toBe(true)
  })

  it("detects the ${HOME} form", () => {
    expect(hasPathEntry(`export PATH="\${HOME}/.local/bin:$PATH"`, BIN_DIR, HOME)).toBe(true)
  })

  it("detects the tilde form", () => {
    expect(hasPathEntry(`export PATH=~/.local/bin:$PATH`, BIN_DIR, HOME)).toBe(true)
  })

  it("detects the legacy managed block", () => {
    const legacy = `# >>> Daily CLI >>>\nexport PATH="/Users/test/.local/bin:$PATH"\n# <<< Daily CLI <<<\n`
    expect(hasPathEntry(legacy, BIN_DIR, HOME)).toBe(true)
  })

  it("returns false for unrelated content", () => {
    expect(hasPathEntry(`alias ll="ls -la"\nexport EDITOR=vim\n`, BIN_DIR, HOME)).toBe(false)
  })

  it("returns false for empty content", () => {
    expect(hasPathEntry("", BIN_DIR, HOME)).toBe(false)
  })

  it("does not match a longer directory name", () => {
    expect(hasPathEntry(`export PATH="$HOME/.local/bin-old:$PATH"`, BIN_DIR, HOME)).toBe(false)
  })

  it("ignores commented-out lines", () => {
    expect(hasPathEntry(`# export PATH=$HOME/bin:$HOME/.local/bin:/usr/local/bin:$PATH\n`, BIN_DIR, HOME)).toBe(false)
    expect(hasPathEntry(`  # export PATH=~/.local/bin:$PATH\n`, BIN_DIR, HOME)).toBe(false)
  })

  it("still matches an active line that follows a comment", () => {
    expect(hasPathEntry(`# Added by Daily\nexport PATH="/Users/test/.local/bin:$PATH"\n`, BIN_DIR, HOME)).toBe(true)
  })
})

describe("buildPathEntryChunk", () => {
  it("builds a comment plus absolute-path export followed by a blank line", () => {
    expect(buildPathEntryChunk(null, BIN_DIR)).toBe(`# Added by Daily\nexport PATH="/Users/test/.local/bin:$PATH"\n\n`)
  })

  it("builds a chunk without leading newline for an empty file", () => {
    expect(buildPathEntryChunk("", BIN_DIR)).toBe(ENTRY)
  })

  it("prepends one newline when content ends with a newline", () => {
    expect(buildPathEntryChunk("alias ll='ls -la'\n", BIN_DIR)).toBe(`\n${ENTRY}`)
  })

  it("prepends two newlines when content does not end with a newline", () => {
    expect(buildPathEntryChunk("alias ll='ls -la'", BIN_DIR)).toBe(`\n\n${ENTRY}`)
  })
})

describe("ensurePathEntry", () => {
  let dir: string
  let profilePath: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "daily-path-entry-"))
    profilePath = path.join(dir, ".zshrc")
  })

  it("creates the profile with the entry when the file is missing", async () => {
    const result = await ensurePathEntry(profilePath, BIN_DIR, HOME)

    expect(result).toBe("appended")
    expect(await readFile(profilePath, "utf8")).toBe(ENTRY)
  })

  it("appends the entry keeping existing content byte-identical", async () => {
    const existing = `# my zshrc\nalias ll='ls -la'\n`
    await writeFile(profilePath, existing, "utf8")

    const result = await ensurePathEntry(profilePath, BIN_DIR, HOME)

    expect(result).toBe("appended")
    const content = await readFile(profilePath, "utf8")
    expect(content.startsWith(existing)).toBe(true)
    expect(content).toBe(`${existing}\n${ENTRY}`)
  })

  it("is a no-op when the profile already references binDir", async () => {
    const existing = `export PATH=~/.local/bin:$PATH\n`
    await writeFile(profilePath, existing, "utf8")

    const result = await ensurePathEntry(profilePath, BIN_DIR, HOME)

    expect(result).toBe("already-present")
    expect(await readFile(profilePath, "utf8")).toBe(existing)
  })

  it("is idempotent across two runs", async () => {
    await ensurePathEntry(profilePath, BIN_DIR, HOME)
    const afterFirst = await readFile(profilePath, "utf8")

    const second = await ensurePathEntry(profilePath, BIN_DIR, HOME)

    expect(second).toBe("already-present")
    expect(await readFile(profilePath, "utf8")).toBe(afterFirst)
  })

  it("throws on unreadable profile instead of assuming it is empty", async () => {
    const dirAsProfile = path.join(dir, "profile-dir")
    await mkdir(dirAsProfile)

    await expect(ensurePathEntry(dirAsProfile, BIN_DIR, HOME)).rejects.toThrow()
  })
})
