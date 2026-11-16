# Task search

Text search over tasks, with filters, ranking and pages.

### filter-before-rank — A search with a project or trash filter ranks every task in that set before it takes a page, and the total counts every match

Why: results in a project were lost to higher-ranked matches from other projects

- An agent runs `list_tasks` with a project and a search, while other projects hold higher-ranked matches → the page holds that project's best matches, and the total counts every match in the project.
- An agent runs `list_tasks` with a search and `deleted: true` → the results come from the trash, ranked the same way.
