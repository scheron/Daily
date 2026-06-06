export type McpStatus =
  | {state: "stopped"}
  | {state: "starting"}
  | {state: "running"; host: string; port: number}
  | {state: "stopping"}
  | {state: "error"; message: string}
