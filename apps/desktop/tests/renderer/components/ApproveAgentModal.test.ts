// @vitest-environment happy-dom
// @ts-nocheck
import {describe, expect, it} from "vitest"

import {mount} from "@vue/test-utils"
import ApproveAgentModal from "../../../src/renderer/src/ui/overlays/ApproveAgentModal/ApproveAgentModal.vue"

function makeRequest(overrides = {}) {
  return {
    requestId: "req-1",
    code: "482913",
    agentName: "Claude Code",
    returnsTo: "localhost",
    isLocalProgram: true,
    requestedAt: "2026-09-21T00:00:00.000Z",
    expiresAt: "2026-09-21T00:05:00.000Z",
    ...overrides,
  }
}

function findButtonByText(wrapper, text) {
  return wrapper.findAll("button").find((button) => button.text().trim() === text)
}

function mountApproval(overrides = {}) {
  return mount(ApproveAgentModal, {
    props: {request: makeRequest(overrides), deviceName: "Gate Mac"},
    global: {directives: {tooltip: {}}},
  })
}

describe("ApproveAgentModal", () => {
  it("shows the matching code, agent-supplied name and local destination warning [TC-9]", () => {
    const wrapper = mountApproval()

    const text = wrapper.text()
    expect(text).toContain("482 913")
    expect(text).toContain("Match this on the browser page")
    expect(text).toMatch(/Name supplied by the agent\s*Claude Code/)
    expect(text).toMatch(/Browser returns to\s*localhost/)
    expect(text).toContain("The browser will return to a program on its computer")
    expect(text).toMatch(/Belongs to\s*Gate Mac\s*This Mac/)
  })

  it("shows a website destination without the local program warning [TC-10]", () => {
    const wrapper = mountApproval({agentName: "Claude", returnsTo: "claude.ai", isLocalProgram: false})

    const text = wrapper.text()
    expect(text).toMatch(/Name supplied by the agent\s*Claude/)
    expect(text).toMatch(/Browser returns to\s*claude\.ai/)
    expect(text).not.toContain("The browser will return to a program on its computer")
  })

  it("emits_TC-11_approve_once_on_approve_and_nothing_else", async () => {
    const wrapper = mountApproval()

    await findButtonByText(wrapper, "Approve").trigger("click")

    expect(wrapper.emitted("approve")).toHaveLength(1)
    expect(wrapper.emitted("deny")).toBeUndefined()
    expect(wrapper.emitted("close")).toBeUndefined()
  })

  it("emits_TC-11_deny_once_on_decline_and_nothing_else", async () => {
    const wrapper = mountApproval()

    await findButtonByText(wrapper, "Decline").trigger("click")

    expect(wrapper.emitted("deny")).toHaveLength(1)
    expect(wrapper.emitted("approve")).toBeUndefined()
    expect(wrapper.emitted("close")).toBeUndefined()
  })

  it("emits_TC-11_close_once_when_the_modals_own_close_is_used_and_nothing_else", async () => {
    const wrapper = mountApproval()

    await wrapper.find(".backdrop-blur-xs").trigger("click")

    expect(wrapper.emitted("close")).toHaveLength(1)
    expect(wrapper.emitted("approve")).toBeUndefined()
    expect(wrapper.emitted("deny")).toBeUndefined()
  })
})
