"""
Fetches the Spartan race start list and extracts bib numbers for STG-wave athletes.
Usage: python3 scripts/fetch_stg_bibs.py <startListEventId>
Writes stg_bibs.json to the current directory.
"""
import sys, json, re, urllib.request

def strip_tags(s):
    return re.sub(r'<[^>]+>', ' ', s).strip()

def fetch_stg_bibs(event_id):
    bibs = []
    STG_WAVE = re.compile(r'\b\d{1,2}:\d{2}\s+STG\b')

    for page in range(1, 20):
        url = (
            f"https://spartanrace.onlinesystem.cz/Events/StartList"
            f"?eventid={event_id}&page={page}"
        )
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=15) as r:
                html = r.read().decode("utf-8")
        except Exception as e:
            print(f"Page {page} error: {e}", file=sys.stderr)
            break

        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL | re.IGNORECASE)
        page_count = 0

        for row in rows:
            row_text = strip_tags(row)
            if not STG_WAVE.search(row_text):
                continue
            # First 5-digit number in the row is the bib (SČ column)
            m = re.search(r"\b(\d{5})\b", row_text)
            if m:
                bibs.append(int(m.group(1)))
                page_count += 1

        print(f"Page {page}: {page_count} STG athletes", file=sys.stderr)

        # Stop when we hit an empty page
        if not rows or (page > 1 and page_count == 0):
            break

    return bibs

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: fetch_stg_bibs.py <eventId>", file=sys.stderr)
        sys.exit(1)

    event_id = sys.argv[1]
    bibs = fetch_stg_bibs(event_id)

    out = {"eventId": event_id, "bibs": bibs}
    with open("stg_bibs.json", "w") as f:
        json.dump(out, f)
    print(f"Saved {len(bibs)} STG bibs → stg_bibs.json", file=sys.stderr)
