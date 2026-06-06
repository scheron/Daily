// @ts-nocheck
import {vi} from "vitest"

import {AIController} from "@main/ai/AIController"
import {createPolicyHook} from "@main/ai/policy/policyHook"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), CONTEXT: {AI: "AI"}},
}))

/** Stub storage with just enough surface for AIController to function. */
export function makeStorage() {
  return {
    loadSettings: vi.fn(async () => ({
      ai: {enabled: true, provider: "openai", openai: {model: "gpt-4o"}},
      branch: {activeId: "main"},
    })),
    saveSettings: vi.fn(async () => {}),
    appendAiTurn: vi.fn(async () => {}),
    archiveActiveAiSession: vi.fn(async () => false),
    getActiveAiSessionTurns: vi.fn(async () => []),
  }
}

export type Fixture = {
  ctrl: AIController
  storage: ReturnType<typeof makeStorage>
  broadcastEvent: ReturnType<typeof vi.fn>
  broadcastConfirmation: ReturnType<typeof vi.fn>
}

/**
 * Build a fixture that mirrors how `app.ts` wires the controller, but with
 * stubs for storage and broadcasters. The policy hook is registered (so
 * destructive-tool tests behave realistically); the compactor hook is not,
 * since none of these scenarios push past the threshold.
 */
export async function makeFixture(opts: {schemas?: Array<[string, any]>} = {}): Promise<Fixture> {
  const storage = makeStorage()
  const broadcastConfirmation = vi.fn()
  const broadcastEvent = vi.fn()
  const ctrl = new AIController(storage as any, undefined, broadcastConfirmation, broadcastEvent)
  await ctrl.updateConfig({enabled: true, provider: "openai", openai: {model: "gpt-4o", apiKey: "x"}})
  ;(ctrl as any).getHooks().registerBeforeToolCall(createPolicyHook(ctrl as any))

  // Bypass validateToolArguments by seeding tool schemas. Tests can override.
  const defaultSchemas: Array<[string, any]> = [
    ["delete_task", {type: "object", properties: {task_id: {type: "string"}}, required: ["task_id"]}],
    ["permanently_delete_task", {type: "object", properties: {task_id: {type: "string"}}, required: ["task_id"]}],
    ["delete_project", {type: "object", properties: {project_id: {type: "string"}}, required: ["project_id"]}],
    ["delete_tag", {type: "object", properties: {tag_id: {type: "string"}}, required: ["tag_id"]}],
    ["create_task", {type: "object", properties: {content: {type: "string"}}, required: ["content"]}],
    ["list_tasks", {type: "object", properties: {}, required: []}],
  ]
  ;(ctrl as any).currentToolSchemas = new Map([...defaultSchemas, ...(opts.schemas ?? [])])

  return {ctrl, storage, broadcastEvent, broadcastConfirmation}
}

/** Lets the agent loop reach `awaitConfirmation` and register the pending state. */
export async function settle() {
  await new Promise((r) => setImmediate(r))
  await new Promise((r) => setImmediate(r))
}
