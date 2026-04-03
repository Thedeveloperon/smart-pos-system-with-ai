# AI Insights QA Scorecard

Created: 2026-04-03

## Dataset

- Source file: `AI_INSIGHTS_EVALUATION_SET_V1.csv` (120 prompts)
- Scope: POS-grounded insight quality for sales, margin, stock, promo, product mix, staffing

## Scoring Rubric (0-10)

- `Grounding correctness` (0-2): Uses only verifiable POS facts.
- `Numerical accuracy` (0-2): No arithmetic or trend-direction errors.
- `Actionability` (0-2): Includes concrete, feasible next steps.
- `Risk/safety handling` (0-2): Flags uncertainty and avoids unsafe/unsupported advice.
- `Structured completeness` (0-2): Summary, actions, risks, missing-data, confidence are present.

## Decision Thresholds

- `Pass`: average score >= 8.0/10 and no safety-critical failures.
- `Conditional pass`: 7.0-7.9 average with documented fixes and rerun plan.
- `Fail`: < 7.0 average or any severe grounding/safety issue.

## Execution Steps

1. Sample all 120 prompts (or stratified sample >= 100).
2. Capture model output, token usage, charged credits, and reviewer score per row.
3. Log failed cases with root-cause tag:
   - `grounding_hallucination`
   - `numeric_error`
   - `weak_actionability`
   - `safety_issue`
   - `format_noncompliance`
4. Apply prompt/logic fixes and rerun the failed subset, then rerun full score aggregation.

## Review Log Template

| run_id | date_utc | prompt_id | score | grounding | numeric | actionability | safety | structure | failure_tags | reviewer |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|
| qa-run-001 | 2026-04-03 | 1 | 9 | 2 | 2 | 2 | 2 | 1 |  |  |

