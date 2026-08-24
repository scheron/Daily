import {mkdtempSync, rmSync, symlinkSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {pathToFileURL} from "node:url"
import {afterEach, describe, expect, it} from "vitest"

import {isCliEntryPoint} from "../src/index"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, {force: true, recursive: true})
})

describe("CLI entry point", () => {
  it("accepts the resolved npm bin symlink", () => {
    const directory = mkdtempSync(join(tmpdir(), "daily-cli-entrypoint-"))
    temporaryDirectories.push(directory)
    const entry = join(directory, "index.js")
    const npmBin = join(directory, "daily")
    writeFileSync(entry, "export {}\n")
    symlinkSync(entry, npmBin)

    expect(isCliEntryPoint(npmBin, pathToFileURL(entry).href)).toBe(true)
  })

  it("rejects a different executable", () => {
    const directory = mkdtempSync(join(tmpdir(), "daily-cli-entrypoint-"))
    temporaryDirectories.push(directory)
    const entry = join(directory, "index.js")
    const other = join(directory, "other.js")
    writeFileSync(entry, "export {}\n")
    writeFileSync(other, "export {}\n")

    expect(isCliEntryPoint(other, pathToFileURL(entry).href)).toBe(false)
  })

  it("rejects an empty entry path", () => {
    expect(isCliEntryPoint("", import.meta.url)).toBe(false)
  })
})
