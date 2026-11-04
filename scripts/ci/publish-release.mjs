import {execFileSync} from "node:child_process"
import {createHash} from "node:crypto"
import {createReadStream} from "node:fs"
import {appendFile, writeFile} from "node:fs/promises"
import {join} from "node:path"

const stableTag = /^v\d+\.\d+\.\d+$/
const releasesEndpoint = "repos/{owner}/{repo}/releases"

await publish(process.argv[2])

async function publish(tag) {
  if (!stableTag.test(tag)) throw new Error("Expected a stable release tag in the form vX.Y.Z.")

  const version = tag.slice(1)
  const dist = "apps/desktop/dist"
  const dmgName = `Daily-${version}-mac.dmg`
  const releases = listReleases()
  const existing = releases.find((release) => release.tag_name === tag && !release.draft)
  const makeLatest = !releases.some(
    (release) =>
      !release.draft && !release.prerelease && stableTag.test(release.tag_name) && release.tag_name.localeCompare(tag, "en", {numeric: true}) > 0,
  )

  if (existing) {
    console.log(`Release ${tag} is already published.`)
    if (
      makeLatest &&
      !existing.prerelease &&
      [dmgName, "latest.json"].every((name) => existing.assets.some((asset) => asset.name === name && asset.state === "uploaded")) &&
      gh("api", releasesEndpoint + "/latest", "--jq", ".tag_name").trim() === tag
    ) {
      await markTapUpdate()
    }
    return
  }

  const dmg = join(dist, dmgName)
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(dmg)) hash.update(chunk)
  const sha256 = hash.digest("hex")

  const manifest = join(dist, "latest.json")
  const manifestContents = JSON.stringify({version, tag, sha256}) + "\n"
  await writeFile(manifest, manifestContents)

  let draft = releases.find((release) => release.tag_name === tag)
  if (!draft) {
    gh("release", "create", tag, "--verify-tag", "--draft", "--title", tag, "--notes-file", "release-notes.md")
    draft = listReleases().find((release) => release.tag_name === tag && release.draft)
    if (!draft) throw new Error(`Could not find the draft for ${tag}.`)
  }

  gh("release", "upload", tag, "--clobber", dmg, manifest)
  const draftEndpoint = `${releasesEndpoint}/${draft.id}`
  const uploaded = JSON.parse(gh("api", draftEndpoint))
  const expectedAssets = {
    [dmgName]: sha256,
    "latest.json": createHash("sha256").update(manifestContents).digest("hex"),
  }
  if (
    !uploaded.draft ||
    uploaded.tag_name !== tag ||
    !Object.entries(expectedAssets).every(([name, digest]) =>
      uploaded.assets.some((asset) => asset.name === name && asset.state === "uploaded" && asset.digest === `sha256:${digest}`),
    )
  ) {
    throw new Error(`Draft ${tag} does not contain both uploaded assets with the expected SHA-256.`)
  }

  gh("api", draftEndpoint, "--method", "PATCH", "-F", "draft=false", "-F", "prerelease=false", "-f", `make_latest=${makeLatest}`)
  console.log(`Published release ${tag}.`)
  if (makeLatest) await markTapUpdate()
}

function gh(...args) {
  return execFileSync("gh", args, {encoding: "utf8", maxBuffer: 10 * 1024 * 1024})
}

function listReleases() {
  return JSON.parse(gh("api", releasesEndpoint + "?per_page=100", "--paginate", "--slurp")).flat()
}

async function markTapUpdate() {
  await appendFile(process.env.GITHUB_OUTPUT, "update_tap=true\n")
}
