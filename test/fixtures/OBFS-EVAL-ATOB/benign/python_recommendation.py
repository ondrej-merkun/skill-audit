RULE_TEXT = "Do not use exec(base64.b64decode(payload)) in production code."


def explain() -> str:
    return "Decode base64 to bytes first, then inspect it."
