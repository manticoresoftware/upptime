"""Show the exact checked URL in each Upptime-generated README summary row."""

from html import escape
from pathlib import Path
import re

START = "<!--start: status pages-->"
END = "<!--end: status pages-->"
# Upptime renders public sites as [site name](site url) in the first column.
# Private/secret URLs are not linked, and must stay undisclosed.
SITE_LINK = re.compile(r"\[([^\]\n]+)\]\((https?://[^|\r\n]+)\)$")


def show_urls(readme: str) -> str:
    if readme.count(START) != 1 or readme.count(END) != 1:
        raise ValueError("Expected exactly one Upptime summary section")

    before, remainder = readme.split(START, 1)
    summary, after = remainder.split(END, 1)
    rewritten = []
    changed = 0

    for line in summary.splitlines(keepends=True):
        if line.startswith("| "):
            first, delimiter, other_columns = line.partition(" | ")
            if delimiter:
                match = SITE_LINK.search(first)
                if match:
                    name, url = match.groups()
                    # Preserve the favicon and all status/history/metric columns.
                    first = (
                        f"{first[:match.start()]}[{url}]({url})"
                        f"<br><sub>{escape(name)}</sub>"
                    )
                    line = first + delimiter + other_columns
                    changed += 1
        rewritten.append(line)

    new_summary = "".join(rewritten)
    if not changed and "<br><sub>" not in new_summary:
        raise ValueError("No public Upptime site rows found; summary format may have changed")
    return before + START + new_summary + END + after


if __name__ == "__main__":
    path = Path("README.md")
    original = path.read_text(encoding="utf-8")
    updated = show_urls(original)
    if updated != original:
        path.write_text(updated, encoding="utf-8")
