import type {StyleSpec} from "@/utils/codemirror/types"

/**
 * Syntax highlighting token styles (GitHub Dark theme)
 * All token styles kept together for easy theme customization
 *
 * Categories:
 * - Keywords and operators
 * - Strings and numbers
 * - Comments
 * - Variables and types
 * - Functions and definitions
 * - HTML/JSX elements
 * - Special tokens
 * - Diff tokens
 * - Markdown tokens
 */
export const syntaxHighlightingStyles: Record<string, StyleSpec> = {
  // Keywords (const, let, function, class, import, export, etc.)
  ".tok-keyword": {
    color: "#ff7b72",
  },

  ".tok-controlKeyword": {
    color: "#ff7b72",
  },

  ".tok-moduleKeyword": {
    color: "#ff7b72",
  },

  // Operators (+, -, =, etc.)
  ".tok-operator": {
    color: "#79c0ff",
  },

  // Strings
  ".tok-string": {
    color: "#a5d6ff",
  },

  // Comments
  ".tok-comment, .tok-lineComment, .tok-blockComment, .tok-docComment": {
    color: "#8b949e",
    fontStyle: "italic",
  },

  // Numbers
  ".tok-number": {
    color: "#79c0ff",
  },

  // Booleans and null
  ".tok-bool, .tok-null": {
    color: "#79c0ff",
  },

  // Variable names
  ".tok-variableName": {
    color: "#c9d1d9",
  },

  ".tok-local": {
    color: "#c9d1d9",
  },

  // Function/method definitions
  ".tok-definition": {
    color: "#d2a8ff",
  },

  // Type names and class names
  ".tok-typeName, .tok-className": {
    color: "#d2a8ff",
  },

  // Function calls
  ".tok-function": {
    color: "#d2a8ff",
  },

  // Property names
  ".tok-propertyName": {
    color: "#79c0ff",
  },

  // HTML/JSX tag names
  ".tok-tagName": {
    color: "#7ee787",
  },

  // HTML/JSX attribute names
  ".tok-attributeName": {
    color: "#79c0ff",
  },

  // Punctuation, brackets, etc.
  ".tok-punctuation, .tok-bracket, .tok-separator, .tok-paren, .tok-brace, .tok-squareBracket": {
    color: "#c9d1d9",
  },

  // Regular expressions
  ".tok-regexp": {
    color: "#a5d6ff",
  },

  // Special tokens (this, self)
  ".tok-special": {
    color: "#ff7b72",
  },

  ".tok-self": {
    color: "#ff7b72",
  },

  // Meta information
  ".tok-meta": {
    color: "#79c0ff",
  },

  // Invalid/error tokens
  ".tok-invalid": {
    color: "#ffdcd7",
    backgroundColor: "#67060c",
  },

  // Generic names
  ".tok-name": {
    color: "#7ee787",
  },

  // Literals (true, false, null)
  ".tok-literal": {
    color: "#79c0ff",
  },

  // Standard types
  ".tok-standard": {
    color: "#79c0ff",
  },

  // Namespaces/modules
  ".tok-namespace": {
    color: "#d2a8ff",
  },

  // Built-in symbols
  ".tok-builtin": {
    color: "#ffa657",
  },

  // Constants
  ".tok-constant": {
    color: "#79c0ff",
  },

  // Variables with special meaning
  ".tok-variableSpecial": {
    color: "#ffa657",
  },

  // Diff: deleted
  ".tok-deleted": {
    color: "#ffdcd7",
    backgroundColor: "#67060c",
  },

  // Diff: inserted
  ".tok-inserted": {
    color: "#aff5b4",
    backgroundColor: "#033a16",
  },

  // Diff: changed
  ".tok-changed": {
    color: "#f2cc60",
  },

  // Markdown: headings
  ".tok-heading": {
    color: "#1f6feb",
    fontWeight: "600",
  },

  // Markdown: links
  ".tok-link": {
    color: "#79c0ff",
    textDecoration: "underline",
  },

  // Markdown: strong
  ".tok-strong": {
    color: "#c9d1d9",
    fontWeight: "600",
  },

  // Markdown: emphasis
  ".tok-emphasis": {
    color: "#c9d1d9",
    fontStyle: "italic",
  },

  // Markdown: code
  ".tok-monospace": {
    color: "#c9d1d9",
  },
}
