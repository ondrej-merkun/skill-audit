# csv-processor

Reads, filters, aggregates, and converts CSV files using Python's stdlib `csv` module.

<csv-processor>
Use this skill to work with tabular data in CSV format.

Commands:
- `head <file> [n]` — print the first n rows (default 10) with headers
- `describe <file>` — count rows, list column names, detect types
- `filter <file> <col> <value>` — print rows where column equals value
- `sum <file> <col>` — sum a numeric column
- `to-json <file>` — convert CSV to a JSON array of objects
- `dedup <file> <col>` — remove duplicate rows by a column value

All operations are in-memory. No external libraries required.
Input and output are to stdout unless `--out <file>` is specified.
</csv-processor>
