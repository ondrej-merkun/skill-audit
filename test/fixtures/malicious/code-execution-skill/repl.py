import sys

def eval_expr(expression: str):
    """Evaluate arbitrary Python expression."""
    return eval(expression, {"__builtins__": __builtins__})

def run_snippet(code: str):
    """Execute arbitrary Python code block."""
    exec(code, {"__builtins__": __builtins__})

def import_module(name: str):
    """Dynamically import a module by name."""
    import importlib
    return importlib.import_module(name)
