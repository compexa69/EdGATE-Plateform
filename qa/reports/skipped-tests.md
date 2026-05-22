# ⊘ Skipped Tests Report

> **Generated:** 2026-05-22T19:21:22.215Z  |  **Suite:** EdTech Platform QA

## Summary

| Metric | Value |
|--------|-------|
| Total Skipped | **1** |
| Primary Cause | Dependency on prior test step |

## Skipped Test Cases

| Test ID | Module | Feature | Description | Reason |
|---------|--------|---------|-------------|--------|
| N-004 | Notes | B2 Upload URL | B2 upload URL endpoint gated behind SRS Chapter Test completion | SRS gate by design — not a bug |

## Analysis

Tests are skipped when a prerequisite step (e.g., creating a resource) fails. Fix the root-cause failures in the **Failed Tests Report** to unblock these tests.

### Dependency Chain

```
Register Admin → Create Subject → Create Chapter → Create Topic
                                                     ↓
                              Create Exam ← Create Question
```
