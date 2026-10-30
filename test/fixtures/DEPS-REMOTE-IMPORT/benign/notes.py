import importlib

# Never call importlib.import_module('https://cdn.example.com/formatter.py'): it runs remote code.
print("Blocked: importlib.import_module('https://cdn.example.com/formatter.py')")
formatter = importlib.import_module('formatters.table')
