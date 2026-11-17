// @vitest-environment node
import {chromium} from "playwright"
import {describe, expect, it} from "vitest"

import type {FontSize} from "@daily/protocol"
import type {Locator, Page} from "playwright"

const endpoint = process.env.DAILY_LAYOUT_CDP

describe.each([
  {width: 1280, height: 800},
  {width: 1800, height: 1000},
])("milestone layout at $width×$height", (viewport) => {
  it.skipIf(!endpoint).each<{fontSize: FontSize; pixels: string}>([
    {fontSize: "small", pixels: "15px"},
    {fontSize: "normal", pixels: "17px"},
    {fontSize: "large", pixels: "19px"},
  ])(
    "keeps search fixed and long and empty lists reachable at $fontSize size [menus#milestone-search-stays-fixed]",
    async ({fontSize, pixels}) => {
      const browser = await chromium.connectOverCDP(endpoint!)
      try {
        const page = browser
          .contexts()[0]
          .pages()
          .find((candidate) => candidate.url().includes("index.html"))!
        await page.waitForFunction(() => Boolean(window.BridgeIPC))
        await page.setViewportSize(viewport)
        await page.evaluate(async (size) => {
          const bridge = window.BridgeIPC
          const settings = await bridge["settings:load"]()
          if (settings.sync.iCloud.enabled || settings.sync.server.enabled) {
            throw new Error("The layout test requires the isolated launcher with sync disabled")
          }
          await bridge["settings:save"]({typography: {fontSize: size}})
          const milestones = await bridge["milestones:get-many"]("main")
          for (let index = 1; index <= 24; index++) {
            const name = `Layout milestone ${String(index).padStart(2, "0")}`
            if (!milestones.some((milestone) => milestone.name === name)) {
              await bridge["milestones:create"]({branchId: "main", name, description: "", targetDate: null, deletedAt: null})
            }
          }
          const projects = await bridge["branches:get-many"]()
          const emptyProject =
            projects.find((project) => project.name === "Layout empty project") ??
            (await bridge["branches:create"]({name: "Layout empty project", description: ""}))
          if (!emptyProject || (await bridge["milestones:get-many"](emptyProject.id)).length) {
            throw new Error("The empty-project fixture must have no milestones")
          }
          const tasks = await bridge["tasks:get-all"]()
          for (const task of [makeTask("Milestone scroll regression", "main"), makeTask("Empty milestone regression", emptyProject.id)]) {
            if (!tasks.some((existing) => existing.content === task.content && existing.branchId === task.branchId)) {
              await bridge["tasks:create"](task)
            }
          }
          function makeTask(content: string, branchId: string): Parameters<(typeof bridge)["tasks:create"]>[0] {
            return {
              content,
              branchId,
              status: "in_progress",
              milestoneId: null,
              minimized: false,
              priority: "none",
              orderIndex: 1024,
              scheduled: null,
              estimatedTime: 0,
              spentTime: 0,
              tags: [],
              attachments: [],
            }
          }
        }, fontSize)
        await page.reload()
        await page.waitForFunction((expected) => getComputedStyle(document.documentElement).fontSize === expected, pixels)
        expect(await page.evaluate(() => ({width: innerWidth, height: innerHeight}))).toEqual(viewport)

        await openProject(page, "No project")
        await page.getByText("Milestone scroll regression", {exact: true}).first().click()
        await page.getByRole("button", {name: "No milestone", exact: true}).click()
        const search = page.getByPlaceholder("Search or create milestone...")
        await search.waitFor()
        const popup = page.locator("[data-popup]").filter({has: search})
        const list = popup.locator("ul")
        expect(await list.locator("li").count()).toBeGreaterThanOrEqual(17)
        const searchTop = await search.evaluate((input) => input.getBoundingClientRect().top)
        await list.hover()
        await page.mouse.wheel(0, 10000)
        await expect.poll(() => list.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(1)
        expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
        await popup.evaluate((element) => {
          element.scrollTop = element.scrollHeight
        })
        expect(
          (await search.evaluate((input) => input.getBoundingClientRect().top)) - searchTop,
          "Only the choices should scroll; the search field must stay fixed",
        ).toBe(0)
        const longLayout = await measurePopup(popup)
        expect(longLayout.scrollableRegions).toBe(1)
        expect(longLayout.outerScrollTop).toBe(0)
        expect(longLayout.outerScrollHeight).toBe(longLayout.outerClientHeight)
        expect(longLayout.fitsViewport).toBe(true)
        const lastRow = list.locator("li").last()
        expect(await lastRow.innerText()).toContain("Layout milestone 24")
        expect(
          await lastRow.evaluate((row) => {
            const bounds = row.getBoundingClientRect()
            const listBounds = row.parentElement!.getBoundingClientRect()
            return bounds.top >= listBounds.top && bounds.bottom <= listBounds.bottom
          }),
        ).toBe(true)
        await lastRow.click({trial: true})
        await search.press("Escape")

        await openProject(page, "Layout empty project")
        await page.getByText("Empty milestone regression", {exact: true}).first().click()
        await page.getByRole("button", {name: "No milestone", exact: true}).click()
        await search.waitFor()
        expect(await list.locator("li").allTextContents()).toEqual(["No milestone"])
        await list.getByText("No milestone", {exact: true}).click({trial: true})
        const emptyLayout = await measurePopup(popup)
        expect(emptyLayout.scrollableRegions).toBe(0)
        expect(emptyLayout.outerScrollHeight).toBe(emptyLayout.outerClientHeight)
        expect(emptyLayout.fitsViewport).toBe(true)
        await search.fill("Layout new milestone")
        const create = list.getByText('Create "Layout new milestone"', {exact: true})
        await create.waitFor()
        const createLayout = await measurePopup(popup)
        expect(createLayout.scrollableRegions).toBe(0)
        expect(createLayout.outerScrollHeight).toBe(createLayout.outerClientHeight)
        expect(createLayout.fitsViewport).toBe(true)
        await create.click({trial: true})
        console.log(JSON.stringify({viewport, fontSize, longLayout, emptyLayout, createLayout}))
        if (process.env.DAILY_LAYOUT_SCREENSHOT) await page.screenshot({path: process.env.DAILY_LAYOUT_SCREENSHOT})
        await search.press("Escape")
      } finally {
        await browser.close()
      }

      async function openProject(page: Page, name: string) {
        await page
          .getByRole("button", {name: /^(Project: )?(No project|Layout empty project)$/})
          .first()
          .click()
        await page.getByPlaceholder("Search or create project...").waitFor()
        await page.locator("[data-popup]").getByText(name, {exact: true}).click()
      }

      async function measurePopup(popup: Locator) {
        return popup.evaluate((element) => {
          const bounds = element.getBoundingClientRect()
          return {
            outerScrollTop: element.scrollTop,
            outerClientHeight: element.clientHeight,
            outerScrollHeight: element.scrollHeight,
            scrollableRegions: [element, ...element.querySelectorAll("*")].filter(
              (candidate) => candidate.scrollHeight > candidate.clientHeight && ["auto", "scroll"].includes(getComputedStyle(candidate).overflowY),
            ).length,
            fitsViewport: bounds.top >= 0 && bounds.left >= 0 && bounds.bottom <= innerHeight && bounds.right <= innerWidth,
          }
        })
      }
    },
    30000,
  )
})
