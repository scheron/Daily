import type {ToolResult} from "@/ai/tools/types"
import type {MessageLLM, ToolCallLLM} from "@/ai/types"
import type {AfterToolCallHook, AgentContext, BeforeToolCallDecision, BeforeToolCallHook, TransformContextHook} from "./types"

export class HookChain {
  private before: BeforeToolCallHook[] = []
  private after: AfterToolCallHook[] = []
  private transform: TransformContextHook[] = []

  registerBeforeToolCall(hook: BeforeToolCallHook): void {
    this.before.push(hook)
  }

  registerAfterToolCall(hook: AfterToolCallHook): void {
    this.after.push(hook)
  }

  registerTransformContext(hook: TransformContextHook): void {
    this.transform.push(hook)
  }

  async runBeforeToolCall(ctx: AgentContext, call: ToolCallLLM): Promise<BeforeToolCallDecision> {
    for (const hook of this.before) {
      const decision = await hook(ctx, call)
      if (decision.action === "skip") return decision
    }
    return {action: "pass"}
  }

  async runAfterToolCall(ctx: AgentContext, call: ToolCallLLM, result: ToolResult): Promise<void> {
    for (const hook of this.after) {
      await hook(ctx, call, result)
    }
  }

  runTransformContext(messages: ReadonlyArray<MessageLLM>): ReadonlyArray<MessageLLM> {
    if (this.transform.length === 0) return messages
    return this.transform.reduce<ReadonlyArray<MessageLLM>>((acc, hook) => hook(acc), messages)
  }
}
