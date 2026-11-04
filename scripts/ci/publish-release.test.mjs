import assert from "node:assert/strict"
import {spawnSync} from "node:child_process"
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {delimiter, join} from "node:path"
import {test} from "node:test"
import {fileURLToPath} from "node:url"

const publisher = fileURLToPath(new URL("publish-release.mjs", import.meta.url))

const mockGh = String.raw`#!/usr/bin/env node
import {createHash} from "node:crypto"
import {readFileSync, writeFileSync} from "node:fs"
import {basename} from "node:path"

const [command, subcommand, ...args] = process.argv.slice(2)
const statePath = process.env.GH_MOCK_STATE
const state = JSON.parse(readFileSync(statePath, "utf8"))
const save = () => writeFileSync(statePath, JSON.stringify(state))
const fail = (message) => {
  console.error(message)
  process.exit(1)
}
const flag = (name) => args[args.indexOf(name) + 1]

if (command === "api" && subcommand.endsWith("/releases?per_page=100")) {
  console.log(JSON.stringify([state.releases.slice(0, 1), state.releases.slice(1)]))
} else if (command === "api" && subcommand.endsWith("/releases/latest")) {
  console.log(state.latest)
} else if (command === "release" && subcommand === "create" && args.includes("--draft")) {
  const [tag_name] = args
  if (state.releases.some((release) => release.tag_name === tag_name)) fail("Release already exists")
  state.releases.push({id: state.releases.length + 1, tag_name, draft: true, prerelease: false, assets: []})
  save()
} else if (command === "release" && subcommand === "upload") {
  const release = state.releases.find((item) => item.tag_name === args[0])
  if (!release?.draft) fail("Expected a draft release")
  for (const file of args.slice(1).filter((arg) => !arg.startsWith("--"))) {
    const name = basename(file)
    if (state.failAsset === name) fail("Upload failed for " + name)
    const index = release.assets.findIndex((asset) => asset.name === name)
    if (index !== -1) {
      if (!args.includes("--clobber")) fail("Asset already exists")
      release.assets.splice(index, 1)
    }
    const bytes = state.corruptAsset === name ? "different bytes" : readFileSync(file, "utf8")
    const digest = "sha256:" + createHash("sha256").update(bytes).digest("hex")
    release.assets.push({name, bytes, digest, state: "uploaded"})
    save()
  }
} else if (command === "api" && flag("--method") === "PATCH") {
  const release = state.releases.find((item) => item.id === Number(subcommand.split("/").at(-1)))
  if (!release?.draft) fail("Expected to publish a draft release")
  if (!args.includes("draft=false") || !args.includes("prerelease=false")) fail("Expected stable publication")
  if (release.assets.length !== 2) fail("Expected two assets before publication")
  release.draft = false
  if (!args.includes("make_latest=false")) state.latest = release.tag_name
  save()
} else if (command === "api" && /\/releases\/\d+$/.test(subcommand)) {
  const release = state.releases.find((item) => item.id === Number(subcommand.split("/").at(-1)))
  console.log(JSON.stringify(release))
} else {
  fail("Unexpected gh command: " + process.argv.slice(2).join(" "))
}
`

function setup(t, state) {
  const cwd = mkdtempSync(join(tmpdir(), "daily-publish-test-"))
  t.after(() => rmSync(cwd, {recursive: true, force: true}))
  const stateFile = join(cwd, "state.json")
  const output = join(cwd, "github-output")
  const dist = join(cwd, "apps/desktop/dist")

  mkdirSync(dist, {recursive: true})
  writeFileSync(join(cwd, "gh"), mockGh, {mode: 0o755})
  writeFileSync(join(cwd, "release-notes.md"), "Release notes")
  writeFileSync(output, "")
  const save = (value) => writeFileSync(stateFile, JSON.stringify(value))
  save(state)

  return {
    dist,
    save,
    state: () => JSON.parse(readFileSync(stateFile, "utf8")),
    output: () => readFileSync(output, "utf8"),
    run: (tag) =>
      spawnSync(process.execPath, [publisher, tag], {
        cwd,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: cwd + delimiter + process.env.PATH,
          GH_MOCK_STATE: stateFile,
          GITHUB_OUTPUT: output,
        },
      }),
  }
}

test("a failed manifest upload leaves latest unchanged and a retry publishes the verified pair", (t) => {
  const tag = "v2.10.0"
  const previous = {id: 1, tag_name: "v2.9.0", draft: false, prerelease: false, assets: []}
  const fixture = setup(t, {releases: [previous], latest: previous.tag_name, failAsset: "latest.json"})
  const dmgName = "Daily-2.10.0-mac.dmg"
  writeFileSync(join(fixture.dist, dmgName), "abc")
  writeFileSync(join(fixture.dist, "Daily-2.9.0-mac.dmg"), "leftover")

  const failed = fixture.run(tag)
  assert.equal(failed.status, 1)
  assert.equal(fixture.state().latest, previous.tag_name)
  const partial = fixture.state().releases.find((release) => release.tag_name === tag)
  assert.equal(partial?.draft, true, "GitHub should keep the incomplete release as a draft")
  assert.deepEqual(
    partial.assets.map((asset) => asset.name),
    [dmgName],
  )
  assert.equal(fixture.output(), "")

  fixture.save({...fixture.state(), failAsset: null})
  const retried = fixture.run(tag)
  assert.equal(retried.status, 0, retried.stderr)
  assert.equal(fixture.state().latest, tag)
  const published = fixture.state().releases.find((release) => release.tag_name === tag)
  assert.equal(published.id, partial.id)
  assert.equal(published.draft, false)
  assert.deepEqual(
    published.assets.map((asset) => asset.name),
    [dmgName, "latest.json"],
  )
  assert.deepEqual(JSON.parse(published.assets[1].bytes), {
    tag,
    version: "2.10.0",
    sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  })
  assert.equal(fixture.output(), "update_tap=true\n")
})

test("a late retry completes its old draft without changing latest or dispatching the tap", (t) => {
  const draft = {id: 1, tag_name: "v2.9.0", draft: true, prerelease: false, assets: []}
  const newer = {id: 2, tag_name: "v2.10.0", draft: false, prerelease: false, assets: []}
  const fixture = setup(t, {releases: [draft, newer], latest: newer.tag_name})
  writeFileSync(join(fixture.dist, "Daily-2.9.0-mac.dmg"), "old package")

  const result = fixture.run(draft.tag_name)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(fixture.state().latest, newer.tag_name)
  assert.equal(fixture.state().releases[0].draft, false)
  assert.equal(fixture.output(), "")
})

test("reruns leave published assets intact and only the current latest can retry the tap", (t) => {
  const published = (id, version) => ({
    id,
    tag_name: "v" + version,
    draft: false,
    prerelease: false,
    assets: [
      {name: `Daily-${version}-mac.dmg`, bytes: "published bytes", state: "uploaded"},
      {name: "latest.json", bytes: "published manifest", state: "uploaded"},
    ],
  })
  const old = published(1, "2.9.0")
  const latest = published(2, "2.10.0")
  const state = {releases: [old, latest], latest: latest.tag_name}
  const fixture = setup(t, state)
  writeFileSync(join(fixture.dist, "Daily-2.9.0-mac.dmg"), "rebuilt bytes")
  writeFileSync(join(fixture.dist, "Daily-2.10.0-mac.dmg"), "rebuilt bytes")

  const oldRetry = fixture.run(old.tag_name)
  assert.equal(oldRetry.status, 0, oldRetry.stderr)
  assert.equal(fixture.output(), "")
  assert.deepEqual(fixture.state(), state)

  const latestRetry = fixture.run(latest.tag_name)
  assert.equal(latestRetry.status, 0, latestRetry.stderr)
  assert.equal(fixture.output(), "update_tap=true\n")
  assert.deepEqual(fixture.state(), state)
})

test("an unrelated DMG cannot satisfy a new tagged release", (t) => {
  const state = {releases: []}
  const fixture = setup(t, state)
  writeFileSync(join(fixture.dist, "Daily-2.9.0-mac.dmg"), "leftover")

  const result = fixture.run("v2.10.0")
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Daily-2\.10\.0-mac\.dmg/)
  assert.deepEqual(fixture.state(), state)
  assert.equal(fixture.output(), "")
})

test("a mismatched uploaded digest prevents publication even after upload succeeds", (t) => {
  const previous = {id: 1, tag_name: "v2.9.0", draft: false, prerelease: false, assets: []}
  const dmgName = "Daily-2.10.0-mac.dmg"
  const fixture = setup(t, {releases: [previous], latest: previous.tag_name, corruptAsset: dmgName})
  writeFileSync(join(fixture.dist, dmgName), "verified package")

  const result = fixture.run("v2.10.0")
  assert.equal(result.status, 1)
  assert.match(result.stderr, /uploaded assets with the expected SHA-256/)
  assert.equal(fixture.state().latest, previous.tag_name)
  assert.equal(fixture.state().releases[1].draft, true)
  assert.equal(fixture.output(), "")
})
