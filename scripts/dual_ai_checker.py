#!/usr/bin/env python3
"""
DUAL_AI_CHECKER — Two Claude instances loop until code matches architecture.

Claude A (Builder): fixes code based on feedback
Claude B (Reviewer): reviews code against docs, produces findings

Loop ends when the Reviewer returns LGTM or max rounds hit.

Usage:
    python scripts/dual_ai_checker.py
    python scripts/dual_ai_checker.py --scope "src/shared/dynamo_control.py"
    python scripts/dual_ai_checker.py --scope "src/lambdas/" --max-rounds 5
    python scripts/dual_ai_checker.py --docs-path docs/ --scope "schemas/"
    python scripts/dual_ai_checker.py --run-tests  # also require tests to pass
    python scripts/dual_ai_checker.py --builder-prompt "You are a Go expert. Fix issues concisely."
    python scripts/dual_ai_checker.py --reviewer-prompt "Focus only on security issues."
"""

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# ── Defaults ──────────────────────────────────────────────────────────────────

DEFAULT_DOCS_PATH = "docs/"
DEFAULT_MAX_ROUNDS = 10
DEFAULT_MODEL = "sonnet"
ROUNDS_DIR = Path("scripts/.dual_ai_rounds")
UNIFIED_DOCS_PATH = Path("DOCS.md")

# ── Prompts ───────────────────────────────────────────────────────────────────

REVIEWER_SYSTEM = """\
You are a strict architecture reviewer. Your ONLY job is to verify that the \
code matches the architecture docs. You are not writing code — you are reading \
code and comparing it against the documented specs, ADRs, guides, and contracts.

Rules:
- Read the docs thoroughly FIRST, then read the code under review.
- Compare every claim in the docs against the actual implementation.
- Check: naming, data flow, contracts, error handling, storage patterns, \
  invariants, scope boundaries (things that should NOT be built yet).
- Be concrete. Reference specific files, line numbers, doc sections.
- Do NOT invent requirements that aren't in the docs.
- Do NOT suggest style preferences or refactors beyond what the docs require.

Output format — you MUST use exactly one of these:

If issues found:
```json
{
  "status": "fail",
  "issues": [
    {
      "file": "path/to/file.py",
      "doc_reference": "specs/runtime-contracts.md § processor",
      "severity": "must_fix",
      "description": "What's wrong and what the doc says it should be"
    }
  ]
}
```

If everything aligns:
```json
{"status": "pass", "summary": "Brief statement of what was verified"}
```

Severity levels:
- must_fix: code contradicts the docs
- should_fix: code is missing something the docs specify
- note: minor inconsistency, non-blocking
"""

BUILDER_SYSTEM = """\
You are a code builder. You receive architecture review findings and fix the \
code to match the documented architecture. Rules:

- Read the referenced docs to understand what's expected.
- Fix every must_fix and should_fix issue.
- Make minimal changes — only what's needed to match the docs.
- Do not refactor, add features, or "improve" beyond what the docs specify.
- Run tests after your changes if a test suite exists.
- After fixing, briefly state what you changed and why.
"""


# ── Unified DOCS.md ──────────────────────────────────────────────────────────

def _last_docs_commit_epoch(docs_path: str) -> float:
    """Return the Unix epoch of the most recent commit touching docs/ or CLAUDE.md."""
    try:
        result = subprocess.run(
            ["git", "log", "-1", "--format=%ct", "--", docs_path, "CLAUDE.md"],
            capture_output=True, text=True, check=True,
        )
        return float(result.stdout.strip()) if result.stdout.strip() else 0.0
    except (subprocess.CalledProcessError, ValueError):
        return 0.0


def _docs_md_is_fresh(docs_path: str) -> bool:
    """True if DOCS.md exists and was modified after the last commit to docs/."""
    if not UNIFIED_DOCS_PATH.exists():
        return False
    docs_mtime = os.path.getmtime(UNIFIED_DOCS_PATH)
    last_commit = _last_docs_commit_epoch(docs_path)
    return docs_mtime > last_commit


def _synthesize_docs(docs_path: str, model: str) -> None:
    """Use Claude to read all docs and produce a unified DOCS.md."""
    print("  [docs] DOCS.md is stale or missing — synthesizing from docs/ ...")
    prompt = (
        f"Read CLAUDE.md and every file under `{docs_path}` (ADRs, specs, guides, roadmap). "
        "Synthesize them into a single comprehensive reference document. "
        "Preserve all important details: contracts, data models, invariants, rules, "
        "ADR decisions, failure modes, and scope boundaries. "
        "Organize by topic (not by source file). Use markdown. "
        "Do NOT omit details — this replaces reading the individual docs. "
        f"Write the result to `{UNIFIED_DOCS_PATH}`."
    )
    run_claude(
        prompt=prompt,
        system_prompt="You are a technical writer. Synthesize docs into one reference file.",
        model=model,
        allowed_tools="Read,Glob,Write",
        label="docs-synth",
    )
    if UNIFIED_DOCS_PATH.exists():
        size_kb = UNIFIED_DOCS_PATH.stat().st_size / 1024
        print(f"  [docs] DOCS.md written ({size_kb:.0f} KB)")
    else:
        print("  [docs] WARNING: DOCS.md was not created — falling back to docs/")


def ensure_unified_docs(docs_path: str, model: str) -> str:
    """Ensure DOCS.md is fresh. Returns the path to use for review."""
    if _docs_md_is_fresh(docs_path):
        size_kb = UNIFIED_DOCS_PATH.stat().st_size / 1024
        print(f"  [docs] DOCS.md is fresh ({size_kb:.0f} KB) — using it")
        return str(UNIFIED_DOCS_PATH)
    _synthesize_docs(docs_path, model)
    return str(UNIFIED_DOCS_PATH) if UNIFIED_DOCS_PATH.exists() else docs_path


def build_reviewer_prompt(docs_path: str, scope: str, prior_feedback: str | None = None) -> str:
    """Construct the reviewer's prompt for this round."""
    parts = [
        f"Review the code in `{scope}` against the architecture docs in `{docs_path}`.",
        "Read CLAUDE.md first for the full system context.",
        f"Read every relevant doc in `{docs_path}` — ADRs, specs, guides, roadmap.",
        f"Then read the code under `{scope}` thoroughly.",
        "Compare and produce your findings as structured JSON.",
    ]
    if prior_feedback:
        parts.append(
            f"\nThe builder just made fixes based on prior feedback. "
            f"Verify those fixes AND check for any remaining issues.\n"
            f"Prior feedback was:\n{prior_feedback}"
        )
    return "\n".join(parts)


def build_builder_prompt(docs_path: str, scope: str, feedback_json: str) -> str:
    """Construct the builder's prompt for this round."""
    return (
        f"Fix the code in `{scope}` to match the architecture docs in `{docs_path}`.\n"
        f"Read CLAUDE.md first for full context.\n"
        f"Read the referenced docs for each issue before fixing.\n\n"
        f"Review findings to address:\n{feedback_json}\n\n"
        f"Fix every must_fix and should_fix issue. Make minimal changes."
    )


# ── Runner ────────────────────────────────────────────────────────────────────

def run_claude(
    prompt: str, system_prompt: str, model: str, allowed_tools: str, label: str,
    log_dir: Path = ROUNDS_DIR,
) -> str:
    """Run claude -p, stream output live to terminal and capture for return."""
    cmd = [
        "claude", "-p", prompt,
        "--model", model,
        "--system-prompt", system_prompt,
        "--allowedTools", allowed_tools,
        "--max-turns", "50",
        "--verbose",
        "--output-format", "stream-json",
        "--dangerously-skip-permissions",
    ]

    prefix = f"  [{label}]"
    print(f"{prefix} Running claude -p ...")
    start = time.time()
    captured_lines: list[str] = []
    final_text_parts: list[str] = []

    # Send stderr to /dev/null to avoid pipe deadlock — if the stderr buffer
    # fills (64 KB) while we're blocked reading stdout, the subprocess blocks
    # on its stderr write and we deadlock.  With --verbose, Claude CLI writes
    # enough debug output to stderr to trigger this reliably.
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    try:
        for raw_line in proc.stdout:
            raw_line = raw_line.rstrip("\n")
            if not raw_line:
                continue
            captured_lines.append(raw_line)

            # Parse streaming JSON events for live display
            try:
                event = json.loads(raw_line)
            except json.JSONDecodeError:
                continue

            etype = event.get("type", "")

            # Tool use — show what it's doing
            if etype == "assistant" and "message" in event:
                msg = event["message"]
                for block in msg.get("content", []):
                    if block.get("type") == "tool_use":
                        tool_name = block.get("name", "?")
                        tool_input = block.get("input", {})
                        # Summarize the tool call
                        if tool_name == "Read":
                            detail = tool_input.get("file_path", "")
                            print(f"{prefix}  Read {detail}")
                        elif tool_name == "Edit":
                            detail = tool_input.get("file_path", "")
                            print(f"{prefix}  Edit {detail}")
                        elif tool_name == "Write":
                            detail = tool_input.get("file_path", "")
                            print(f"{prefix}  Write {detail}")
                        elif tool_name in ("Glob", "Grep"):
                            pattern = tool_input.get("pattern", "")
                            print(f"{prefix}  {tool_name} {pattern}")
                        elif tool_name == "Bash":
                            cmd_str = tool_input.get("command", "")
                            print(f"{prefix}  Bash: {cmd_str[:80]}")
                        else:
                            print(f"{prefix}  {tool_name}")
                    elif block.get("type") == "text":
                        text = block.get("text", "")
                        if text.strip():
                            final_text_parts.append(text)
                            # Show short summary lines from Claude's thinking
                            for line in text.strip().split("\n")[:2]:
                                if len(line) > 120:
                                    line = line[:117] + "..."
                                print(f"{prefix}  > {line}")

            # Result events contain the final text output
            elif etype == "result":
                result_text = event.get("result", "")
                if result_text:
                    final_text_parts.append(result_text)

        proc.wait(timeout=600)
    except subprocess.TimeoutExpired:
        proc.kill()
        print(f"{prefix} TIMED OUT after 600s")

    # Save full streaming log
    log_dir.mkdir(parents=True, exist_ok=True)

    # Return the final text output
    return "\n".join(final_text_parts).strip() if final_text_parts else "\n".join(captured_lines)


def run_tests() -> tuple[bool, str]:
    """Run pytest and return (passed, output)."""
    print("  [tests] Running pytest ...")
    result = subprocess.run(
        ["python", "-m", "pytest", "tests/", "-x", "--tb=short", "-q"],
        capture_output=True, text=True, timeout=300,
    )
    passed = result.returncode == 0
    output = (result.stdout + result.stderr).strip()
    status = "PASSED" if passed else "FAILED"
    print(f"  [tests] {status}")
    return passed, output


def extract_json(text: str) -> dict | None:
    """Pull the first JSON object out of the reviewer's response."""
    # Try to find JSON block in markdown fence
    for marker in ("```json", "```"):
        if marker in text:
            start = text.index(marker) + len(marker)
            end = text.index("```", start)
            try:
                return json.loads(text[start:end].strip())
            except json.JSONDecodeError:
                continue

    # Try the whole text
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to find { ... } substring
    brace_start = text.find("{")
    brace_end = text.rfind("}")
    if brace_start != -1 and brace_end > brace_start:
        try:
            return json.loads(text[brace_start : brace_end + 1])
        except json.JSONDecodeError:
            pass

    return None


def save_round(round_num: int, role: str, content: str) -> None:
    """Save round output for debugging."""
    ROUNDS_DIR.mkdir(parents=True, exist_ok=True)
    path = ROUNDS_DIR / f"round_{round_num:02d}_{role}.txt"
    path.write_text(content)


# ── Main loop ─────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Dual AI architecture checker")
    parser.add_argument("--docs-path", default=DEFAULT_DOCS_PATH, help="Path to docs directory")
    parser.add_argument("--scope", default="src/", help="Code path to review (file or directory)")
    parser.add_argument("--max-rounds", type=int, default=DEFAULT_MAX_ROUNDS, help="Max review/fix rounds")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Claude model (sonnet, opus, haiku)")
    parser.add_argument("--builder-model", default=None, help="Override model for builder (defaults to --model)")
    parser.add_argument("--reviewer-model", default=None, help="Override model for reviewer (defaults to --model)")
    parser.add_argument("--run-tests", action="store_true", help="Also require tests to pass")
    parser.add_argument("--verbose", action="store_true", help="Print full Claude output")
    parser.add_argument("--builder-prompt", default=None, help="Override default builder system prompt")
    parser.add_argument("--reviewer-prompt", default=None, help="Override default reviewer system prompt")
    args = parser.parse_args()

    builder_model = args.builder_model or args.model
    reviewer_model = args.reviewer_model or args.model
    builder_system = args.builder_prompt or BUILDER_SYSTEM
    reviewer_system = args.reviewer_prompt or REVIEWER_SYSTEM

    # Reviewer only reads — no edit/write
    reviewer_tools = "Read,Glob,Grep,Bash(find:*),Bash(wc:*)"
    # Builder can edit code and run tests
    builder_tools = "Read,Edit,Write,Glob,Grep,Bash"

    print(f"{'=' * 60}")
    print(f"DUAL AI CHECKER")
    print(f"  docs:     {args.docs_path}")
    print(f"  scope:    {args.scope}")
    print(f"  builder:  {builder_model}")
    print(f"  reviewer: {reviewer_model}")
    print(f"  max:      {args.max_rounds} rounds")
    print(f"  tests:    {'yes' if args.run_tests else 'no'}")
    print(f"  started:  {datetime.now().isoformat()}")
    print(f"{'=' * 60}\n")

    # ── Ensure unified DOCS.md is fresh ─────────────────────────────
    effective_docs = ensure_unified_docs(args.docs_path, reviewer_model)

    prior_feedback = None

    for round_num in range(1, args.max_rounds + 1):
        print(f"── Round {round_num}/{args.max_rounds} {'─' * 40}")

        # ── Reviewer pass ─────────────────────────────────────────────
        print("\n  REVIEWER evaluating code against docs ...")
        reviewer_prompt = build_reviewer_prompt(effective_docs, args.scope, prior_feedback)
        reviewer_output = run_claude(
            reviewer_prompt, reviewer_system, reviewer_model, reviewer_tools, "reviewer"
        )
        save_round(round_num, "reviewer", reviewer_output)

        if args.verbose:
            print(f"\n  Reviewer output:\n{reviewer_output}\n")

        findings = extract_json(reviewer_output)

        if findings is None:
            print("  WARNING: Could not parse reviewer JSON. Raw output saved.")
            print(f"  Last 200 chars: ...{reviewer_output[-200:]}")
            prior_feedback = reviewer_output
            continue

        status = findings.get("status", "fail")
        issues = findings.get("issues", [])
        must_fix = [i for i in issues if i.get("severity") == "must_fix"]
        should_fix = [i for i in issues if i.get("severity") == "should_fix"]
        notes = [i for i in issues if i.get("severity") == "note"]

        print(f"  Status: {status}")
        if issues:
            print(f"  Issues: {len(must_fix)} must_fix, {len(should_fix)} should_fix, {len(notes)} notes")
            for issue in must_fix + should_fix:
                print(f"    - [{issue['severity']}] {issue.get('file', '?')}: {issue['description'][:100]}")

        # ── Check convergence ─────────────────────────────────────────
        tests_ok = True
        if args.run_tests:
            tests_ok, test_output = run_tests()
            save_round(round_num, "tests", test_output)

        if status == "pass" and tests_ok:
            print(f"\n{'=' * 60}")
            print(f"CONVERGED in {round_num} round{'s' if round_num > 1 else ''}")
            print(f"  Summary: {findings.get('summary', 'All checks passed')}")
            print(f"  Finished: {datetime.now().isoformat()}")
            print(f"{'=' * 60}")
            return 0

        if status == "pass" and not tests_ok:
            print("  Reviewer satisfied but tests failing — builder will fix tests")
            feedback_for_builder = json.dumps({
                "status": "fail",
                "issues": [{
                    "file": "tests/",
                    "doc_reference": "test output",
                    "severity": "must_fix",
                    "description": f"Tests are failing:\n{test_output[-1000:]}"
                }]
            }, indent=2)
        else:
            feedback_for_builder = json.dumps(findings, indent=2)

        # ── Builder pass ──────────────────────────────────────────────
        print(f"\n  BUILDER fixing {len(must_fix) + len(should_fix)} issues ...")
        builder_prompt = build_builder_prompt(effective_docs, args.scope, feedback_for_builder)
        builder_output = run_claude(
            builder_prompt, builder_system, builder_model, builder_tools, "builder"
        )
        save_round(round_num, "builder", builder_output)

        if args.verbose:
            print(f"\n  Builder output:\n{builder_output}\n")

        prior_feedback = feedback_for_builder
        print()

    # ── Did not converge ──────────────────────────────────────────────
    print(f"\n{'=' * 60}")
    print(f"DID NOT CONVERGE after {args.max_rounds} rounds")
    print(f"  Review logs in: {ROUNDS_DIR}/")
    print(f"  Last findings: {ROUNDS_DIR}/round_{args.max_rounds:02d}_reviewer.txt")
    print(f"{'=' * 60}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
