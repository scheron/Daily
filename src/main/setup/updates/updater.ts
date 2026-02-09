import https from "https"
import {app, dialog, shell} from "electron"

import {logger} from "@/utils/logger"

import type {BrowserWindow} from "electron"

const REPO = "scheron/Daily"
const REPO_URL = `https://github.com/${REPO}#-updating`
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`

let hasShownUpdatePrompt = false

export function setupUpdateManager(window: BrowserWindow) {
  if (app.isPackaged) {
    checkForUpdate(window, false)
  }
}

export function checkForUpdate(window: BrowserWindow, manual = true) {
  const currentVersion = app.getVersion()
  logger.debug(logger.CONTEXT.APP, `Checking for updates (current: ${currentVersion})`)

  const options = {
    headers: {
      "User-Agent": "Daily",
      Accept: "application/vnd.github+json",
    },
  }

  https
    .get(API_URL, options, (res) => {
      if (res.statusCode !== 200) {
        const error = new Error(`GitHub API Error: ${res.statusCode} - ${res.statusMessage}`)
        logger.error(logger.CONTEXT.APP, "Failed to fetch latest release", error)
        if (manual) dialog.showErrorBox("Update Check Failed", error.message)
        res.resume()
        return
      }

      let body = ""
      res.on("data", (chunk) => (body += chunk))
      res.on("end", () => {
        try {
          const json = JSON.parse(body)
          const tag = json.tag_name?.replace(/^v/, "")
          if (!tag) throw new Error("No tag_name in release")

          logger.info(logger.CONTEXT.APP, `Version check: Current ${currentVersion}, Latest ${tag}`)

          if (tag === currentVersion) {
            if (manual) {
              dialog.showMessageBox(window, {
                type: "info",
                title: "No Updates",
                message: "You're already using the latest version.",
                buttons: ["OK"],
              })
            }
            return
          }

          if (!hasShownUpdatePrompt || manual) {
            if (!manual) hasShownUpdatePrompt = true

            dialog
              .showMessageBox(window, {
                type: "info",
                title: "Update Available",
                message: `A new version (${tag}) is available.`,
                detail: "Visit GitHub to download and update manually.",
                buttons: ["Open GitHub", "Later"],
                defaultId: 0,
                cancelId: 1,
              })
              .then(({response}) => {
                if (response === 0) shell.openExternal(REPO_URL)
              })
          }
        } catch (e: any) {
          logger.error(logger.CONTEXT.APP, "Failed to parse release info", e)
          if (manual) dialog.showErrorBox("Update Check Failed", e.message)
        }
      })
    })
    .on("error", (err) => {
      logger.error(logger.CONTEXT.APP, "Failed to connect to GitHub", err)
      if (manual) dialog.showErrorBox("Update Check Failed", err.message)
    })
}
