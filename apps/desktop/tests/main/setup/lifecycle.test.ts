// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {setupAppBoot, setupQuickTaskAppBoot} from "../../../src/main/setup/app/lifecycle"

const mocks = vi.hoisted(() => ({
  env: {isDevelopment: false},
  demo: {isDemo: false},
  app: {setActivationPolicy: vi.fn(), setName: vi.fn(), setPath: vi.fn(), getPath: vi.fn(() => "/appData")},
}))

vi.mock("electron", () => ({app: mocks.app}))
vi.mock("@daily/core", () => ({ENV: mocks.env, logger: {info: vi.fn(), CONTEXT: {STORAGE: "STORAGE"}}}))
vi.mock("@main/config/electronPaths", () => ({electronPaths: {}}))
vi.mock("@daily/protocol", () => ({APP_CONFIG: {name: "Daily"}}))
vi.mock("@main/demo/profile", async (importOriginal) => ({
  ...(await importOriginal()),
  get IS_DEMO() {
    return mocks.demo.isDemo
  },
}))

describe("booting an isolated demo", () => {
  beforeEach(() => {
    Object.values(mocks.app).forEach((fn) => fn.mockClear())
    mocks.env.isDevelopment = false
    mocks.demo.isDemo = false
  })

  afterEach(() => {
    mocks.demo.isDemo = false
  })

  it.each([false, true])("redirects both storage and the browser session before boot with development=%s", (isDevelopment) => {
    mocks.demo.isDemo = true
    mocks.env.isDevelopment = isDevelopment

    setupAppBoot()

    expect(mocks.app.setName).toHaveBeenCalledWith("Daily Demo")
    expect(mocks.app.setPath).toHaveBeenCalledWith("userData", "/appData/Daily-Demo")
    expect(mocks.app.setPath).toHaveBeenCalledWith("sessionData", "/appData/Daily-Demo/Session")
    expect(mocks.app.setPath).not.toHaveBeenCalledWith("userData", "/appData/Daily")
    expect(mocks.app.setPath).not.toHaveBeenCalledWith("userData", "/appData/Daily-dev")
  })

  it("keeps the installed application profile untouched for regular builds", () => {
    setupAppBoot()

    expect(mocks.app.setName).toHaveBeenCalledWith("Daily")
    expect(mocks.app.setPath).not.toHaveBeenCalled()
  })
})

describe("booting the Quick task process", () => {
  const platform = process.platform
  const setPlatform = (value) => Object.defineProperty(process, "platform", {value})

  beforeEach(() => {
    Object.values(mocks.app).forEach((fn) => fn.mockClear())
    mocks.env.isDevelopment = false
    setPlatform("darwin")
  })

  afterEach(() => setPlatform(platform))

  it("makes it an accessory app, so it has no Dock icon or menu bar", () => {
    setupQuickTaskAppBoot()

    expect(mocks.app.setActivationPolicy).toHaveBeenCalledWith("accessory")
  })

  it("leaves the activation policy alone off macOS", () => {
    setPlatform("linux")

    setupQuickTaskAppBoot()

    expect(mocks.app.setActivationPolicy).not.toHaveBeenCalled()
  })

  it("gives it a name and a userData directory of its own", () => {
    setupQuickTaskAppBoot()

    expect(mocks.app.setName).toHaveBeenCalledWith("Daily Quick Task")
    expect(mocks.app.setPath).toHaveBeenCalledWith("userData", "/appData/Daily-QuickTask")
  })

  it("keeps the development userData apart from the packaged one", () => {
    mocks.env.isDevelopment = true

    setupQuickTaskAppBoot()

    expect(mocks.app.setPath).toHaveBeenCalledWith("userData", "/appData/Daily-QuickTask-dev")
  })
})
