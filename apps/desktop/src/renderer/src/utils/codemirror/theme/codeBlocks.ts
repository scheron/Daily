import type {StyleSpec} from "./types"

export const codeBlockStyles: Record<string, StyleSpec> = {
  ".cm-codeblock-line": {
    backgroundColor: "var(--color-base-300)",
    fontFamily: "var(--font-mono)",
    lineHeight: "1.8",
    color: "var(--color-base-content)",
    paddingLeft: "0.5rem",
    paddingRight: "0.5rem",
    borderRadius: "2px",
    whiteSpace: "pre",
    overflowX: "auto",
  },

  ".cm-codeblock-line.cm-codeblock-raw": {
    overflowX: "hidden",
    overflowY: "hidden",
  },

  ".cm-codeblock-raw::after": {
    content: '""',
    display: "block",
    height: "0",
    width: "var(--cm-codeblock-scroll-width, 0px)",
  },

  ".cm-codeblock-raw .cm-code-copy": {
    transform: "translateX(var(--cm-codeblock-scroll-left, 0px))",
  },

  ".cm-codeblock-hscroll-anchor": {
    position: "relative",
    height: "0",
  },

  ".cm-codeblock-hscroll": {
    position: "absolute",
    left: "0",
    right: "0",
    bottom: "0.75rem",
    height: "8px",
    overflowX: "auto",
    overflowY: "hidden",
  },

  ".cm-codeblock-hscroll-spacer": {
    height: "1px",
  },

  ".cm-codeblock-first": {
    position: "relative",
    marginTop: "0.75rem",
    paddingTop: "0.5rem",
    borderTopLeftRadius: "6px",
    borderTopRightRadius: "6px",
  },

  ".cm-code-copy": {
    position: "absolute",
    top: "0.35rem",
    right: "0.4rem",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.5rem",
    height: "1.5rem",
    padding: "0",
    border: "0",
    borderRadius: "5px",
    cursor: "pointer",
    color: "var(--color-base-content)",
    background: "color-mix(in srgb, var(--color-base-100) 80%, transparent)",
    opacity: "0.55",
    transition: "opacity 0.15s ease, color 0.15s ease",
    zIndex: "1",
  },

  ".cm-code-copy:hover": {
    opacity: "1",
  },

  ".cm-code-copy.is-copied": {
    color: "var(--color-success)",
    opacity: "1",
  },

  ".cm-code-copy-icon": {
    display: "block",
  },

  ".cm-codeblock-last": {
    marginBottom: "0.75rem",
    paddingBottom: "0.5rem",
    borderBottomLeftRadius: "6px",
    borderBottomRightRadius: "6px",
  },

  ".cm-codeblock-content-first": {
    paddingTop: "1rem",
    borderTopLeftRadius: "4px",
    borderTopRightRadius: "4px",
  },

  ".cm-codeblock-content-last": {
    paddingBottom: "1rem",
    borderBottomLeftRadius: "4px",
    borderBottomRightRadius: "4px",
  },

  ".cm-codeblock-widget": {
    position: "relative",
    margin: "0.75rem 0",
    backgroundColor: "var(--color-base-300)",
    borderRadius: "6px",
    color: "var(--color-base-content)",
    fontFamily: "var(--font-mono)",
    lineHeight: "1.8",
  },

  ".cm-codeblock-scroll": {
    overflowX: "auto",
    padding: "1rem 0.5rem",
  },

  ".cm-codeblock-clip .cm-codeblock-scroll": {
    overflowX: "hidden",
  },

  ".cm-codeblock-body": {
    width: "max-content",
    minWidth: "100%",
  },

  ".cm-codeblock-text-line": {
    whiteSpace: "pre",
    minHeight: "1.8em",
    cursor: "text",
  },
}
