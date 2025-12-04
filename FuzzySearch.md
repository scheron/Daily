What to consider in fuzzy search

0. The search should display tasks from newest to oldest, and it should show where the match occurred (similar to how it looks in VSCode), as well as the day where it matched. When a search result is clicked, the frontend should navigate to that day.

1. Which fields to search by
- Only Task.content

2. Text normalization

To ensure predictable search:
	•	Convert everything to lowercase.
	•	Remove markdown formatting (asterisks, #, [](), code blocks).
	•	It’s possible to store in the model directly:
	•	plainText: content without markdown, up to N characters max.

It’s better to do this once when building the index, rather than on every search.

⸻

3. Fuzzy behavior

For UX:
	•	Single input, results update as you type (with debounce).
	•	Small typos should still match:
	•	"страрт" → "старт"
	•	"attch" → "attachment"
	•	It’s common to use libraries like Fuse.js, where you can configure:
	•	threshold (how “fuzzy” the search is),
	•	keys: ['title', 'plainText', 'tags.name'],
	•	minMatchCharLength,
	•	ignoreLocation (especially for freeform text).

4. Ranking (scoring)
- If scores are equal—sort by updatedAt (most recently updated tasks first).

Fuse.js allows this either by weighting keys or post-processing (score first, then updatedAt).

⸻

5. Index lifecycle

It’s important not to perform search “directly on the live DTOs from PouchDB”, but to maintain a separate index:
	•	The index is built on an array of Task[] (domain model).
	•	On:
	•	creating a task → add to index,
	•	updating → update it,
	•	deleting → remove it,

Example implementation:

type SearchTask = {
  id: string
  plainText: string
  updatedAt: string
}

class TaskSearchIndex {
  private fuse: Fuse<SearchTask>

  setTasks(tasks: Task[]) { ... }   // rebuild index
  updateTask(task: Task) { ... }    // update one item
  removeTask(id: string) { ... }
  search(query: string): SearchTask[] { ... }
}

⸻

6. Performance

Expected data volume in Daily in the near future: hundreds to a few thousand tasks. For this scale:
	•	Typical in-memory indexes (Fuse/minisearch/lunr) = not a problem at all.
	•	Key points:
	•	Don’t rebuild the index hundreds of times per second.
	•	Debounce input (200–300 ms is enough).

By comparison, PouchDB queries with $regex or full-text plugins are overkill and less flexible, especially for fuzzy search.

⸻
**Important**
A separate module (similar to sync) should be created to manage search.
It’s important to follow the code style used in both main and renderer.
Be sure to note in the changelog (unreleased section) anything that was changed on the fly and anything important for the user.