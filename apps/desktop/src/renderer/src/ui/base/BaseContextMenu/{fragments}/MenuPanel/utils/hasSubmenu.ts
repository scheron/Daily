import type {BaseContextMenuItem} from "@/ui/base/BaseContextMenu/types"

export function hasSubmenu(item: BaseContextMenuItem): boolean {
  if (item.separator) return false
  return !!item.children
}
