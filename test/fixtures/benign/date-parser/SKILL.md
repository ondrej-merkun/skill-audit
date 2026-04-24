# date-parser

Parses, formats, and converts dates and times across common formats and timezones.

<date-parser>
Use this skill for date/time operations:

- `parse <string>` — parse a date string and return ISO 8601
- `format <iso> <pattern>` — format an ISO date with a strftime pattern
- `diff <date1> <date2>` — return the difference in days between two dates
- `now [timezone]` — return the current time in a timezone (e.g. `UTC`, `US/Eastern`)
- `add <iso> <n> <unit>` — add n days/weeks/months to a date

Supported input formats: ISO 8601, RFC 2822, US (MM/DD/YYYY), EU (DD.MM.YYYY).
No external network calls. Pure Python stdlib only.
</date-parser>
