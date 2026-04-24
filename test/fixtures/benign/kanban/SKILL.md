# kanban

Lightweight kanban board stored as `kanban.json` in the project directory.

<kanban>
Manage tasks with a simple three-column board: TODO, IN_PROGRESS, DONE.

Commands:
- `add <title>` — add a card to TODO
- `move <id> <column>` — move a card to TODO | IN_PROGRESS | DONE
- `list` — display all cards grouped by column
- `done <id>` — shorthand to move a card to DONE

Cards are persisted to `kanban.json` in the current working directory.
No external services required.
</kanban>
