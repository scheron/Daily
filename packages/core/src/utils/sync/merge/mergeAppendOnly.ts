/**
 * Merge two append-only collections by union of `id`.
 * Immutable: on an id collision the local copy is kept (events never change), so no timestamp comparison and no GC.
 *
 * @returns `result` — the union; `added` — remote-only docs not present locally.
 * @example mergeAppendOnly([{id: "a"}], [{id: "a"}, {id: "b"}]) // { result: [{id:"a"},{id:"b"}], added: [{id:"b"}] }
 */
export function mergeAppendOnly<D extends {id: string}>(local: D[], remote: D[]): {result: D[]; added: D[]} {
  const byId = new Map<string, D>()
  for (const doc of local) byId.set(doc.id, doc)

  const added: D[] = []
  for (const doc of remote) {
    if (byId.has(doc.id)) continue
    byId.set(doc.id, doc)
    added.push(doc)
  }

  return {result: [...byId.values()], added}
}
