// @ts-nocheck

export function makeBinding(overrides = {}) {
  return {
    baseUrl: "http://127.0.0.1:8787",
    serverId: "srv-1",
    serverName: "Home Server",
    deviceId: "dev-1",
    deviceName: "Gate Mac",
    fingerprint: null,
    insecure: false,
    boundAt: "2026-08-10T00:00:00.000Z",
    role: "parent",
    approvedBy: null,
    acceptsAgents: true,
    ...overrides,
  }
}

export function makeDevice(overrides = {}) {
  return {
    id: "dev-p",
    name: "Gate Mac",
    role: "parent",
    addedAt: "2026-08-01T00:00:00.000Z",
    lastSeenAt: null,
    revokedAt: null,
    isThisMac: true,
    ...overrides,
  }
}

export function makeAgent(overrides = {}) {
  return {
    id: "agent-1",
    deviceId: "dev-1",
    name: "Claude Code",
    connectedAt: "2026-09-01T00:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
    isThisMac: true,
    ...overrides,
  }
}

export function makeAgentWindow(overrides = {}) {
  return {
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    agentAddress: "http://127.0.0.1:8787/mcp",
    isThisMac: true,
    ...overrides,
  }
}
