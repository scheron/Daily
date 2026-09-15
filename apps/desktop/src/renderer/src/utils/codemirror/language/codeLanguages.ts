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

const aliasMap = new Map<string, LanguageSupport>(
  [
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
  ].flatMap((entry) => entry.aliases.map((alias) => [alias, entry.support] as const)),
)

/**
 * `@codemirror/language-data` loads grammars through dynamic `import()` calls that don't resolve in the Electron
 * bundle, so common fence tags get a statically imported grammar and the rest fall back to that lazy catalog
 * (`null` when nothing matches).
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
