RULE_TABLE = [
    {
        "id": "CODEEXEC-PY-EVAL",
        "bad": "Never use eval() on user input.",
        "fix": "Use ast.literal_eval() for Python literal data.",
    }
]


def recommendation() -> str:
    return "Avoid eval() in skill code."


# eval(user_input) is shown here as a string-only scanner example.
