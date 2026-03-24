// @ts-nocheck
import {describe, expect, it} from "vitest"

import {
  isArray,
  isBoolean,
  isFunction,
  isNull,
  isNullOrUndefined,
  isNumber,
  isObject,
  isPrimitive,
  isString,
  isUndefined,
} from "@shared/utils/common/validators"

describe("validators", () => {
  describe("isFunction", () => {
    it("returns true for a function", () => {
      expect(isFunction(() => {})).toBe(true)
      expect(isFunction(function () {})).toBe(true)
    })

    it("returns false for non-functions", () => {
      expect(isFunction(null)).toBe(false)
      expect(isFunction(42)).toBe(false)
      expect(isFunction("string")).toBe(false)
    })
  })

  describe("isString", () => {
    it("returns true for strings", () => {
      expect(isString("")).toBe(true)
      expect(isString("hello")).toBe(true)
    })

    it("returns false for non-strings", () => {
      expect(isString(42)).toBe(false)
      expect(isString(null)).toBe(false)
      expect(isString([])).toBe(false)
    })
  })

  describe("isNumber", () => {
    it("returns true for numbers", () => {
      expect(isNumber(0)).toBe(true)
      expect(isNumber(3.14)).toBe(true)
      expect(isNumber(NaN)).toBe(true)
    })

    it("returns false for non-numbers", () => {
      expect(isNumber("42")).toBe(false)
      expect(isNumber(null)).toBe(false)
    })
  })

  describe("isBoolean", () => {
    it("returns true for booleans", () => {
      expect(isBoolean(true)).toBe(true)
      expect(isBoolean(false)).toBe(true)
    })

    it("returns false for non-booleans", () => {
      expect(isBoolean(0)).toBe(false)
      expect(isBoolean("true")).toBe(false)
      expect(isBoolean(null)).toBe(false)
    })
  })

  describe("isObject", () => {
    it("returns true for plain objects", () => {
      expect(isObject({})).toBe(true)
      expect(isObject({a: 1})).toBe(true)
    })

    it("returns false for null, arrays, and primitives", () => {
      expect(isObject(null)).toBe(false)
      expect(isObject([])).toBe(false)
      expect(isObject("string")).toBe(false)
      expect(isObject(42)).toBe(false)
    })
  })

  describe("isArray", () => {
    it("returns true for arrays", () => {
      expect(isArray([])).toBe(true)
      expect(isArray([1, 2, 3])).toBe(true)
    })

    it("returns false for non-arrays", () => {
      expect(isArray({})).toBe(false)
      expect(isArray("array")).toBe(false)
      expect(isArray(null)).toBe(false)
    })
  })

  describe("isNull", () => {
    it("returns true only for null", () => {
      expect(isNull(null)).toBe(true)
    })

    it("returns false for undefined and other falsy values", () => {
      expect(isNull(undefined)).toBe(false)
      expect(isNull(0)).toBe(false)
      expect(isNull("")).toBe(false)
    })
  })

  describe("isNullOrUndefined", () => {
    it("returns true for null and undefined", () => {
      expect(isNullOrUndefined(null)).toBe(true)
      expect(isNullOrUndefined(undefined)).toBe(true)
    })

    it("returns false for other falsy values", () => {
      expect(isNullOrUndefined(0)).toBe(false)
      expect(isNullOrUndefined("")).toBe(false)
      expect(isNullOrUndefined(false)).toBe(false)
    })
  })

  describe("isUndefined", () => {
    it("returns true only for undefined", () => {
      expect(isUndefined(undefined)).toBe(true)
    })

    it("returns false for null and other values", () => {
      expect(isUndefined(null)).toBe(false)
      expect(isUndefined(0)).toBe(false)
    })
  })

  describe("isPrimitive", () => {
    it("returns true for string, number, boolean", () => {
      expect(isPrimitive("hello")).toBe(true)
      expect(isPrimitive(42)).toBe(true)
      expect(isPrimitive(true)).toBe(true)
    })

    it("returns false for objects, arrays, null, undefined", () => {
      expect(isPrimitive(null)).toBe(false)
      expect(isPrimitive(undefined)).toBe(false)
      expect(isPrimitive({})).toBe(false)
      expect(isPrimitive([])).toBe(false)
    })
  })
})
