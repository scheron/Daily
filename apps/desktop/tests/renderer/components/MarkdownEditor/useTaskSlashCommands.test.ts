// @vitest-environment happy-dom
// @ts-nocheck
import {computed, ref} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

const SRC = "../../../../src/renderer/src"

const tag = (id, name, branchId = "main") => ({id, name, color: "#ff0000", branchId})
const branch = (id, name) => ({id, name, createdAt: "", updatedAt: "", deletedAt: null})
const milestone = (id, name, orderIndex, branchId = "main") => ({id, name, orderIndex, branchId, createdAt: "", updatedAt: "", deletedAt: null})

describe("useTaskSlashCommands", () => {
  let task = null
  let patch = null
  let commands = null

  beforeEach(async () => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    const {useTagsStore} = await import(`${SRC}/stores/tags.store`)
    const {useBranchesStore} = await import(`${SRC}/stores/branches.store`)
    const {useMilestonesStore} = await import(`${SRC}/stores/milestones.store`)
    const {useTaskSlashCommands} = await import(`${SRC}/ui/common/misc/MarkdownEditor/composables/useTaskSlashCommands`)

    useTagsStore().tags = [tag("t1", "work"), tag("t2", "Alpha"), tag("t3", "beta"), tag("t4", "other-project", "daily")]
    useBranchesStore().branches = [branch("daily", "Daily"), branch("main", "Main"), branch("zeta", "Zeta")]
    useMilestonesStore().milestones = [milestone("m2", "Beta", 2), milestone("m1", "Alpha", 1), milestone("m3", "Elsewhere", 0, "daily")]

    task = ref({id: "x", branchId: "main", scheduled: null, estimatedTime: 0, tags: [], milestoneId: null})
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

  describe("Milestone", () => {
    const command = (label) => commands.find((c) => c.label === label)

    it("lists the milestones of the task's project in their order and is unavailable in a project without any", () => {
      expect(command("Milestone").isAvailable()).toBe(true)
      expect(labels(items("Milestone"))).toEqual(["Alpha", "Beta"])
      expect(labels(items("Milestone", "bet"))).toEqual(["Beta"])

      task.value = {...task.value, branchId: "zeta"}

      expect(command("Milestone").isAvailable()).toBe(false)
    })

    it("sets the picked milestone only when it changes", () => {
      task.value = {...task.value, milestoneId: "m1"}
      items("Milestone", "alpha")[0].apply()
      expect(patch).not.toHaveBeenCalled()

      items("Milestone", "beta")[0].apply()
      expect(patch).toHaveBeenCalledWith({milestoneId: "m2"})
    })

    it("offers Remove Milestone only while the task has one, and it clears it", () => {
      expect(command("Remove Milestone").isAvailable()).toBe(false)

      task.value = {...task.value, milestoneId: "m2"}

      expect(command("Remove Milestone").isAvailable()).toBe(true)
      expect(labels(items("Remove Milestone"))).toEqual(["Beta"])
      items("Remove Milestone")[0].apply()
      expect(patch).toHaveBeenCalledWith({milestoneId: null})
    })
  })
})
