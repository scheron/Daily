import {ref, shallowReactive, watch} from "vue"
import {tryOnMounted, tryOnUnmounted} from "@vueuse/core"

const itemGroups = shallowReactive<Record<string, string>>({})

let count = 0
const uid = () => `id_${count++}`

export function useExpansionPanelGroup(groupId: string, isOpenDefault = false) {
  const isOpened = ref(isOpenDefault)

  let itemId: string = uid()
  let destroyGroup: (() => void) | null = null

  function initGroup() {
    if (!itemId) itemId = `id_${count++}`
    if (isOpened.value) itemGroups[groupId] = itemId

    const show = watch(isOpened, (val) => {
      if (val) {
        itemGroups[groupId] = itemId
        return
      }

      if (itemGroups[groupId] === itemId) {
        delete itemGroups[groupId]
      }
    })

    const group = watch(
      () => itemGroups[groupId],
      (val, oldVal) => {
        if (oldVal === itemId && val !== itemId) {
          isOpened.value = false
        }
      },
    )

    destroyGroup = () => {
      show()
      group()

      if (itemGroups[groupId] === itemId) {
        delete itemGroups[groupId]
      }
    }
  }

  tryOnMounted(() => {
    if (destroyGroup) destroyGroup()
    if (groupId) initGroup()
  })

  tryOnUnmounted(() => {
    if (destroyGroup) destroyGroup()
  })

  return isOpened
}
