export type ReleaseManifest = {
  version: string
  tag: string
  sha256: string
}

export function parseReleaseManifest(payload: unknown): ReleaseManifest | null {
  if (!payload || typeof payload !== "object" || !("version" in payload) || !("tag" in payload) || !("sha256" in payload)) return null

  const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
  const SHA256 = /^[a-f0-9]{64}$/
  const {version, tag, sha256} = payload
  if (typeof version !== "string" || !STABLE_VERSION.test(version) || !version.split(".").every((part) => Number.isSafeInteger(Number(part))))
    return null
  if (tag !== `v${version}` || typeof sha256 !== "string" || !SHA256.test(sha256)) return null

  return {version, tag, sha256}
}
