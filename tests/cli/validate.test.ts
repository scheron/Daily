// @ts-nocheck
import {describe, expect, it} from "vitest"

import {CliError} from "@shared/errors/cli/CliError"

import {assertPositiveMinutes, assertValidDate, assertValidTime} from "@cli/validate"

describe("validate", () => {
  it("accepts ISO dates", () => expect(assertValidDate("2026-07-10")).toBe("2026-07-10"))
  it("rejects bad dates", () => expect(() => assertValidDate("2026-13-40")).toThrow(CliError))
  it("normalizes HH:MM to HH:MM:00", () => expect(assertValidTime("14:00")).toBe("14:00:00"))
  it("rejects bad times", () => expect(() => assertValidTime("25:99")).toThrow(CliError))
  it("parses positive minutes", () => expect(assertPositiveMinutes("30")).toBe(30))
  it("rejects non-positive minutes", () => expect(() => assertPositiveMinutes("0")).toThrow(CliError))
})
