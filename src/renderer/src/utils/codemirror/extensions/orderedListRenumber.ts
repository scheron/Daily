import {isNull} from "@shared/utils/common/validators"

import {ensureSyntaxTree, syntaxTree} from "@codemirror/language"
import {Annotation, EditorState} from "@codemirror/state"

import type {ChangeSpec, Extension} from "@codemirror/state"
import type {SyntaxNode, Tree} from "@lezer/common"

export const skipOrderedListRenumber = Annotation.define<boolean>()

const ORDERED_MARK_RE = /^(\d{1,9})([.)])$/

type Range = readonly [number, number]

function rangesOverlap(a: Range, b: Range): boolean {
  return a[0] <= b[1] && b[0] <= a[1]
}

function getReadyTree(state: EditorState): Tree {
  return ensureSyntaxTree(state, state.doc.length, 50) ?? syntaxTree(state)
}

function collectOrderedLists(state: EditorState, ranges: ReadonlyArray<Range>): SyntaxNode[] {
  const tree = getReadyTree(state)
  const found = new Map<string, SyntaxNode>()

  function record(node: SyntaxNode) {
    if (node.name !== "OrderedList") return
    found.set(`${node.from}:${node.to}`, node)
  }

  for (const [from, to] of ranges) {
    let current: SyntaxNode | null = tree.resolveInner(from, 1)
    while (current) {
      record(current)
      current = current.parent
    }

    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.name === "OrderedList") record(node.node)
      },
    })
  }

  return Array.from(found.values())
}

function appendRenumberChanges(state: EditorState, list: SyntaxNode, multiLineRanges: ReadonlyArray<Range>, out: ChangeSpec[]) {
  let firstNumber: number | null = null
  let punctuation: "." | ")" = "."
  let index = 0

  for (let child = list.firstChild; child; child = child.nextSibling) {
    if (child.name !== "ListItem") continue

    const mark = child.firstChild
    if (!mark || mark.name !== "ListMark") continue

    const text = state.doc.sliceString(mark.from, mark.to)
    const match = ORDERED_MARK_RE.exec(text)
    if (!match) continue

    if (isNull(firstNumber)) {
      const markRange: Range = [mark.from, mark.to]
      const touchedByMultiLine = multiLineRanges.some((range) => rangesOverlap(range, markRange))
      firstNumber = touchedByMultiLine ? 1 : Number(match[1])
      punctuation = match[2] as "." | ")"
    }

    const expected = `${firstNumber + index}${punctuation}`
    if (text !== expected) {
      out.push({from: mark.from, to: mark.to, insert: expected})
    }

    index++
  }
}

export function createOrderedListRenumberExtension(): Extension {
  return EditorState.transactionFilter.of((transaction) => {
    if (!transaction.docChanged) return transaction
    if (transaction.annotation(skipOrderedListRenumber)) return transaction
    if (transaction.isUserEvent("undo") || transaction.isUserEvent("redo")) return transaction

    const oldDoc = transaction.startState.doc
    const newDoc = transaction.state.doc
    const ranges: Range[] = []
    const multiLineRanges: Range[] = []

    transaction.changes.iterChanges((fromA, toA, fromB, toB) => {
      ranges.push([fromB, toB])

      const crossedLineInOld = oldDoc.lineAt(fromA).number !== oldDoc.lineAt(toA).number
      const crossedLineInNew = newDoc.lineAt(fromB).number !== newDoc.lineAt(toB).number
      if (crossedLineInOld || crossedLineInNew) {
        multiLineRanges.push([fromB, toB])
      }
    })

    const lists = collectOrderedLists(transaction.state, ranges)
    if (!lists.length) return transaction

    const changes: ChangeSpec[] = []
    for (const list of lists) {
      appendRenumberChanges(transaction.state, list, multiLineRanges, changes)
    }

    if (!changes.length) return transaction

    return [
      transaction,
      {
        changes,
        sequential: true,
        annotations: skipOrderedListRenumber.of(true),
      },
    ]
  })
}
