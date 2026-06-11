// @ts-nocheck
import {describe, expect, it} from "vitest"

import {extractTaskTitle} from "@renderer/utils/tasks/extractTaskTitle"

describe("extractTaskTitle", () => {
  it("returns plain first line as-is", () => {
    expect(extractTaskTitle("Синкануться состояние Chelsea")).toBe("Синкануться состояние Chelsea")
  })

  it("strips heading markers", () => {
    expect(extractTaskTitle("## Добавляем сайдбар\nВ нем будет переключение")).toBe("Добавляем сайдбар")
  })

  it("strips list markers and checkboxes", () => {
    expect(extractTaskTitle("- [ ] купить хлеб")).toBe("купить хлеб")
    expect(extractTaskTitle("* пункт")).toBe("пункт")
    expect(extractTaskTitle("1. первый")).toBe("первый")
  })

  it("strips inline emphasis, code and links", () => {
    expect(extractTaskTitle("**Вопрос БЛ** про `форму` и [доку](https://x.y)")).toBe("Вопрос БЛ про форму и доку")
  })

  it("skips empty and whitespace-only leading lines", () => {
    expect(extractTaskTitle("\n   \n> цитата как заголовок")).toBe("цитата как заголовок")
  })

  it("returns empty string for empty content", () => {
    expect(extractTaskTitle("")).toBe("")
    expect(extractTaskTitle("\n\n")).toBe("")
  })
})
