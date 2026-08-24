/** The steps `ServerConnectSteps.vue` walks through, address to a bound credential. */
export type ConnectStep = "address" | "confirm" | "claim" | "waiting" | "denied" | "expired"

export const CONNECT_STEP_TITLES: Record<ConnectStep, string> = {
  address: "Connect to Self-hosted Daily",
  confirm: "Confirm connection",
  claim: "Enter the claim code",
  waiting: "Waiting for approval",
  denied: "Request declined",
  expired: "Request expired",
}
