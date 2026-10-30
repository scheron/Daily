import {expect, it} from "vitest"

import {getTaskTitle} from "../../../../src/renderer/src/ui/modules/RightPanel/utils/getTaskTitle"

it.each([
  ["## **Ship** it\nmore", "Ship it"],
  ["\n\n- [ ] see [docs](http://x) now", "see docs now"],
  ["1. `code` item", "code item"],
  ["", ""],
  ["rename user_id to owner_id", "rename user_id to owner_id"],
  ["2 * 3 = 6", "2 * 3 = 6"],
  ["```js", "```js"],
  ["*em* and _em_ and ~~gone~~ and ``a`b``", "em and em and gone and a`b"],
])("reads %j as %j", (content, title) => {
  expect(getTaskTitle(content)).toBe(title)
})
