import {createReadStream, existsSync} from "node:fs"

import {ProtocolError} from "@shared/errors/protocol/ProtocolError"
import {ProtocolErrorCode} from "@shared/errors/protocol/ProtocolErrorCode"
import {SYNC_PROTOCOL_PATHS} from "@shared/types/syncProtocol"

import {assetPath, findAsset, listAssets, writeAsset} from "@server/assets/AssetStore"
import {authenticateRequest} from "@server/devices/authenticateRequest"
import {isClaimed} from "@server/identity/ServerIdentityStore"
import {respondBytes, RESPONSE_SENT} from "../respond"

import type {ServerStore} from "@server/store/instance"
import type {AssetManifestResponse, AssetUploadResponse} from "@shared/types/syncProtocol"
import type {Route, RouteContext} from "../createHttpServer"

/** `GET /v1/assets` — any bound device lists every stored asset with its size and sha256. */
export const assetsManifestRoute: Route = {
  method: "GET",
  path: SYNC_PROTOCOL_PATHS.assets,
  handler: getAssetsManifest,
}

/** `GET /v1/assets/<name>` — any bound device downloads an attachment's bytes, streamed and never gzipped. */
export const assetDownloadRoute: Route = {
  method: "GET",
  path: SYNC_PROTOCOL_PATHS.assetItem,
  prefix: true,
  handler: getAssetDownload,
}

/** `PUT /v1/assets/<name>` — any bound device uploads an attachment's bytes, streamed straight into the store. */
export const assetUploadRoute: Route = {
  method: "PUT",
  path: SYNC_PROTOCOL_PATHS.assetItem,
  prefix: true,
  body: "stream",
  handler: putAssetUpload,
}

async function getAssetsManifest(ctx: RouteContext): Promise<AssetManifestResponse> {
  requireClaimedServer(ctx.store)
  authenticateRequest(ctx.store, ctx.req)

  return {assets: listAssets(ctx.store)}
}

async function getAssetDownload(ctx: RouteContext): Promise<typeof RESPONSE_SENT> {
  requireClaimedServer(ctx.store)
  authenticateRequest(ctx.store, ctx.req)

  const name = assetNameFrom(ctx.req.url ?? "")
  const record = findAsset(ctx.store, name)
  if (!record) throw new ProtocolError(ProtocolErrorCode.ASSET_NOT_FOUND, `No asset named "${name}"`)

  const path = assetPath(ctx.store, name)
  if (!existsSync(path)) throw new ProtocolError(ProtocolErrorCode.ASSET_NOT_FOUND, `No asset named "${name}"`)

  respondBytes(ctx.res, createReadStream(path), record)
  return RESPONSE_SENT
}

async function putAssetUpload(ctx: RouteContext): Promise<AssetUploadResponse> {
  requireClaimedServer(ctx.store)
  const device = authenticateRequest(ctx.store, ctx.req)

  const name = assetNameFrom(ctx.req.url ?? "")
  return writeAsset(ctx.store, name, ctx.req, device.id, ctx.config.maxAssetBytes)
}

function assetNameFrom(url: string): string {
  const pathname = new URL(url, "http://placeholder").pathname
  return decodeURIComponent(pathname.slice(SYNC_PROTOCOL_PATHS.assetItem.length))
}

function requireClaimedServer(store: ServerStore): void {
  if (!isClaimed(store)) throw new ProtocolError(ProtocolErrorCode.SERVER_NOT_CLAIMED, "This server has not been claimed yet")
}
