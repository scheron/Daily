import {resolveServerConfig} from "@server/config/resolveServerConfig"
import {countActiveDevices, listDevices, revokeDevice} from "@server/devices/DeviceStore"
import {createConsoleEnrollment} from "@server/enrollment/EnrollmentStore"
import {openServerStore} from "@server/store/instance"

import type {DeviceRecord} from "@server/devices/DeviceStore"
import type {ServerStore} from "@server/store/instance"
import type {Command} from "commander"

type DeviceOptions = {dataDir?: string}

const PAD_ID = 22
const PAD_NAME = 20
const PAD_SEEN = 26

/** Registers `daily-server device`: `enroll`, `list` and `revoke`, run on the server host against the store directly — no HTTP surface. */
export function registerDeviceCommand(program: Command): void {
  const device = program.command("device").description("Manage bound devices")

  device
    .command("enroll")
    .description("Issue a single-use enrollment token, for when no bound device survives")
    .option("--data-dir <path>", "server data directory")
    .action((opts: DeviceOptions) => runDeviceEnroll(opts))

  device
    .command("list")
    .description("List every bound device")
    .option("--data-dir <path>", "server data directory")
    .action((opts: DeviceOptions) => runDeviceList(opts))

  device
    .command("revoke <id>")
    .description("Revoke a device's credential")
    .option("--data-dir <path>", "server data directory")
    .action((id: string, opts: DeviceOptions) => runDeviceRevoke(id, opts))
}

function runDeviceEnroll(opts: DeviceOptions): void {
  const store = openStore(opts)

  try {
    const {token, expiresAt} = createConsoleEnrollment(store)
    console.log(`Enrollment token (single-use, expires ${expiresAt}):`)
    console.log(token)
  } finally {
    store.close()
  }
}

function runDeviceList(opts: DeviceOptions): void {
  const store = openStore(opts)

  try {
    const devices = listDevices(store)
    if (devices.length === 0) {
      console.log("(no devices)")
      return
    }

    for (const device of devices) console.log(formatDeviceRow(device))
  } finally {
    store.close()
  }
}

function runDeviceRevoke(id: string, opts: DeviceOptions): void {
  const store = openStore(opts)

  try {
    const existing = listDevices(store).find((device) => device.id === id)
    if (!existing) throw new Error(`No such device: ${id}`)

    if (existing.revokedAt) {
      console.log(`Device ${id} is already revoked.`)
      return
    }

    revokeDevice(store, id)
    console.log(`Revoked device ${id} (${existing.name}).`)

    if (countActiveDevices(store) === 0) {
      console.log(`Warning: no active device remains. Run "daily-server device enroll" to bind a new one.`)
    }
  } finally {
    store.close()
  }
}

function openStore(opts: DeviceOptions): ServerStore {
  const config = resolveServerConfig({dataDir: opts.dataDir})
  return openServerStore(config.dataDir)
}

function formatDeviceRow(device: DeviceRecord): string {
  const status = device.revokedAt ? `revoked ${device.revokedAt}` : "active"
  const lastSeen = device.lastSeenAt ?? "never"

  return `${device.id.padEnd(PAD_ID)}  ${device.name.padEnd(PAD_NAME)}  ${lastSeen.padEnd(PAD_SEEN)}  ${status}`
}
