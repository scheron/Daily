import {session} from "electron"
import {APP_CONFIG} from "../../config.js"

export function setupCSP() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [APP_CONFIG.csp.policy],
      },
    })
  })
} 