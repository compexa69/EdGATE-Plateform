# ⚠️ Partially Passed Tests Report

> **Generated:** 2026-05-23T04:33:49.935Z  |  **Project:** EdTech Study Platform

## Summary

| Metric | Value |
|--------|-------|
| ⚠️ Partial | **2** |
| Root Cause | External services (B2, RESEND) or SRS gate not completed |

## Partially Passed Test Cases

| Test ID | Module | Feature | Description | Severity | Status |
|---------|--------|---------|-------------|----------|--------|
| `SEC-002` | Security | XSS | XSS payload in name handled safely | 🔴 CRITICAL | ⚠️ PARTIAL |
| `EC-004` | Edge Cases | Delete Non-existent | Delete non-existent resource returns 404 | 🟢 LOW | ⚠️ PARTIAL |

## Root Cause Analysis

### SEC-002 — XSS payload in name handled safely

| Field | Value |
|-------|-------|
| **Module** | Security |
| **Feature** | XSS |
| **Steps Passed** | ✅ HTTP request reaches route handler; Auth middleware passes |
| **Steps Failed** | ❌ External service or SRS gate blocked completion |
| **Root Cause** | XSS stored — sanitize on input or escape on output |
| **Recommended Fix** | Add input sanitization or HTML encoding in responses |

---

### EC-004 — Delete non-existent resource returns 404

| Field | Value |
|-------|-------|
| **Module** | Edge Cases |
| **Feature** | Delete Non-existent |
| **Steps Passed** | ✅ HTTP request reaches route handler; Auth middleware passes |
| **Steps Failed** | ❌ External service or SRS gate blocked completion |
| **Root Cause** | API returned 204 — DELETE succeeds silently for non-existent IDs |
| **Recommended Fix** | Add existence check before DELETE and return 404 if not found |

---

## Secrets Required to Fully Resolve

| Secret | Purpose | Impact |
|--------|---------|--------|
| `RESEND_API_KEY` | Transactional email | Email verification, password reset |
| `B2_KEY_ID` | Backblaze B2 storage | PDF note uploads |
| `B2_APPLICATION_KEY` | Backblaze B2 storage | PDF note uploads |
| `VAPID_PRIVATE_KEY` | Web push | Browser push notifications |
| `VAPID_PUBLIC_KEY` | Web push | Browser push notifications |

> Configure these in **Replit Secrets** (padlock icon). No code changes needed.
