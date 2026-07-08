import fs from "fs-extra"

/**
 * Fetches the raw catalog JSON body over HTTPS with a timeout.
 * @throws if the request is aborted or the response status is not ok.
 */
export async function fetchRemoteCatalog(url: string, opts: {timeoutMs: number}): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs)
  try {
    const res = await fetch(url, {signal: controller.signal, headers: {Accept: "application/json"}})
    if (!res.ok) throw new Error(`Catalog fetch failed: HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

/** Reads the cached catalog string, or null if the cache file does not exist. */
export async function readCachedCatalog(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, "utf8")
  } catch {
    return null
  }
}

/** Writes the raw catalog string to the cache path, creating parent dirs. */
export async function writeCachedCatalog(path: string, raw: string): Promise<void> {
  await fs.outputFile(path, raw)
}
