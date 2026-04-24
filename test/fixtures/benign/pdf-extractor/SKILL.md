# pdf-extractor

Extracts text, tables, and metadata from PDF files using `pdfplumber`.

<pdf-extractor>
Use this skill to process PDF documents. Supported operations:
- `extract-text <file>` — extract all text from a PDF
- `extract-tables <file>` — extract tabular data as JSON
- `get-metadata <file>` — return author, title, page count

Requirements: `pdfplumber>=0.9.0`

Example:
```
extract-text report.pdf
```
</pdf-extractor>
