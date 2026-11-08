import {Buffer} from "node:buffer"
import {beforeEach, expect, it, vi} from "vitest"

import {uploadImageFile} from "../../../../src/renderer/src/ui/common/misc/MarkdownEditor/utils/uploadImageFile"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

vi.mock("../../../../src/renderer/src/ui/common/misc/MarkdownEditor/utils/compressImageFile", () => ({
  async compressImageFile() {
    return {buffer: Buffer.from("static frame"), width: 3, height: 2}
  },
}))

const screen = "47494638396103000200f00000ff0000000000"
const firstFrame = "21f904000d0000002c0000000003000200000202845f00"
const secondFrame = "21f904001b0000002c0000000003000200800000ff0000000202845f00"
const finiteLoop = "21ff0b4e45545343415045322e300301010000"
const infiniteLoop = "21ff0b4e45545343415045322e300301000000"
const saveFile = vi.fn()

beforeEach(() => {
  saveFile.mockReset().mockResolvedValue("gif-id")
  mockBridgeIPC({"files:save": saveFile, "files:get-path": vi.fn().mockResolvedValue("daily://file/gif-id.gif")})
})

it("uploads a GIF with the existing loop count set to infinite and preserves both frames", async () => {
  const file = makeGif(screen + firstFrame + finiteLoop + secondFrame + "3b", "image/png")

  expect(await uploadImageFile(file)).toBe("![demo =3x2](daily://file/gif-id.gif)")
  expect(Buffer.from(saveFile.mock.calls[0][1]).toString("hex")).toBe(screen + firstFrame + infiniteLoop + secondFrame + "3b")
})

it("adds a loop extension before the first frame of a one-pass GIF", async () => {
  const comment = "21fe13" + finiteLoop + "00"
  const file = makeGif(screen + comment + firstFrame + secondFrame + "3b")

  await uploadImageFile(file)

  expect(Buffer.from(saveFile.mock.calls[0][1]).toString("hex")).toBe(screen + infiniteLoop + comment + firstFrame + secondFrame + "3b")
})

function makeGif(hex: string, type = "image/gif") {
  return new File([Buffer.from(hex, "hex")], "demo.gif", {type})
}
