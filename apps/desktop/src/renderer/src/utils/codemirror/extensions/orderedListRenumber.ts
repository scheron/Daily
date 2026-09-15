import {notNull} from "@daily/std"

import {ensureSyntaxTree, syntaxTree} from "@codemirror/language"
import {Annotation, EditorState} from "@codemirror/state"

import type {ChangeSpec, Extension, Transaction} from "@codemirror/state"
import type {SyntaxNode, Tree} from "@lezer/common"

type Range = readonly [number, number]

export const skipOrderedListRenumber = Annotation.define<boolean>()

export function createOrderedListRenumberExtension(): Extension {
  return EditorState.transactionFilter.of((transaction) => {
    if (!transaction.docChanged) return transaction
    if (transaction.annotation(skipOrderedListRenumber)) return transaction
    if (transaction.isUserEvent("undo") || transaction.isUserEvent("redo")) return transaction

    const oldDoc = transaction.startState.doc
    const newDoc = transaction.state.doc
    const ranges: Range[] = []
    const replacedRanges: Range[] = []
    const inPlaceEditedLines = new Set<number>()

    transaction.changes.iterChanges((fromA, toA, fromB, toB) => {
      ranges.push([fromB, toB])
      replacedRanges.push([fromA, toA])

      const isSameLineInOld = oldDoc.lineAt(fromA).number === oldDoc.lineAt(toA).number
      const isSameLineInNew = newDoc.lineAt(fromB).number === newDoc.lineAt(toB).number
      if (isSameLineInOld && isSameLineInNew) {
        inPlaceEditedLines.add(newDoc.lineAt(fromB).number)
      }
    })

    const lists = collectOrderedLists(transaction.state, ranges)
    if (!lists.length) return transaction

    const changes: ChangeSpec[] = []
    for (const list of lists) {
      appendRenumberChanges(transaction, list, inPlaceEditedLines, replacedRanges, changes)
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

function appendRenumberChanges(
  transaction: Transaction,
  list: SyntaxNode,
  inPlaceEditedLines: ReadonlySet<number>,
  replacedRanges: ReadonlyArray<Range>,
  out: ChangeSpec[],
) {
  const marks = readOrderedMarks(transaction.state, list)
  if (!marks.length) return

  const [first] = marks
  const isFirstLineEditedInPlace = inPlaceEditedLines.has(transaction.state.doc.lineAt(first.from).number)
  const start = isFirstLineEditedInPlace ? first.number : (readStartBefore(transaction, list, replacedRanges) ?? first.number)

  marks.forEach((mark, index) => {
    const expected = `${start + index}${first.punctuation}`
    if (mark.text !== expected) {
      out.push({from: mark.from, to: mark.to, insert: expected})
    }
  })
}

function readStartBefore(transaction: Transaction, list: SyntaxNode, replacedRanges: ReadonlyArray<Range>): number | null {
  const {startState} = transaction
  const inverted = transaction.changes.invertedDesc
  const from = inverted.mapPos(list.from, -1)
  const to = inverted.mapPos(list.to, 1)
  let start: number | null = null

  function countListItemAncestors(node: SyntaxNode): number {
    let count = 0
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (parent.name === "ListItem") count++
    }
    return count
  }

  const depth = countListItemAncestors(list)

  getReadyTree(startState).iterate({
    from,
    to,
    enter: (node) => {
      if (notNull(start)) return false
      if (node.name !== "OrderedList" || node.from >= to || node.to <= from) return
      if (countListItemAncestors(node.node) !== depth) return

      const isReplacedWhole = node.node
        .getChildren("ListItem")
        .every((item) => replacedRanges.some(([replacedFrom, replacedTo]) => replacedFrom <= item.from && item.to <= replacedTo))
      if (isReplacedWhole) return false

      start = readOrderedMarks(startState, node.node)[0]?.number ?? null
      return false
    },
  })

  return start
}

function readOrderedMarks(state: EditorState, list: SyntaxNode) {
  const marks: {from: number; to: number; text: string; number: number; punctuation: string}[] = []

  for (let item = list.firstChild; item; item = item.nextSibling) {
    const mark = item.name === "ListItem" ? item.firstChild : null
    if (!mark || mark.name !== "ListMark") continue

    const text = state.doc.sliceString(mark.from, mark.to)
    const match = /^(\d{1,9})([.)])$/.exec(text)
    if (match) marks.push({from: mark.from, to: mark.to, text, number: Number(match[1]), punctuation: match[2]})
  }

  return marks
}
