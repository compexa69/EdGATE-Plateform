# ⊘ Skipped Tests Report

> **Generated:** 2026-05-23T04:33:49.935Z  |  **Project:** EdTech Study Platform

## Summary

| Metric | Value |
|--------|-------|
| ⊘ Skipped | **1** |
| Cause | Prerequisite test step failed or dependency not met |

## Skipped Test Cases

| Test ID | Module | Feature | Description | Skip Reason |
|---------|--------|---------|-------------|-------------|
| `N-004` | Notes | B2 Upload URL | B2 upload URL endpoint gated behind SRS Chapter Test completion | SRS gate by design — not a bug |

## Dependency Chain

```
Register Admin  →  Create Subject  →  Create Chapter  →  Create Topic
                                                             |
                          Create Exam  ←  Create Question  ←┘
                               |
              Gate/Progress checks  ←  All topic tests
```

Tests are skipped when a prerequisite step fails. Fix root-cause failures in **failed-tests.md** to unblock these tests.

## How to Unblock

1. Fix all failures listed in `failed-tests.md`
2. Re-run the QA suite with `node qa/index.mjs`
3. The DB cleanup step will reset state automatically
4. Skipped tests will execute once their prerequisites pass
