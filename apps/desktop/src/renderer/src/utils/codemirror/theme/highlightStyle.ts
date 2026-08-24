import {HighlightStyle} from "@codemirror/language"
import {tags as t} from "@lezer/highlight"

/**
 * Syntax highlight style for the markdown editor.
 *
 * Applied through CodeMirror's standard `syntaxHighlighting(...)` pipeline. The
 * markdown grammar nests each fence's language parser into the document tree
 * (via `codeLanguages`), so this single style colors every supported language.
 *
 * Two concerns live here, both **theme-aware**:
 * - **Markdown structure** (headings, bold, italic, links, quotes) maps to the
 *   editor theme's existing `.cm-*` classes (which use `var(--color-*)`).
 * - **Code tokens** map to the app's semantic color variables, so highlighting
 *   adapts to every theme (light/dark) automatically — including live theme
 *   switches, since `var()` resolves at render time.
 *
 * `monospace` is intentionally left unmapped: it covers both inline code and
 * fenced `CodeText`, so styling it here would pill every fenced-code token. The
 * inline-code background is applied by the live-preview plugin instead.
 */
// prettier-ignore
export const codeHighlightStyle = HighlightStyle.define([
  // Markdown structure → reuse the theme's .cm-* classes
  {tag: t.heading1, class: "cm-heading cm-heading1"},
  {tag: t.heading2, class: "cm-heading cm-heading2"},
  {tag: t.heading3, class: "cm-heading cm-heading3"},
  {tag: t.heading4, class: "cm-heading cm-heading4"},
  {tag: t.heading5, class: "cm-heading cm-heading5"},
  {tag: t.heading6, class: "cm-heading cm-heading6"},
  {tag: t.strong, class: "cm-strong"},
  {tag: t.emphasis, class: "cm-emphasis"},
  {tag: t.strikethrough, textDecoration: "line-through"},
  {tag: [t.link, t.url], class: "cm-link"},
  {tag: t.quote, class: "cm-quote"},

  // Code tokens → semantic theme variables (adapt to every theme)
  {tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword, t.operatorKeyword, t.modifier, t.controlOperator], color: "var(--color-error)"},
  {tag: [t.string, t.special(t.string), t.regexp, t.character, t.escape, t.attributeValue], color: "var(--color-success)"},
  {tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "color-mix(in srgb, var(--color-base-content) 55%, transparent)", fontStyle: "italic"},
  {tag: [t.number, t.integer, t.float, t.bool, t.atom, t.null, t.self, t.constant(t.variableName)], color: "var(--color-info)"},
  {tag: [t.typeName, t.className, t.namespace, t.standard(t.variableName)], color: "var(--color-accent)"},
  {tag: [t.function(t.variableName), t.function(t.definition(t.variableName)), t.function(t.propertyName)], color: "var(--color-accent)"},
  {tag: [t.special(t.variableName)], color: "var(--color-warning)"},
  {tag: [t.tagName], color: "var(--color-success)"},
  {tag: [t.attributeName, t.meta, t.annotation, t.processingInstruction], color: "var(--color-info)"},
  {tag: t.invalid, color: "var(--color-error)"},
  // variableName, propertyName, operators, punctuation/brackets stay the default
  // text color (var(--color-base-content) via the editor theme).
])
