import {appendFile, readFile} from "node:fs/promises"

/**
 * Checks whether shell profile content already references the CLI bin directory
 * in any common spelling: absolute, `$HOME`/`${HOME}`-relative, or `~`-relative.
 *
 * @param content Shell profile content.
 * @param binDir Absolute path to the CLI bin directory.
 * @param home Absolute path to the user's home directory.
 * @example
 * hasPathEntry(`export PATH="$HOME/.local/bin:$PATH"`, "/Users/me/.local/bin", "/Users/me") // true
 */
export function hasPathEntry(content: string, binDir: string, home: string): boolean {
  const variants = [escapeRegExp(binDir)]
  const relative = relativeToHome(binDir, home)

  if (relative !== null) {
    variants.push(`\\$\\{?HOME\\}?${escapeRegExp(relative)}`, `~${escapeRegExp(relative)}`)
  }

  const pattern = new RegExp(`(?:${variants.join("|")})(?![\\w./-])`)
  return content
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .some((line) => pattern.test(line))
}

/**
 * Builds the text chunk to append to a shell profile so that `binDir` lands on PATH:
 * a `# Added by Daily` comment, an absolute-path export, and a trailing blank line.
 * The chunk only ever gets appended after the existing content — it never replaces it.
 *
 * @param content Current profile content, or `null` when the file does not exist.
 * @param binDir Absolute path to the CLI bin directory.
 * @example
 * buildPathEntryChunk(null, "/Users/me/.local/bin")
 * // '# Added by Daily\nexport PATH="/Users/me/.local/bin:$PATH"\n\n'
 */
export function buildPathEntryChunk(content: string | null, binDir: string): string {
  const entry = `# Added by Daily\nexport PATH="${binDir}:$PATH"\n\n`

  if (!content) return entry
  return content.endsWith("\n") ? `\n${entry}` : `\n\n${entry}`
}

/**
 * Ensures the shell profile puts `binDir` on PATH, using strictly additive writes.
 * Existing content is never rewritten: the profile is only appended to (`appendFile`),
 * and a read failure other than ENOENT aborts instead of treating the file as empty.
 *
 * @param profilePath Absolute path to the shell profile (e.g. `~/.zshrc`).
 * @param binDir Absolute path to the CLI bin directory.
 * @param home Absolute path to the user's home directory.
 */
export async function ensurePathEntry(profilePath: string, binDir: string, home: string): Promise<"appended" | "already-present"> {
  let content: string | null = null

  try {
    content = await readFile(profilePath, "utf8")
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
  }

  if (content !== null && hasPathEntry(content, binDir, home)) return "already-present"

  await appendFile(profilePath, buildPathEntryChunk(content, binDir), "utf8")
  return "appended"
}

function relativeToHome(binDir: string, home: string): string | null {
  if (binDir === home) return ""
  const prefix = home.endsWith("/") ? home : `${home}/`
  return binDir.startsWith(prefix) ? binDir.slice(prefix.length - 1) : null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
