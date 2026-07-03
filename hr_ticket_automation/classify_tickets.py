#!/usr/bin/env python3
"""
HR Tickets Report Automation
============================

Fills in the three columns you currently type by hand on the AskNow HR
tickets report:

  1. Month Year     -- derived from each ticket's "Created" date        (100% automatic)
  2. Quarter        -- derived from the same date, fiscal year Apr-Mar   (100% automatic)
  3. Request Type   -- predicted from the "Short description" text        (auto-suggested)

Month Year and Quarter are pure date math, so they are always correct and
this tool also cleans up the manual-entry inconsistencies that crept into
the history (e.g. "Q1 Fy24" vs "Q1 FY24").

Request Type is *predicted* from the ticket text using the keyword rules in
the CATEGORY_RULES section below. On the historical file the rules agree
with the human categorisation ~86% of the time, so the tool never blindly
trusts itself: every predicted value gets a confidence level and a
"Review Needed" flag, and any Request Type you have already filled in by
hand is preserved and never overwritten.

USAGE
-----
    python classify_tickets.py INPUT.xlsx
    python classify_tickets.py INPUT.xlsx -o OUTPUT.xlsx
    python classify_tickets.py INPUT.xlsx --sheet Raw --overwrite-request-type

The input can be any AskNow export that has (at least) the columns
"Number", "Short description" and "Created". Extra columns are kept as-is.

TUNING
------
To improve the Request Type predictions over time, edit CATEGORY_RULES
below. Each rule is (weight, regex). A ticket is scored for every category;
the highest-scoring category wins, and if no category reaches the minimum
score the ticket falls back to the default catch-all category. Higher
weights = stronger signals. Add the phrasing you see in newly mis-labelled
tickets and re-run.
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
from collections import Counter
from pathlib import Path

try:
    import openpyxl
except ImportError:  # pragma: no cover
    sys.exit("This tool needs openpyxl. Install it with:  pip install openpyxl")


# ---------------------------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------------------------

# Column headers (exactly as they appear in row 1 of the export).
COL_CREATED = "Created"            # source date for Month Year + Quarter
COL_TEXT = "Short description"     # source text for Request Type prediction
COL_MONTH_YEAR = "Month Year"      # will be created if missing
COL_QUARTER = "Quarter"            # will be created if missing
COL_REQUEST_TYPE = "Request Type"  # will be created if missing

# Extra helper columns the tool adds so you can review its work.
COL_PREDICTION = "Request Type (Predicted)"
COL_CONFIDENCE = "Prediction Confidence"
COL_REVIEW = "Review Needed"

# Fiscal year runs April -> March (Q1 = Apr-Jun). The fiscal year is labelled
# by the calendar year in which its April falls, e.g. Apr-2026..Mar-2027 = FY26.
FISCAL_START_MONTH = 4

# The default category assigned when no rule fires. This is the high-volume
# "catch-all" bucket for ad-hoc data pulls.
DEFAULT_CATEGORY = "Workforce Data"

# Minimum score a category must reach to beat the default.
MIN_SCORE = 3

# Keyword rules, learned from the 2023-2026 history. (weight, regex)
# Matching is case-insensitive.
CATEGORY_RULES: dict[str, list[tuple[int, str]]] = {
    "HiNext Access Issue": [
        (4, r"\b(unable|not able|cannot|can'?t|couldn'?t|can not)\b.{0,25}"
            r"\b(download|access|open|export|view|pull|get|see|find|receiv|log ?in)"),
        (4, r"\b(download|access|export|login|log ?in)\b.{0,20}"
            r"\b(issue|error|problem|fail|not work)"),
        (4, r"\bno (access|link|permission|option to)\b"),
        (4, r"\blost (access|permission)\b"),
        (3, r"\b(need|require|request|grant)\b.{0,15}\baccess\b"),
        (3, r"\baccess (issue|problem|to the|to a|to report|to workday|to hinext|"
            r"to term|to workforce|to census|denied)"),
        (3, r"\bnot (working|visible|receiving|able to)\b"),
        (2, r"\bempty report\b|\breport (not working|not visible)\b"),
        (2, r"\bpermission (to|denied|lost)\b"),
    ],
    "TA Report": [
        (4, r"\bTA\b|\btalent acquisition\b"),
        (4, r"\b(internal|talent) mobility\b|\bintercompany (move|movement)"),
        (3, r"\b(hiring|recruit\w*|candidate|applicant|job opening|open reqs?|"
            r"careers site)\b"),
        (2, r"\b(offers? accepted|source of (candidate|hire)|diversity data|QBR)\b"),
    ],
    "Scheduled Report": [
        (4, r"\bschedul\w+\b"),
        (4, r"\brecurr\w+\b"),
        (4, r"\b(distribution|distro)\b|\b(add|remove)\b.{0,30}"
            r"\b(distribution|list|sheet)\b"),
        (3, r"\bset ?up\b.{0,25}\b(report|data|census|job|distribution)"),
        (3, r"\bexisting report\b|\breport (update|modification) request\b"),
        (2, r"\bVIP\b"),
    ],
}

# Pre-compile the rules once.
_COMPILED = {
    cat: [(w, re.compile(pat, re.IGNORECASE)) for w, pat in rules]
    for cat, rules in CATEGORY_RULES.items()
}


# ---------------------------------------------------------------------------
# CORE LOGIC
# ---------------------------------------------------------------------------

def to_datetime(value) -> dt.datetime | None:
    """Best-effort conversion of a cell value into a datetime."""
    if value is None or value == "":
        return None
    if isinstance(value, dt.datetime):
        return value
    if isinstance(value, dt.date):
        return dt.datetime(value.year, value.month, value.day)
    if isinstance(value, (int, float)):
        # Excel serial date (days since 1899-12-30).
        try:
            return dt.datetime(1899, 12, 30) + dt.timedelta(days=float(value))
        except (OverflowError, ValueError):
            return None
    # String: try a few common formats, then a couple of loose fallbacks.
    text = str(value).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y %H:%M:%S",
                "%d/%m/%Y", "%m/%d/%Y %H:%M:%S", "%m/%d/%Y",
                "%d-%b-%Y", "%d-%b-%y", "%b-%y", "%b-%Y"):
        try:
            return dt.datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def month_year(d: dt.datetime) -> str:
    """'Apr-26' style, matching the historical report."""
    return d.strftime("%b-%y")


def quarter(d: dt.datetime) -> str:
    """Fiscal quarter label, e.g. 'Q1 FY26' (fiscal year Apr-Mar)."""
    # Months since the start of the fiscal year (0-based).
    offset = (d.month - FISCAL_START_MONTH) % 12
    q = offset // 3 + 1
    # Fiscal year label = calendar year of the fiscal-year's April.
    fy_year = d.year if d.month >= FISCAL_START_MONTH else d.year - 1
    return f"Q{q} FY{fy_year % 100:02d}"


def predict_request_type(text: str) -> tuple[str, int]:
    """Return (category, score). Falls back to DEFAULT_CATEGORY below MIN_SCORE."""
    if not text:
        return DEFAULT_CATEGORY, 0
    scores = {
        cat: sum(w for w, rx in rules if rx.search(text))
        for cat, rules in _COMPILED.items()
    }
    best = max(scores, key=scores.get)
    if scores[best] < MIN_SCORE:
        return DEFAULT_CATEGORY, 0
    return best, scores[best]


def confidence_level(category: str, score: int) -> str:
    """Human-friendly confidence bucket."""
    if score >= 4:
        return "High"
    if score == MIN_SCORE:
        return "Medium"
    return "Default"  # no keyword fired -> fell back to the catch-all category


def needs_review(confidence: str) -> str:
    """Which rows a human should glance at. 'Default' (catch-all) and 'High'
    are left alone; only the genuinely borderline 'Medium' rows are flagged."""
    return "Yes" if confidence == "Medium" else ""


# ---------------------------------------------------------------------------
# WORKBOOK HANDLING
# ---------------------------------------------------------------------------

def pick_sheet(wb, requested: str | None):
    """Choose the worksheet that holds the ticket rows."""
    if requested:
        if requested not in wb.sheetnames:
            sys.exit(f"Sheet {requested!r} not found. Available: {wb.sheetnames}")
        return wb[requested]
    # Prefer a sheet named 'Raw', else the first sheet that has our key columns.
    if "Raw" in wb.sheetnames:
        return wb["Raw"]
    for ws in wb.worksheets:
        headers = [c.value for c in ws[1]]
        if COL_TEXT in headers and COL_CREATED in headers:
            return ws
    return wb.worksheets[0]


def header_map(ws) -> dict[str, int]:
    """Map header text -> 1-based column index for row 1."""
    return {c.value: c.column for c in ws[1] if c.value not in (None, "")}


def ensure_column_after(ws, headers: dict[str, int], after_col: int, name: str) -> int:
    """Return the column index for `name`. If it doesn't exist yet, insert a
    brand-new column for it immediately after `after_col` (instead of tacking
    it onto the far right of the sheet, which would scramble the familiar
    column order). Existing columns are shifted right as needed; `headers`
    is updated in place to reflect the new positions."""
    if name in headers:
        return headers[name]
    new_col = after_col + 1
    ws.insert_cols(new_col)
    ws.cell(row=1, column=new_col, value=name)
    for key, idx in list(headers.items()):
        if idx >= new_col:
            headers[key] = idx + 1
    headers[name] = new_col
    return new_col


def process(input_path: Path, output_path: Path, sheet: str | None,
            overwrite_request_type: bool) -> None:
    wb = openpyxl.load_workbook(input_path)
    ws = pick_sheet(wb, sheet)
    headers = header_map(ws)

    for required in (COL_CREATED, COL_TEXT):
        if required not in headers:
            sys.exit(f"Required column {required!r} not found on sheet "
                     f"{ws.title!r}. Found: {list(headers)}")

    c_created = headers[COL_CREATED]
    c_text = headers[COL_TEXT]
    # Missing columns are inserted right next to where they logically belong,
    # so the report keeps a sensible, familiar layout instead of dumping new
    # columns at the far right of the sheet.
    c_month = ensure_column_after(ws, headers, c_created, COL_MONTH_YEAR)
    c_qtr = ensure_column_after(ws, headers, c_month, COL_QUARTER)
    c_rtype = ensure_column_after(ws, headers, c_qtr, COL_REQUEST_TYPE)
    c_pred = ensure_column_after(ws, headers, c_rtype, COL_PREDICTION)
    c_conf = ensure_column_after(ws, headers, c_pred, COL_CONFIDENCE)
    c_review = ensure_column_after(ws, headers, c_conf, COL_REVIEW)

    stats = Counter()
    rows = filled = predicted = kept_manual = review_count = undated = 0

    for r in range(2, ws.max_row + 1):
        number = ws.cell(row=r, column=headers.get("Number", c_created)).value
        text_val = ws.cell(row=r, column=c_text).value
        # Skip fully blank trailing rows.
        if number in (None, "") and text_val in (None, ""):
            continue
        rows += 1

        # --- Month Year + Quarter (deterministic; overwritten to fix typos) ---
        d = to_datetime(ws.cell(row=r, column=c_created).value)
        if d is not None:
            ws.cell(row=r, column=c_month, value=month_year(d))
            ws.cell(row=r, column=c_qtr, value=quarter(d))
            filled += 1
        else:
            undated += 1

        # --- Request Type prediction ---
        text = "" if text_val is None else str(text_val)
        category, score = predict_request_type(text)
        conf = confidence_level(category, score)
        ws.cell(row=r, column=c_pred, value=category)
        ws.cell(row=r, column=c_conf, value=conf)

        existing = ws.cell(row=r, column=c_rtype).value
        if existing not in (None, "") and not overwrite_request_type:
            # Respect a value a human already entered.
            kept_manual += 1
            # Flag if the human and the model disagree, worth a second look.
            flag = "Yes" if str(existing).strip() != category else ""
            ws.cell(row=r, column=c_review, value=flag)
            if flag:
                review_count += 1
            stats[str(existing).strip()] += 1
        else:
            ws.cell(row=r, column=c_rtype, value=category)
            predicted += 1
            flag = needs_review(conf)
            ws.cell(row=r, column=c_review, value=flag)
            if flag:
                review_count += 1
            stats[category] += 1

    wb.save(output_path)

    # --- Summary report ---
    print(f"\nProcessed {rows} tickets on sheet {ws.title!r}")
    print(f"  Month Year + Quarter filled : {filled}"
          + (f"   ({undated} rows had no readable Created date)" if undated else ""))
    print(f"  Request Type predicted      : {predicted}")
    if kept_manual:
        print(f"  Existing Request Type kept  : {kept_manual}")
    print(f"  Rows flagged 'Review Needed' : {review_count}")
    print("\n  Request Type distribution:")
    for cat, n in stats.most_common():
        print(f"    {n:5d}  {cat}")
    print(f"\nSaved -> {output_path}")
    print("Open it and check the rows where 'Review Needed' = Yes.\n")


def main(argv=None):
    ap = argparse.ArgumentParser(description="Automate the HR tickets report "
                                             "(Month Year, Quarter, Request Type).")
    ap.add_argument("input", type=Path, help="AskNow export (.xlsx)")
    ap.add_argument("-o", "--output", type=Path, default=None,
                    help="Output file (default: <input>_completed.xlsx)")
    ap.add_argument("--sheet", default=None,
                    help="Worksheet name (default: auto-detect / 'Raw')")
    ap.add_argument("--overwrite-request-type", action="store_true",
                    help="Replace existing Request Type values with predictions "
                         "(default: keep any value already entered by hand)")
    args = ap.parse_args(argv)

    if not args.input.exists():
        sys.exit(f"Input file not found: {args.input}")
    output = args.output or args.input.with_name(args.input.stem + "_completed.xlsx")
    process(args.input, output, args.sheet, args.overwrite_request_type)


if __name__ == "__main__":
    main()
