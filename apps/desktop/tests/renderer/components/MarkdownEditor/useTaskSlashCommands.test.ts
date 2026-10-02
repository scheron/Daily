// @vitest-environment happy-dom
// @ts-nocheck
import {computed, ref} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

const SRC = "../../../../src/renderer/src"

const tag = (id, name, branchId = "main") => ({id, name, color: "#ff0000", branchId})
const branch = (id, name) => ({id, name, createdAt: "", updatedAt: "", deletedAt: null})

describe("useTaskSlashCommands", () => {
  let task = null
  let patch = null
  let commands = null

  beforeEach(async () => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    const {useTagsStore} = await import(`${SRC}/stores/tags.store`)
    const {useBranchesStore} = await import(`${SRC}/stores/branches.store`)
    const {useTaskSlashCommands} = await import(`${SRC}/ui/common/misc/MarkdownEditor/composables/useTaskSlashCommands`)

    useTagsStore().tags = [tag("t1", "work"), tag("t2", "Alpha"), tag("t3", "beta"), tag("t4", "other-project", "daily")]
    useBranchesStore().branches = [branch("daily", "Daily"), branch("main", "Main"), branch("zeta", "Zeta")]

    task = ref({id: "x", branchId: "main", scheduled: null, estimatedTime: 0, tags: []})
    patch = vi.fn()
    commands = useTaskSlashCommands(
      computed(() => task.value),
      patch,
    ).commands
  })

  const items = (label, query = "") => commands.find((command) => command.label === label).getItems(query)
  const labels = (list) => list.map((item) => item.label)

  describe("Estimate", () => {
    it.each(["60m", "120m", "1h 0m", "1h", "2h 0m"])("a typed %s always yields an option that sets its seconds", (typed) => {
      const options = items("Estimate", typed)

      expect(options).toHaveLength(1)
      options[0].apply()
      expect(patch).toHaveBeenCalledWith({estimatedTime: parseSeconds(typed)})
    })

    it("lists every preset for an empty query and offers a typed odd value next to nothing else", () => {
      expect(labels(items("Estimate"))).toEqual(["15m", "30m", "1h", "2h"])
      expect(labels(items("Estimate", "45m"))).toEqual(["45m"])
    })

    function parseSeconds(typed) {
      const [, hours = 0, minutes = 0] = typed.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/)
      return Number(hours) * 3600 + Number(minutes) * 60
    }
  })

  describe("Add Tag", () => {
    it("lists the tags of the task's project sorted by name, ignoring case", () => {
      expect(labels(items("Add Tag"))).toEqual(["Alpha", "beta", "work"])
    })

    it("filters by what was typed and skips a tag the task already has", () => {
      expect(labels(items("Add Tag", "BE"))).toEqual(["beta"])

      task.value = {...task.value, tags: [tag("t2", "Alpha")]}
      items("Add Tag", "alp")[0].apply()

      expect(patch).not.toHaveBeenCalled()
    })

    it("attaches the picked tag next to the existing ones", () => {
      task.value = {...task.value, tags: [tag("t1", "work")]}

      items("Add Tag", "beta")[0].apply()

      expect(patch).toHaveBeenCalledWith({tags: [tag("t1", "work"), tag("t3", "beta")]})
    })
  })

  describe("Remove Tag", () => {
    it("is unavailable until the task has a tag and then lists only the attached ones, sorted", () => {
      const command = commands.find((c) => c.label === "Remove Tag")
      expect(command.isAvailable()).toBe(false)

      task.value = {...task.value, tags: [tag("t1", "work"), tag("t3", "beta")]}

      expect(command.isAvailable()).toBe(true)
      expect(labels(items("Remove Tag"))).toEqual(["beta", "work"])
    })

    it("detaches the picked tag", () => {
      task.value = {...task.value, tags: [tag("t1", "work"), tag("t3", "beta")]}

      items("Remove Tag", "beta")[0].apply()

      expect(patch).toHaveBeenCalledWith({tags: [tag("t1", "work")]})
    })
  })

  describe("Project", () => {
    it("lists Main first and the rest by name, filtered by what was typed", () => {
      expect(labels(items("Project"))).toEqual(["Main", "Daily", "Zeta"])
      expect(labels(items("Project", "ze"))).toEqual(["Zeta"])
    })

    it("patches the project only when it changes", () => {
      items("Project", "main")[0].apply()
      expect(patch).not.toHaveBeenCalled()

      items("Project", "daily")[0].apply()
      expect(patch).toHaveBeenCalledWith({branchId: "daily"})
    })
  })
})
