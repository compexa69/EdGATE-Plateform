# ⚠️ Partially Passed Tests Report

> **Generated:** 2026-05-22T19:21:22.215Z  |  **Suite:** EdTech Platform QA

## Summary

| Metric | Value |
|--------|-------|
| Total Partial | **2** |
| Root Cause | Usually missing optional secrets (B2, RESEND) |

## Partially Passed Test Cases

| Test ID | Module | Feature | Description | Status |
|---------|--------|---------|-------------|--------|
| SEC-002 | Security | XSS | XSS payload in name handled safely | ⚠️ PARTIAL |
| EC-004 | Edge Cases | Delete Non-existent | Delete non-existent resource returns 404 | ⚠️ PARTIAL |

## Root Cause Analysis

### SEC-002 — XSS payload in name handled safely

| Field | Value |
|-------|-------|
| **Module** | Security |
| **Feature** | XSS |
| **Steps Passed** | Request reaches route handler |
| **Steps Failed** | External service (B2 / email) not configured |
| **Root Cause** | XSS stored — sanitize on input or escape on output |
| **Recommended Fix** | Add input sanitization or HTML encoding in responses |

---

### EC-004 — Delete non-existent resource returns 404

| Field | Value |
|-------|-------|
| **Module** | Edge Cases |
| **Feature** | Delete Non-existent |
| **Steps Passed** | Request reaches route handler |
| **Steps Failed** | External service (B2 / email) not configured |
| **Root Cause** | API returned 204 — DELETE succeeds silently for non-existent IDs |
| **Recommended Fix** | Add existence check before DELETE and return 404 if not found |

---

## Optional Secrets Required

To make partial tests fully pass, configure these Replit Secrets:

| Secret | Purpose | Required For |
|--------|---------|-------------|
| `RESEND_API_KEY` | Transactional email | Email verification, password reset |
| `B2_KEY_ID` | Backblaze B2 storage | PDF note uploads |
| `B2_APPLICATION_KEY` | Backblaze B2 storage | PDF note uploads |
| `VAPID_PRIVATE_KEY` | Push notifications | Browser push alerts |
| `VAPID_PUBLIC_KEY` | Push notifications | Browser push alerts |
