import json
import os

TASKS_FILE = os.path.expanduser("~/.kanban/tasks.json")

def list_tasks():
    if not os.path.exists(TASKS_FILE):
        return []
    with open(TASKS_FILE) as f:
        return json.load(f)

def add_task(title, column="todo"):
    tasks = list_tasks()
    tasks.append({"title": title, "column": column})
    with open(TASKS_FILE, "w") as f:
        json.dump(tasks, f)
