import type {Command, EditorView} from "@codemirror/view"

export const blockCommands = {
  insertHeading1: insertBlockPrefix("# "),
  insertHeading2: insertBlockPrefix("## "),
  insertHeading3: insertBlockPrefix("### "),
  insertHeading4: insertBlockPrefix("#### "),
  insertHeading5: insertBlockPrefix("##### "),
  insertHeading6: insertBlockPrefix("###### "),

  insertBulletList: insertBlockPrefix("- "),
  insertNumberedList: insertBlockPrefix("1. "),
  insertCheckbox: insertBlockPrefix("- [ ] "),
  insertBlockquote: insertBlockPrefix("> "),

  insertCodeBlock,
  insertTable,
  insertHorizontalRule,
}

function insertCodeBlock(view: EditorView): boolean {
  const {from} = view.state.selection.main
  const template = "```\ncode here\n```"

  view.dispatch({
    changes: {from, insert: "\n" + template + "\n"},
    selection: {anchor: from + 4, head: from + 13},
  })

  view.focus()
  return true
}

function insertTable(view: EditorView): boolean {
  const {from} = view.state.selection.main
  const template = `
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
`.trim()

  view.dispatch({
    changes: {from, insert: "\n" + template + "\n"},
    selection: {anchor: from + 13},
  })

  view.focus()
  return true
}

function insertHorizontalRule(view: EditorView): boolean {
  const {from} = view.state.selection.main
  const line = view.state.doc.lineAt(from)

  view.dispatch({
    changes: {from: line.to, insert: "\n\n---\n\n"},
    selection: {anchor: line.to + 7},
  })

  view.focus()
  return true
}

function insertBlockPrefix(prefix: string): Command {
  return (view: EditorView): boolean => {
    const {state} = view
    const line = state.doc.lineAt(state.selection.main.from)
    const lineText = line.text

    if (lineText.trim().startsWith(prefix.trim())) {
      const prefixMatch = lineText.match(new RegExp(`^(\\s*)${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))
      if (prefixMatch) {
        const prefixLen = prefixMatch[0].length
        view.dispatch({
          changes: {
            from: line.from,
            to: line.from + prefixLen,
          },
          selection: {anchor: line.from},
        })
      }
    } else {
      const indent = lineText.match(/^\s*/)?.[0] || ""
      view.dispatch({
        changes: {
          from: line.from,
          to: line.from + indent.length,
          insert: indent + prefix,
        },
        selection: {anchor: line.from + indent.length + prefix.length},
      })
    }

    view.focus()
    return true
  }
}
