// @vitest-environment happy-dom
// @ts-nocheck
import {describe, expect, it} from "vitest"

import {mount} from "@vue/test-utils"
import ApproveAgentModal from "../../../src/renderer/src/ui/overlays/ApproveAgentModal.vue"

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

describe("ApproveAgentModal", () => {
  it("reads_TC-9_every_pinned_string_for_a_request_from_a_program_on_a_computer", () => {
    const wrapper = mount(ApproveAgentModal, {
      props: {request: makeRequest(), deviceName: "Gate Mac"},
    })

    const text = wrapper.text()
    expect(text).toContain("Approve agent")
    expect(text).toContain("An agent wants access")
    expect(text).toContain("Compare the code with the browser page that just opened. If it does not match, or you did not start this, decline.")
    expect(text).toContain("482 913")
    expect(text).toContain("Match this on the browser page")
    expect(text).toContain("Agent")
    expect(text).toContain("Claude Code")
    expect(text).toContain("Returns to")
    expect(text).toContain("localhost")
    expect(text).toContain("A program on a computer")
    expect(text).toContain(
      "This agent returns to a program on a computer, not to a website. Any program can claim to be Claude Code — approve only if you just started it yourself.",
    )
    expect(text).toContain("Belongs to")
    expect(text).toContain("Gate Mac")
    expect(text).toContain("This Mac")
    expect(text).toContain("Decline")
    expect(text).toContain("Approve")
  })

  it("reads_TC-10_a_website_return_with_no_badge_and_no_warning", () => {
    const wrapper = mount(ApproveAgentModal, {
      props: {request: makeRequest({agentName: "Claude", returnsTo: "claude.ai", isLocalProgram: false}), deviceName: "Gate Mac"},
    })

    const text = wrapper.text()
    expect(text).toContain("claude.ai")
    expect(text).not.toContain("A program on a computer")
    expect(text).not.toContain("This agent returns to a program on a computer")
    expect(text).toContain("Claude")
    expect(text).toContain("Approve agent")
    expect(text).toContain("An agent wants access")
    expect(text).toContain("Belongs to")
    expect(text).toContain("Gate Mac")
    expect(text).toContain("This Mac")
    expect(text).toContain("Decline")
    expect(text).toContain("Approve")
  })

  it("emits_TC-11_approve_once_on_approve_and_nothing_else", async () => {
    const wrapper = mount(ApproveAgentModal, {props: {request: makeRequest(), deviceName: "Gate Mac"}})

    await findButtonByText(wrapper, "Approve").trigger("click")

    expect(wrapper.emitted("approve")).toHaveLength(1)
    expect(wrapper.emitted("deny")).toBeUndefined()
    expect(wrapper.emitted("close")).toBeUndefined()
  })

  it("emits_TC-11_deny_once_on_decline_and_nothing_else", async () => {
    const wrapper = mount(ApproveAgentModal, {props: {request: makeRequest(), deviceName: "Gate Mac"}})

    await findButtonByText(wrapper, "Decline").trigger("click")

    expect(wrapper.emitted("deny")).toHaveLength(1)
    expect(wrapper.emitted("approve")).toBeUndefined()
    expect(wrapper.emitted("close")).toBeUndefined()
  })

  it("emits_TC-11_close_once_when_the_modals_own_close_is_used_and_nothing_else", async () => {
    const wrapper = mount(ApproveAgentModal, {props: {request: makeRequest(), deviceName: "Gate Mac"}})

    await wrapper.find(".backdrop-blur-xs").trigger("click")

    expect(wrapper.emitted("close")).toHaveLength(1)
    expect(wrapper.emitted("approve")).toBeUndefined()
    expect(wrapper.emitted("deny")).toBeUndefined()
  })
})
