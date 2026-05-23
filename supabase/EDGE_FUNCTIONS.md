# Supabase Edge Functions

Three serverless functions replacing the Express backend for storage, email, and exam scoring.

## Functions

### `b2-presign` — Backblaze B2 Presigned URLs
Generates short-lived (15 min) signed URLs for B2 uploads and downloads.

**Auth:** Requires a valid Supabase JWT from an approved user (passed as `Authorization: Bearer <token>`).

```
POST /functions/v1/b2-presign
Authorization: Bearer <user-jwt>
Content-Type: application/json

# Upload
{ "action": "upload", "key": "notes/userId/filename.pdf", "contentType": "application/pdf" }
→ { "url": "https://...", "expiresIn": 900 }

# Download
{ "action": "download", "key": "notes/userId/filename.pdf" }
→ { "url": "https://...", "expiresIn": 900 }

# Delete (admin only)
{ "action": "delete", "key": "notes/userId/filename.pdf" }
→ { "success": true }
```

**Allowed contentTypes for upload:** `application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `image/gif`

---

### `send-email` — Resend Transactional Emails
Sends branded emails. Only callable with the service role key.

**Auth:** Requires `x-service-key: <SUPABASE_SERVICE_ROLE_KEY>` header.

```
POST /functions/v1/send-email
x-service-key: <service-role-key>
Content-Type: application/json

{ "type": "verification",    "to": "user@example.com", "params": { "token": "123456" } }
{ "type": "password_reset",  "to": "user@example.com", "params": { "token": "123456" } }
{ "type": "approval",        "to": "user@example.com", "params": { "name": "Arjun" } }
{ "type": "welcome",         "to": "user@example.com", "params": { "name": "Arjun" } }
{ "type": "new_quiz",        "to": "user@example.com", "params": { "name": "Arjun", "examTitle": "...", "examType": "topic_test" } }
{ "type": "email_change",    "to": "user@example.com", "params": { "newEmail": "...", "token": "123456" } }
{ "type": "storage_alert",   "to": "admin@example.com","params": { "usedGB": "8.5", "limitGB": "10" } }
→ { "success": true, "type": "...", "to": "..." }
```

---

### `score-exam` — Exam Submission & Scoring
Scores an exam attempt, applies negative marking, updates SRS topic progress gates.

**Auth:** Requires a valid Supabase JWT from an approved user.

```
POST /functions/v1/score-exam/{attemptId}
Authorization: Bearer <user-jwt>
Content-Type: application/json

{
  "answers": [
    { "questionId": "abc123", "selectedOption": 2, "timeSpentSeconds": 45 },
    { "questionId": "def456", "selectedOption": null, "timeSpentSeconds": 10 }
  ]
}

→ {
    "id": "result-id",
    "score": 12, "maxScore": 20, "accuracy": 60,
    "passed": true,
    "correctAnswers": 3, "incorrectAnswers": 1, "skippedAnswers": 1,
    "timeTakenSeconds": 300,
    "questions": [ { "questionId": "...", "isCorrect": true, "marksAwarded": 4, ... } ]
  }
```

**SRS gates updated automatically:**
- `lecture_quiz` → `lecture_quiz_passed`
- `dpp` → `dpp_completed`
- `pyq` → `pyq_completed`
- `topic_test` → `topic_test_passed`

---

## Deploy

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project (get project ref from Supabase dashboard)
supabase link --project-ref <your-project-ref>

# Deploy all functions
supabase functions deploy b2-presign
supabase functions deploy send-email
supabase functions deploy score-exam

# Set secrets in Supabase (one-time)
supabase secrets set B2_APPLICATION_KEY_ID=<value>
supabase secrets set B2_APPLICATION_KEY=<value>
supabase secrets set B2_BUCKET_NAME=edtech-notes
supabase secrets set B2_ENDPOINT=https://s3.us-east-005.backblazeb2.com
supabase secrets set RESEND_API_KEY=<value>
supabase secrets set FROM_EMAIL=<value>
```

## Required Supabase Secrets

| Secret | Where to get it |
|--------|----------------|
| `B2_APPLICATION_KEY_ID` | Backblaze B2 → App Keys |
| `B2_APPLICATION_KEY` | Backblaze B2 → App Keys |
| `B2_BUCKET_NAME` | Backblaze B2 → Buckets |
| `B2_ENDPOINT` | Backblaze B2 → Endpoint (e.g. `https://s3.us-east-005.backblazeb2.com`) |
| `RESEND_API_KEY` | resend.com → API Keys |
| `FROM_EMAIL` | Verified sender in Resend |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (auto-injected by Supabase) |

> `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are **auto-injected** by Supabase into all Edge Functions — you don't need to set these manually.

## Frontend Usage

Once deployed, call the functions from your frontend via the Supabase client:

```typescript
import { supabase } from '@/lib/supabase-client';

// B2 upload presigned URL
const { data, error } = await supabase.functions.invoke('b2-presign', {
  body: { action: 'upload', key: `notes/${userId}/my-notes.pdf`, contentType: 'application/pdf' }
});
const { url } = data;
await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': 'application/pdf' } });

// Score exam
const { data: result } = await supabase.functions.invoke(`score-exam/${attemptId}`, {
  body: { answers }
});
```
