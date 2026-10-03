import {QUICK_TASK_PROCESS_FLAG} from "@main/quickTask/protocol"
import {configureQuickTaskApp} from "./quickTask/configureQuickTaskApp"

if (process.argv.includes(QUICK_TASK_PROCESS_FLAG)) {
  configureQuickTaskApp()
  const {runQuickTaskProcess} = await import("./quickTask/runQuickTaskProcess")
  runQuickTaskProcess()
} else {
  await import("./app")
}
