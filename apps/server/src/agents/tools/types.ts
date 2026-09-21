import type {AgentToolContext, AgentToolMode} from "../AgentWorkspace"

export type AgentToolJsonType = "string" | "number" | "integer" | "boolean" | "array" | "object" | "null"

export type AgentToolPropertySchema = {
  type: AgentToolJsonType | AgentToolJsonType[]
  description: string
  enum?: readonly string[]
  items?: AgentToolPropertySchema
  minimum?: number
  maximum?: number
}

export type AgentToolInputSchema = {
  type: "object"
  properties: Record<string, AgentToolPropertySchema>
  required?: readonly string[]
  additionalProperties: false
}

/** One tool of the agent's fixed set: what it is advertised as, and what it does when called with parsed input over the workspace's services. */
export type AgentTool = {
  name: string
  description: string
  inputSchema: AgentToolInputSchema
  mode: AgentToolMode
  run(input: Record<string, unknown>, ctx: AgentToolContext): Promise<unknown>
}
