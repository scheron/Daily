import {Command} from "commander"
import {describe, expect, it} from "vitest"

describe("--tag collector option", () => {
  it("accumulates repeated --tag flags into an array", () => {
    const program = new Command()
    program.option("--tag <tag>", "", (v, acc) => [...acc, v], [])
    program.parse(["--tag", "work", "--tag", "urgent"], {from: "user"})
    expect(program.opts().tag).toEqual(["work", "urgent"])
  })

  it("wraps a single --tag flag into a one-element array", () => {
    const program = new Command()
    program.option("--tag <tag>", "", (v, acc) => [...acc, v], [])
    program.parse(["--tag", "work"], {from: "user"})
    expect(program.opts().tag).toEqual(["work"])
  })
})
