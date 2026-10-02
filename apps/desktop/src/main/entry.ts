import {QUICK_CAPTURE_HELPER_FLAG} from "@main/quickCaptureHelper/helperProtocol"
import {configureHelperApp} from "./quickCaptureHelper/configureHelperApp"

if (process.argv.includes(QUICK_CAPTURE_HELPER_FLAG)) {
  configureHelperApp()
  const {runQuickCaptureHelper} = await import("./quickCaptureHelper/runQuickCaptureHelper")
  runQuickCaptureHelper()
} else {
  await import("./app")
}
