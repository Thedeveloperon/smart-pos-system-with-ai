#!/usr/bin/env python3
"""
Summarize OpenAI OCR staged pilot results from CSV into a signoff-ready markdown report.

Usage:
  python3 scripts/purchases/summarize_openai_ocr_pilot.py \
    --input SUPPLIER_BILL_OPENAI_OCR_STAGED_PILOT_RESULTS_TEMPLATE.csv \
    --output SUPPLIER_BILL_OPENAI_OCR_STAGED_PILOT_SUMMARY_2026-04-06.md
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


TRUE_VALUES = {"1", "true", "yes", "y", "pass", "passed", "ok"}
IMAGE_FILE_TYPES = {"jpg", "jpeg", "png", "image/jpg", "image/jpeg", "image/png"}


@dataclass(frozen=True)
class Thresholds:
    min_bills: int = 20
    min_suppliers: int = 5
    fallback_rate_max: float = 0.10
    manual_review_rate_max: float = 0.60
    totals_mismatch_rate_max: float = 0.20


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Summarize OpenAI OCR staged pilot results CSV into markdown."
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Path to staged pilot CSV results file.",
    )
    parser.add_argument(
        "--output",
        required=False,
        help="Optional output markdown file path. Prints to stdout when omitted.",
    )
    return parser.parse_args()


def normalize(value: str | None) -> str:
    return (value or "").strip()


def normalize_lower(value: str | None) -> str:
    return normalize(value).lower()


def parse_bool(value: str | None) -> bool:
    return normalize_lower(value) in TRUE_VALUES


def parse_blocked_reasons(raw_value: str | None) -> set[str]:
    value = normalize(raw_value)
    if not value:
        return set()

    if value.startswith("[") and value.endswith("]"):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return {
                    normalize_lower(str(item))
                    for item in parsed
                    if normalize(str(item))
                }
        except json.JSONDecodeError:
            pass

    cleaned = value.replace("[", "").replace("]", "").replace('"', "").replace("'", "")
    tokens = [normalize_lower(part) for part in re.split(r"[,;|]", cleaned)]
    return {token for token in tokens if token}


def safe_rate(numerator: int, denominator: int) -> float | None:
    if denominator <= 0:
        return None
    return numerator / denominator


def pct(rate: float | None) -> str:
    if rate is None:
        return "n/a"
    return f"{rate * 100:.2f}%"


def yes_no(value: bool) -> str:
    return "PASS" if value else "FAIL"


def is_completed_row(row: dict[str, str]) -> bool:
    material_fields = [
        "executed_at_utc",
        "operator",
        "supplier_name",
        "file_name",
        "draft_status",
        "confirm_status",
    ]
    return any(normalize(row.get(field)) for field in material_fields)


def build_markdown(
    *,
    csv_path: Path,
    rows: list[dict[str, str]],
    thresholds: Thresholds,
) -> str:
    completed_rows = [row for row in rows if is_completed_row(row)]
    operators = sorted(
        {
            normalize(row.get("operator"))
            for row in completed_rows
            if normalize(row.get("operator"))
        }
    )
    has_dev_dryrun_operator = any(
        operator.lower().startswith("codex-local-dryrun") for operator in operators
    )
    supplier_set = {
        normalize(row.get("supplier_name"))
        for row in completed_rows
        if normalize(row.get("supplier_name"))
    }
    supplier_count = len(supplier_set)

    file_types = [normalize_lower(row.get("file_type")) for row in completed_rows]
    pdf_count = sum(1 for ftype in file_types if ftype == "pdf")
    image_count = sum(1 for ftype in file_types if ftype in IMAGE_FILE_TYPES)

    draft_rows = [row for row in completed_rows if normalize(row.get("draft_status"))]
    draft_count = len(draft_rows)

    manual_review_count = 0
    fallback_count = 0
    totals_mismatch_count = 0
    for row in draft_rows:
        draft_status = normalize_lower(row.get("draft_status"))
        review_required = parse_bool(row.get("review_required"))
        blocked_reasons = parse_blocked_reasons(row.get("blocked_reasons"))

        if review_required or draft_status in {"manual_review_required", "review_required"}:
            manual_review_count += 1
        if "ocr_provider_unavailable" in blocked_reasons:
            fallback_count += 1
        if any("totals_mismatch" in reason for reason in blocked_reasons):
            totals_mismatch_count += 1

    confirm_attempted_count = 0
    confirmed_count = 0
    replay_count = 0
    stock_verified_count = 0
    ledger_verified_count = 0
    duplicate_attempt_count = 0
    duplicate_rejected_count = 0

    for row in completed_rows:
        confirm_status = normalize_lower(row.get("confirm_status"))
        confirm_attempted = parse_bool(row.get("confirm_attempted")) or bool(confirm_status)
        if confirm_attempted:
            confirm_attempted_count += 1
        if confirm_status == "confirmed":
            confirmed_count += 1
        if confirm_status == "idempotent_replay" or parse_bool(row.get("idempotent_replay")):
            replay_count += 1

        if parse_bool(row.get("duplicate_check_attempted")):
            duplicate_attempt_count += 1
            if parse_bool(row.get("duplicate_rejected")):
                duplicate_rejected_count += 1

        if parse_bool(row.get("stock_delta_verified")):
            stock_verified_count += 1
        if parse_bool(row.get("ledger_entry_verified")):
            ledger_verified_count += 1

    manual_review_rate = safe_rate(manual_review_count, draft_count)
    fallback_rate = safe_rate(fallback_count, draft_count)
    totals_mismatch_rate = safe_rate(totals_mismatch_count, draft_count)
    duplicate_reject_rate = safe_rate(duplicate_rejected_count, duplicate_attempt_count)

    min_bills_pass = len(completed_rows) >= thresholds.min_bills
    min_suppliers_pass = supplier_count >= thresholds.min_suppliers
    fallback_pass = fallback_rate is not None and fallback_rate <= thresholds.fallback_rate_max
    manual_review_pass = (
        manual_review_rate is not None
        and manual_review_rate <= thresholds.manual_review_rate_max
    )
    totals_mismatch_pass = (
        totals_mismatch_rate is not None
        and totals_mismatch_rate <= thresholds.totals_mismatch_rate_max
    )
    duplicate_pass = (
        duplicate_attempt_count > 0 and duplicate_rejected_count == duplicate_attempt_count
    )
    stock_pass = confirmed_count > 0 and stock_verified_count >= confirmed_count
    ledger_pass = confirmed_count > 0 and ledger_verified_count >= confirmed_count

    overall_go = all(
        [
            min_bills_pass,
            min_suppliers_pass,
            fallback_pass,
            manual_review_pass,
            totals_mismatch_pass,
            duplicate_pass,
            stock_pass,
            ledger_pass,
        ]
    )

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")

    lines: list[str] = []
    lines.append("# Supplier Bill OpenAI OCR Staged Pilot Summary")
    lines.append("")
    lines.append(f"Generated At (UTC): {generated_at}")
    lines.append(f"Source CSV: `{csv_path}`")
    if operators:
        lines.append(f"Operators: `{', '.join(operators)}`")
    if has_dev_dryrun_operator:
        lines.append(
            "Note: current dataset includes local development dry-run entries and is not staging signoff evidence."
        )
    lines.append("")
    lines.append("## Input Coverage")
    lines.append("")
    lines.append(f"- Completed runs: `{len(completed_rows)}`")
    lines.append(f"- Supplier diversity: `{supplier_count}`")
    lines.append(f"- PDF files: `{pdf_count}`")
    lines.append(f"- JPG/PNG files: `{image_count}`")
    lines.append("")
    lines.append("## KPI Snapshot")
    lines.append("")
    lines.append(f"- Draft rows: `{draft_count}`")
    lines.append(f"- Manual review count: `{manual_review_count}`")
    lines.append(f"- OCR provider fallback count: `{fallback_count}`")
    lines.append(f"- Totals mismatch count: `{totals_mismatch_count}`")
    lines.append(f"- Confirm attempted: `{confirm_attempted_count}`")
    lines.append(f"- Confirmed: `{confirmed_count}`")
    lines.append(f"- Idempotent replay rows: `{replay_count}`")
    lines.append(f"- Duplicate checks attempted: `{duplicate_attempt_count}`")
    lines.append(f"- Duplicate checks rejected: `{duplicate_rejected_count}`")
    lines.append(f"- Stock reconciliation verified rows: `{stock_verified_count}`")
    lines.append(f"- Ledger reconciliation verified rows: `{ledger_verified_count}`")
    lines.append("")
    lines.append("## Acceptance Gates")
    lines.append("")
    lines.append(f"- Minimum bills (`>= {thresholds.min_bills}`): `{yes_no(min_bills_pass)}`")
    lines.append(f"- Minimum suppliers (`>= {thresholds.min_suppliers}`): `{yes_no(min_suppliers_pass)}`")
    lines.append(
        f"- Fallback rate (`<= {thresholds.fallback_rate_max:.0%}`): `{pct(fallback_rate)}` -> `{yes_no(fallback_pass)}`"
    )
    lines.append(
        f"- Manual review rate (`<= {thresholds.manual_review_rate_max:.0%}`): `{pct(manual_review_rate)}` -> `{yes_no(manual_review_pass)}`"
    )
    lines.append(
        f"- Totals mismatch rate (`<= {thresholds.totals_mismatch_rate_max:.0%}`): `{pct(totals_mismatch_rate)}` -> `{yes_no(totals_mismatch_pass)}`"
    )
    lines.append(
        f"- Duplicate rejection (`100%`): `{pct(duplicate_reject_rate)}` -> `{yes_no(duplicate_pass)}`"
    )
    lines.append(
        f"- Stock reconciliation for confirmed imports (`100%`): `{yes_no(stock_pass)}`"
    )
    lines.append(
        f"- Ledger reconciliation for confirmed imports (`100%`): `{yes_no(ledger_pass)}`"
    )
    lines.append("")
    lines.append("## Verdict")
    lines.append("")
    lines.append(f"- Overall pilot verdict: `{'GO' if overall_go else 'NO-GO'}`")
    lines.append(
        "- Use this summary to fill `SUPPLIER_BILL_OPENAI_OCR_GO_NO_GO_SIGNOFF.md` Pilot Evidence and Decision sections."
    )
    lines.append("")
    return "\n".join(lines)


def read_rows(csv_path: Path) -> list[dict[str, str]]:
    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        return [dict(row) for row in reader]


def main() -> int:
    args = parse_args()
    csv_path = Path(args.input).expanduser().resolve()
    if not csv_path.exists():
        raise FileNotFoundError(f"Input CSV not found: {csv_path}")

    rows = read_rows(csv_path)
    markdown = build_markdown(csv_path=csv_path, rows=rows, thresholds=Thresholds())

    if args.output:
        output_path = Path(args.output).expanduser().resolve()
        output_path.write_text(markdown, encoding="utf-8")
        print(f"Wrote pilot summary: {output_path}")
    else:
        print(markdown)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
