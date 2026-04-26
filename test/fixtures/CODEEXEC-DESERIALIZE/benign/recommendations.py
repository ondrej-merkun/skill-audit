RECOMMENDATIONS = {
    "yaml": "Use yaml.safe_load() instead of yaml.load().",
    "pickle": "Avoid pickle.loads() for untrusted input.",
}


def guidance() -> str:
    return "Unsafe examples include yaml.load(data) and pickle.loads(blob)."


# Scanner docs mention unserialize(payload) without executing it.
