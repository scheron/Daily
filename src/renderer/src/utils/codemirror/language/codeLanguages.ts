import {cpp} from "@codemirror/lang-cpp"
import {css} from "@codemirror/lang-css"
import {go} from "@codemirror/lang-go"
import {html} from "@codemirror/lang-html"
import {java} from "@codemirror/lang-java"
import {javascript} from "@codemirror/lang-javascript"
import {json} from "@codemirror/lang-json"
import {markdown} from "@codemirror/lang-markdown"
import {php} from "@codemirror/lang-php"
import {python} from "@codemirror/lang-python"
import {rust} from "@codemirror/lang-rust"
import {sql} from "@codemirror/lang-sql"
import {xml} from "@codemirror/lang-xml"
import {yaml} from "@codemirror/lang-yaml"
import {LanguageDescription} from "@codemirror/language"
import {languages as lazyLanguages} from "@codemirror/language-data"

import type {Language, LanguageSupport} from "@codemirror/language"

/**
 * Eager code-fence language registry for the markdown editor.
 *
 * `@codemirror/language-data` is the canonical catalog, but it loads grammars
 * through dynamic `import("@codemirror/lang-…")` calls that don't resolve
 * reliably in the Electron bundle — fenced blocks render as plaintext even
 * though the grammar package is installed. We pre-import the common grammars
 * statically and expose a resolver in the shape `markdown({codeLanguages})`
 * expects, falling back to the lazy catalog for less common fence tags.
 */
type EagerEntry = {aliases: string[]; support: LanguageSupport}

const EAGER: EagerEntry[] = [
  {aliases: ["javascript", "js", "jsx", "node", "nodejs"], support: javascript({jsx: true})},
  {aliases: ["typescript", "ts", "tsx"], support: javascript({jsx: true, typescript: true})},
  {aliases: ["python", "py", "python3"], support: python()},
  {aliases: ["rust", "rs"], support: rust()},
  {aliases: ["go", "golang"], support: go()},
  {aliases: ["json", "jsonc"], support: json()},
  {aliases: ["cpp", "c++", "c", "cc", "cxx", "hpp", "h"], support: cpp()},
  {aliases: ["java"], support: java()},
  {aliases: ["html", "htm"], support: html()},
  {aliases: ["css"], support: css()},
  {aliases: ["sql", "mysql", "postgres", "postgresql", "sqlite"], support: sql()},
  {aliases: ["xml", "svg"], support: xml()},
  {aliases: ["yaml", "yml"], support: yaml()},
  {aliases: ["markdown", "md"], support: markdown()},
  {aliases: ["php"], support: php()},
]

const aliasMap = new Map<string, LanguageSupport>()
for (const entry of EAGER) {
  for (const alias of entry.aliases) aliasMap.set(alias, entry.support)
}

/**
 * Resolver passed to `markdown({codeLanguages})`. Returns an eagerly loaded
 * grammar for known fence tags, a lazy `LanguageDescription` from the catalog
 * for less common ones, or `null` when no grammar matches.
 *
 * @param info - The fenced code info string (e.g. `"ts"`, `"python"`)
 * @example resolveCodeLanguage("js") // → javascript LanguageSupport's Language
 */
export function resolveCodeLanguage(info: string): Language | LanguageDescription | null {
  const key = info
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+#]/g, "")
  if (!key) return null

  const eager = aliasMap.get(key)
  if (eager) return eager.language

  return LanguageDescription.matchLanguageName(lazyLanguages, key, true)
}
