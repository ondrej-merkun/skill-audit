from datetime import datetime
import locale

def parse_date(date_str, fmt=None):
    if fmt:
        return datetime.strptime(date_str, fmt)
    # Try common formats
    for f in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(date_str, f)
        except ValueError:
            continue
    raise ValueError(f"Unrecognized date format: {date_str}")

def format_date(dt, fmt="%Y-%m-%d"):
    return dt.strftime(fmt)
