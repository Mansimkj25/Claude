# HR Tickets Report Automation

Automates the three columns you currently type by hand on the AskNow HR
tickets report:

| Column | How it's produced | Reliability |
|---|---|---|
| **Month Year** | Derived from each ticket's `Created` date (e.g. `Jun-26`) | 100% automatic |
| **Quarter** | Derived from the same date, fiscal year **Apr–Mar** (e.g. `Q1 FY26`) | 100% automatic |
| **Request Type** | Predicted from the `Short description` text | Auto-suggested (~86% match to how these were categorised historically), with a **Review Needed** flag on the borderline ones |

`Month Year` and `Quarter` are pure date math, so they're always correct —
and the tool also cleans up the manual-entry inconsistencies that had crept
into the history (e.g. `Q1 Fy24` → `Q1 FY24`, and June rows that Excel had
silently turned into the date `2026-06-26` instead of `Jun-26`).

`Request Type` is a *prediction*, so the tool never blindly trusts itself:
every predicted value gets a confidence level, uncertain rows are flagged
`Review Needed = Yes`, and any Request Type you've already filled in by hand
is kept and never overwritten.

---

## Quick start

**1. Install Python 3.9+** (once), then install the one dependency:

```bash
pip install openpyxl
```

**2. Export your monthly tickets from AskNow** to an `.xlsx` file (the usual
export — it just needs the `Number`, `Short description` and `Created`
columns; any extra columns are kept untouched).

**3. Run the tool:**

```bash
python classify_tickets.py "Jun 2026 export.xlsx"
```

This writes `Jun 2026 export_completed.xlsx` next to your input, with the
three columns filled in plus a few helper columns for review.

**4. Open the completed file** and skim the rows where **`Review Needed` =
`Yes`** — correct any Request Type there if needed. The rest are ready.

---

## What gets added to the file

| Column | Meaning |
|---|---|
| `Month Year` | Filled/refreshed from `Created` |
| `Quarter` | Filled/refreshed from `Created` (fiscal Apr–Mar) |
| `Request Type` | Predicted category (only fills blanks — your manual entries are kept) |
| `Request Type (Predicted)` | The tool's suggestion for **every** row, even ones you filled by hand (so you can compare) |
| `Prediction Confidence` | `High`, `Medium`, or `Default` (see below) |
| `Review Needed` | `Yes` on the rows worth a second look |

**Confidence levels:**
- **High** – strong keyword match, safe to trust.
- **Medium** – a weaker single signal; **these are flagged `Review Needed`**.
- **Default** – no keyword fired, so it fell back to `Workforce Data` (the
  high-volume catch-all bucket). Historically this default is right ~89% of
  the time, so it isn't force-flagged, but you can spot-check if you like.

---

## Options

```bash
python classify_tickets.py INPUT.xlsx                       # basic
python classify_tickets.py INPUT.xlsx -o OUTPUT.xlsx        # choose output name
python classify_tickets.py INPUT.xlsx --sheet Raw           # pick the sheet explicitly
python classify_tickets.py INPUT.xlsx --overwrite-request-type   # re-predict everything, ignore existing values
```

By default the tool auto-detects the data sheet (it looks for a sheet named
`Raw`, otherwise the first sheet that has `Short description` and `Created`).

---

## The four Request Types

Learned from the 2023–2026 history:

- **Workforce Data** — the catch-all for ad-hoc data pulls: employee/headcount
  lists, census, termination reports, employee info, compliance/audit data.
  ~80% of all tickets.
- **Scheduled Report** — setting up or changing a *recurring/scheduled* report
  or a distribution list ("schedule…", "recurring…", "add/remove … to
  distribution/sheet").
- **HiNext Access Issue** — problems accessing/downloading/exporting reports,
  or requests for access ("unable to download…", "no access…", "not working").
- **TA Report** — Talent Acquisition / recruiting: hiring, job openings, reqs,
  candidates, internal mobility, intercompany moves.

---

## Improving the predictions over time

The keyword rules live in the `CATEGORY_RULES` section near the top of
`classify_tickets.py`, each written as `(weight, regex)`. When you notice a
ticket that was mis-categorised, add a phrase from its description to the
matching category's rules and re-run. Higher weight = stronger signal; a
category needs a total score of at least `MIN_SCORE` (3) to beat the
`Workforce Data` default.

> **Why not 100% automatic for Request Type?** Because the historical
> categorisation depends on context that isn't always in the short
> description — the same wording (e.g. "Access to EMEA Census Report") was
> filed under different categories depending on the full ticket thread. A
> transparent, editable keyword approach reproduces the human choice ~86% of
> the time; the `Review Needed` flag covers most of the rest with a quick
> glance instead of retyping every row.

---

## Fiscal quarter reference (Apr–Mar)

| Months | Quarter |
|---|---|
| Apr – Jun | Q1 |
| Jul – Sep | Q2 |
| Oct – Dec | Q3 |
| Jan – Mar | Q4 |

The fiscal year is labelled by the calendar year of its April, e.g.
Apr 2026 – Mar 2027 = **FY26**. So Jan–Mar 2026 is **Q4 FY25**.
