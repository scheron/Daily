import {SYNC_PROTOCOL_VERSION} from "@shared/types/syncProtocol"

import {assetStats} from "@server/assets/AssetStore"
import {resolveServerConfig} from "@server/config/resolveServerConfig"
import {countActiveDevices, listDevices} from "@server/devices/DeviceStore"
import {isClaimed, loadIdentity} from "@server/identity/ServerIdentityStore"
import {snapshotStats} from "@server/snapshot/SnapshotStore"
import {openServerStore} from "@server/store/instance"

import type {ServerStore} from "@server/store/instance"
import type {Command} from "commander"

type StatusOptions = {dataDir?: string}

const PAD_LABEL = 12
const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const

/** Registers `daily-server status`: a read-only report of what the server is holding, run on the server host against the store directly — no HTTP surface. */
export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show what the server is holding")
    .option("--data-dir <path>", "server data directory")
    .action((opts: StatusOptions) => runStatus(opts))
}

function runStatus(opts: StatusOptions): void {
  const store = openStore(opts)

  try {
    const identity = loadIdentity(store)
    console.log(formatLine("Server:", `${identity.name} (${identity.serverId})`))
    console.log(formatLine("Protocol:", String(SYNC_PROTOCOL_VERSION)))
    console.log(formatLine("Claimed:", isClaimed(store) ? "yes" : "no (unclaimed)"))

    const devices = listDevices(store)
    const active = countActiveDevices(store)
    const revoked = devices.length - active
    console.log(formatLine("Devices:", `${active} active, ${revoked} revoked`))

    const snapshot = snapshotStats(store)
    if (snapshot) {
      console.log(
        formatLine(
          "Snapshot:",
          `revision ${snapshot.revision}, version ${snapshot.version}, ${formatBytes(snapshot.bytes)}, updated ${snapshot.updatedAt}`,
        ),
      )
    } else {
      console.log(formatLine("Snapshot:", "none stored yet"))
    }

    const assets = assetStats(store)
    console.log(formatLine("Assets:", `${assets.count} ${assets.count === 1 ? "file" : "files"}, ${formatBytes(assets.bytes)}`))
  } finally {
    store.close()
  }
}

function openStore(opts: StatusOptions): ServerStore {
  const config = resolveServerConfig({dataDir: opts.dataDir})
  return openServerStore(config.dataDir)
}

function formatLine(label: string, value: string): string {
  return `${label.padEnd(PAD_LABEL)}${value}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`

  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(1)} ${BYTE_UNITS[unitIndex]}`
}
