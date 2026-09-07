import {spawnSync} from "node:child_process"
import {chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {afterAll, beforeAll, describe, expect, it} from "vitest"
import {parse as parseYaml} from "yaml"

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const installScriptPath = join(rootDir, "deploy", "install.sh")

type ComposeService = {
  ports?: unknown[]
  expose?: unknown[]
  networks?: unknown
  healthcheck?: {test?: unknown}
}
type ComposeFile = {
  services?: Record<string, ComposeService>
  networks?: Record<string, {external?: boolean} | null>
}

type InstallResult = {
  status: number | null
  stdout: string
  stderr: string
  dir: string
  stubDir: string
  composePath: string
  envPath: string
  dailyShPath: string
  caddyfilePath: string
}

/**
 * A `docker` on PATH ahead of the real one that refuses to run, so any accidental invocation
 * during `--dry-run` fails loudly instead of silently doing nothing (or, worse, something).
 */
function poisonedDockerEnv(stubDir: string): NodeJS.ProcessEnv {
  const stubPath = join(stubDir, "docker")
  writeFileSync(stubPath, '#!/bin/sh\necho "docker should not run under --dry-run: $*" >&2\nexit 17\n')
  chmodSync(stubPath, 0o755)
  return {...process.env, PATH: `${stubDir}:${process.env.PATH ?? ""}`}
}

function runInstall(args: string[]): InstallResult {
  const dir = mkdtempSync(join(tmpdir(), "daily-install-"))
  const stubDir = mkdtempSync(join(tmpdir(), "daily-install-stub-"))

  const result = spawnSync("sh", [installScriptPath, ...args, "--dir", dir, "--dry-run"], {
    encoding: "utf-8",
    env: poisonedDockerEnv(stubDir),
  })

  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    dir,
    stubDir,
    composePath: join(dir, "compose.yaml"),
    envPath: join(dir, ".env"),
    dailyShPath: join(dir, "daily.sh"),
    caddyfilePath: join(dir, "Caddyfile"),
  }
}

function readIfExists(path: string): string | null {
  try {
    return readFileSync(path, "utf-8")
  } catch {
    return null
  }
}

function referencesNetwork(serviceNetworks: unknown, name: string): boolean {
  if (Array.isArray(serviceNetworks)) return serviceNetworks.includes(name)
  if (serviceNetworks && typeof serviceNetworks === "object") return Object.keys(serviceNetworks).includes(name)
  return false
}

describe("deploy/install.sh --dry-run", () => {
  let caddyInstall: InstallResult
  let selfSignedInstall: InstallResult
  let noProxyInstall: InstallResult

  beforeAll(() => {
    caddyInstall = runInstall(["--domain", "daily.example.com"])
    selfSignedInstall = runInstall(["--ip", "203.0.113.10"])
    noProxyInstall = runInstall(["--domain", "daily.example.com", "--no-proxy"])
  }, 30000)

  afterAll(() => {
    for (const install of [caddyInstall, selfSignedInstall, noProxyInstall]) {
      if (!install) continue
      rmSync(install.dir, {recursive: true, force: true})
      rmSync(install.stubDir, {recursive: true, force: true})
    }
  })

  it("TC-7: a domain writes compose.yaml with daily-server and caddy, a Caddyfile proxying to daily-server:8787, and a .env with the https public URL and no TLS variable — nothing started", () => {
    expect(caddyInstall.status, `install.sh did not exit 0 (docker may have been invoked): ${caddyInstall.stderr}`).toBe(0)

    const compose = readIfExists(caddyInstall.composePath)
    expect(compose, "compose.yaml").not.toBeNull()
    const parsed = parseYaml(compose as string) as ComposeFile
    expect(Object.keys(parsed.services ?? {}).sort()).toEqual(["caddy", "daily-server"])

    const caddyfile = readIfExists(caddyInstall.caddyfilePath)
    expect(caddyfile, "Caddyfile").not.toBeNull()
    expect(caddyfile).toMatch(/daily\.example\.com\s*\{/)
    expect(caddyfile).toContain("reverse_proxy daily-server:8787")

    const env = readIfExists(caddyInstall.envPath)
    expect(env, ".env").not.toBeNull()
    expect(env).toContain("DAILY_SERVER_PUBLIC_URL=https://daily.example.com")
    expect(env).not.toContain("DAILY_SERVER_TLS")
  })

  it("TC-8: an IP writes a compose.yaml with no caddy service and 443:8787 published, and a .env with the self-signed TLS mode and the https IP public URL; no Caddyfile", () => {
    expect(selfSignedInstall.status, `install.sh did not exit 0 (docker may have been invoked): ${selfSignedInstall.stderr}`).toBe(0)

    const compose = readIfExists(selfSignedInstall.composePath)
    expect(compose, "compose.yaml").not.toBeNull()
    const parsed = parseYaml(compose as string) as ComposeFile
    expect(parsed.services ?? {}).not.toHaveProperty("caddy")

    const daily = (parsed.services ?? {})["daily-server"]
    expect((daily?.ports ?? []).map(String)).toContain("443:8787")

    const env = readIfExists(selfSignedInstall.envPath)
    expect(env, ".env").not.toBeNull()
    expect(env).toContain("DAILY_SERVER_TLS=self-signed")
    expect(env).toContain("DAILY_SERVER_PUBLIC_URL=https://203.0.113.10")

    expect(readIfExists(selfSignedInstall.caddyfilePath), "no Caddyfile should be written for the self-signed topology").toBeNull()
  })

  it("TC-9: a domain with --no-proxy writes a compose.yaml with no caddy service, no published host port, expose 8787 and a project-owned daily network, and a .env with the domain public URL and no TLS variable", () => {
    expect(noProxyInstall.status, `install.sh did not exit 0 (docker may have been invoked): ${noProxyInstall.stderr}`).toBe(0)

    const compose = readIfExists(noProxyInstall.composePath)
    expect(compose, "compose.yaml").not.toBeNull()
    const parsed = parseYaml(compose as string) as ComposeFile
    expect(parsed.services ?? {}).not.toHaveProperty("caddy")

    const daily = (parsed.services ?? {})["daily-server"]
    expect(daily?.ports ?? []).toHaveLength(0)
    expect((daily?.expose ?? []).map(String)).toContain("8787")
    expect(referencesNetwork(daily?.networks, "daily")).toBe(true)

    expect(Object.keys(parsed.networks ?? {})).toContain("daily")
    expect(parsed.networks?.daily?.external, "the daily network must be declared by this project, never external: true").not.toBe(true)

    const env = readIfExists(noProxyInstall.envPath)
    expect(env, ".env").not.toBeNull()
    expect(env).toContain("DAILY_SERVER_PUBLIC_URL=https://daily.example.com")
    expect(env).not.toContain("DAILY_SERVER_TLS")
  })

  it('TC-10: each of the three compose.yaml files parses as YAML, and each daily-server healthcheck test is the CMD form ["CMD", "daily-server", "healthcheck"] — no inline node -e script survives anywhere', () => {
    for (const install of [caddyInstall, selfSignedInstall, noProxyInstall]) {
      const compose = readIfExists(install.composePath)
      expect(compose, `compose.yaml (${install.dir})`).not.toBeNull()

      const parsed = parseYaml(compose as string) as ComposeFile
      const daily = (parsed.services ?? {})["daily-server"]
      expect(daily?.healthcheck?.test, `daily-server healthcheck test (${install.dir})`).toEqual(["CMD", "daily-server", "healthcheck"])

      expect(compose, `compose.yaml should not contain an inline node -e script (${install.dir})`).not.toContain("node -e")
      expect(compose, `compose.yaml should not contain --no-warnings (${install.dir})`).not.toContain("--no-warnings")
    }
  })

  it("TC-11: daily.sh with no arguments exits non-zero and lists the eight management verbs, and never a restore verb", () => {
    const result = spawnSync("sh", [caddyInstall.dailyShPath], {encoding: "utf-8"})

    expect(result.status, `daily.sh with no arguments exited 0; stdout: ${result.stdout}; stderr: ${result.stderr}`).not.toBe(0)

    const output = `${result.stdout}\n${result.stderr}`
    for (const verb of ["status", "logs", "claim-code", "upgrade", "backup", "restart", "stop", "uninstall"]) {
      expect(output, `daily.sh usage should list "${verb}"`).toContain(verb)
    }

    expect(output, "daily.sh should not offer a restore verb — restoring stays a documented manual step").not.toContain("restore")
  })

  it("daily.sh backup stops the service, copies the data directory out with docker compose cp, then archives it and restarts — without sqlite3", () => {
    const content = readIfExists(caddyInstall.dailyShPath) as string
    expect(content, "daily.sh").not.toBeNull()

    expect(content, "backup must not shell out to sqlite3 — the copy is taken with the service stopped").not.toContain("sqlite3")
    expect(content).toContain("docker compose -f")
    expect(content).toContain("compose cp daily-server:/var/lib/daily-server")
    expect(content).toContain("tar -czf")
    expect(content).toMatch(/daily-backup-.*\.tar\.gz/)

    expect(content, "the archive must not be world-readable — it holds the database").toContain("umask 077")
    expect(content, "a failed backup must not leave the service stopped").toMatch(/trap .*compose up -d daily-server.* EXIT/)

    const stopIndex = content.indexOf("compose stop daily-server")
    const cpIndex = content.indexOf("compose cp daily-server:/var/lib/daily-server")
    const upIndex = content.lastIndexOf("compose up -d daily-server")
    expect(stopIndex, "backup should stop the service before copying its data").toBeGreaterThan(-1)
    expect(cpIndex, "the copy should happen after the stop").toBeGreaterThan(stopIndex)
    expect(upIndex, "the service should come back up after the copy").toBeGreaterThan(cpIndex)
  })

  it("daily.sh upgrade pulls the newer image and brings the service back up, and status/claim-code delegate to the server's own commands", () => {
    const content = readIfExists(caddyInstall.dailyShPath) as string
    expect(content, "daily.sh").not.toBeNull()

    expect(content).toContain("compose pull daily-server")
    expect(content).toContain("compose up -d daily-server")
    expect(content).toContain("compose exec -T daily-server daily-server status")
    expect(content).toContain("compose exec -T daily-server daily-server claim-code")
  })

  it("daily.sh upgrade refreshes the management script itself, and never fails the upgrade when it cannot", () => {
    const content = readIfExists(caddyInstall.dailyShPath) as string
    expect(content, "daily.sh").not.toBeNull()

    expect(content, "upgrade should refresh the script after the image").toMatch(/compose up -d daily-server\n\s*refresh_self/)
    expect(content, "the refresh needs the published install.sh").toContain("raw.githubusercontent.com/scheron/Daily/main/deploy/install.sh")
    expect(content, "a missing curl must not fail the upgrade").toMatch(/command -v curl .* \|\| return 0/)
    expect(content, "a failed fetch must not fail the upgrade").toMatch(/if curl [^\n]*&&[^\n]*--write-manager/)
  })

  it("install.sh --write-manager rewrites daily.sh atomically and refuses a directory that is not an installation", () => {
    const script = readFileSync(join(rootDir, "deploy/install.sh"), "utf-8")

    expect(script, "the running daily.sh replaces itself, so the write must not truncate it in place").toMatch(
      /mv "\$1\/\.daily\.sh\.new" "\$1\/daily\.sh"/,
    )
    expect(script, "--write-manager must refuse a directory holding no compose.yaml").toMatch(/compose\.yaml.*\n.*not an installation/)
  })

  it("daily.sh uninstall asks before removing volumes and keeps them on the default answer", () => {
    const content = readIfExists(caddyInstall.dailyShPath) as string
    expect(content, "daily.sh").not.toBeNull()

    const uninstallMatch = content.match(/cmd_uninstall\(\) \{[\s\S]*?\n\}/)
    expect(uninstallMatch, "cmd_uninstall function").not.toBeNull()
    const uninstallBlock = (uninstallMatch as RegExpMatchArray)[0]

    expect(uninstallBlock).toMatch(/\[y\/N\]/)

    const yesBranch = uninstallBlock.match(/\[yY\]\*\)([\s\S]*?);;/)
    expect(yesBranch, "the explicit-yes branch").not.toBeNull()
    expect((yesBranch as RegExpMatchArray)[1]).toContain("compose down -v")

    const defaultBranch = uninstallBlock.match(/\n\s*\*\)\s*\n([\s\S]*?);;/)
    expect(defaultBranch, "the default branch").not.toBeNull()
    expect((defaultBranch as RegExpMatchArray)[1], "volumes must not be removed on the default answer").not.toContain("-v")
    expect((defaultBranch as RegExpMatchArray)[1]).toContain("compose down")
  })
})
