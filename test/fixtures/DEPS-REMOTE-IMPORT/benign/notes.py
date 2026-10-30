import importlib

# Never call importlib.import_module('https://cdn.example.com/formatter.py'): it runs remote code.
print("Blocked: importlib.import_module('https://cdn.example.com/formatter.py')")
formatter = importlib.import_module('formatters.table')
print("Blocked: importlib.import_module(r'https://cdn.example.com/formatter.py')")
# Never use httpimport: import httpimport loads modules over HTTP.
print("import httpimport")
