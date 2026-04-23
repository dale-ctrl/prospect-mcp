# Quote Messaging — Confirmed Flow (verified end-to-end 2026-04-23)

Captured from a HAR trace of the Prospect365 UI's "Send Email" button on
2026-04-23 against the WCG tenant, verified by a live send to
`dale@westcountrygroup.com` against Quote 15234.

## Four structural gotchas that made earlier attempts fail silently

1. **Wrong host.** The public docs host `crm-odata-v1.prospect365.com`
   (what Prospect's Swagger/OpenAPI page points at) is read-only or a
   no-op shim. Bound actions hit it and silently return `value: 0` —
   no email, no error. **Real writes go to the tenant's regional API
   host:** `api-v1-westeurope.prospect365.com` for WCG.

2. **Wrong URL form.** Swagger documents bound actions as
   `/{entitySet}({id})/Default.{ActionName}()`. The UI uses the bare
   form without the `Default.` prefix:
   `/{entitySet}({id})/{ActionName}()`.

3. **SendMessage requires a real body with 8 fields.** Empty `{}` is
   accepted but is a no-op. Required fields:

   ```json
   {
     "ToAddress":        "...",
     "Subject":          "... non-empty ...",
     "MessageBody":      "<html>…</html>",
     "CreateDocument":   true,
     "CcAddress":        "",
     "BccAddress":       "",
     "DocumentTypeCode": "_EMLQC",
     "IsAppointment":    false,
     "SendToSelf":       false,
     "AttachmentId":     "<Id from AttachExistingDocument response>",
     "NewDocumentIds":   [<DocumentId from step 4>],
     "FileNames":        ["<Document name>.pdf"]
   }
   ```

   The `AttachmentId`/`NewDocumentIds`/`FileNames` trio is omitted for
   body-only sends (`attachPdf: false`).

4. **`x-profile-id` header required.** PAT-auth requests must include
   `x-profile-id: <id>`. Without it, SendMessage returns `value: 0`
   silently. The id is tenant-scoped (one value per Prospect tenant)
   and can be auto-resolved via `GET /Info()` which returns
   `{ProfileId, UserId, ...}`. Our client resolves this lazily on first
   request and caches it for the process lifetime.

## Canonical 7-call flow for "email a quote with the PDF attached"

Each step is a separate HTTP call. Steps 4–6 are skipped when
`attachPdf: false`. `{id}` = QuoteId.

| # | Call | Purpose |
|---|------|---------|
| 0 | `GET /DocumentTemplates('<code>')?$select=Subject` | Read the email template's raw Subject string (contains placeholders like `{QuoteId}`). Only needed when caller didn't supply an explicit subject. |
| 1 | `POST /Quotes({id})/MergeData()`<br>`{ "Data": { "Subject": "<step 0 value>", "Body": "template:_EMLQC" }, "FromTemplate": ["Body"] }` | Resolve placeholders in subject; render body from the email template. `template:<code>` is a server-side sigil for "fetch the template body". |
| 2 | `POST /Quotes({id})/MergeData()`<br>`{ "Data": { "Signature": "signature:1" }, "FromTemplate": ["Signature"] }` | Render the current user's email signature. Append to body. |
| 3 | `POST /Quotes({id})/MergeData()`<br>`{ "Data": { "DocumentName": "Quote Document {QuoteId}" } }` | Resolve merge fields in the attachment filename. |
| 4 | `POST /Documents`<br>`{ "QuoteId": ..., "DocumentTypeCode": "_QUOTE", "Description": "<resolved name>", "DocumentDate": "<iso>", "StatusFlag": "D" }` | Create a Document record for the PDF attachment. **`StatusFlag: "D"`** = "Draft attachment, render at send time". |
| 5 | `POST /DocumentAttachments/AttachExistingDocument`<br>`{ "AttachmentId": "", "DocumentNos": [{ "DocumentNo": <docId>, "Name": "<name>.pdf" }], "Pdf": true }` | Stage the Document as an email attachment. Response contains `Id: "<guid>"` — feed that into step 6's body as `AttachmentId`. |
| 6 | `POST /Quotes({id})/SendMessage()`<br>(see body above) | The actual send. Returns `{ "@odata.context": …, "value": <DocumentId> }` — **the returned int is a DocumentId of the sent-email record, not a MailMergeId**. |

## Return-value clarifications

The original design assumed `SendMessage` returned a MailMergeId and
that the rendered PDF lived at `GET /MailMergeBlobs({id})`. Both were
wrong:

- **SendMessage's int32 return value is a Document id** — the row
  created by the server to persist the sent-email record (because
  `CreateDocument: true` is in the body). This Document has
  `Direction: 2` (outbound), `StatusFlag: "A"` (active/sent),
  `DocumentTypeCode: "_EMLQC"`, and the resolved `EmailSubject` /
  `ToAddress` / `FromAddress` fields populated server-side.
- **There's no corresponding MailMerge row.** `MailMerges(<id>)` and
  `MailMergeBlobs(<id>)` return empty. That entity pair is a separate
  concept (bulk-merge campaign emails) unrelated to the UI's
  per-quote email flow.
- **The source document (usually DOCX) is reachable via
  `GET /Documents({attachmentDocumentId})/Raw()`.** This returns the
  raw file bytes with the correct `Content-Type`. The attached
  recipient-facing PDF is rendered on-the-fly during send and does
  not persist on the server — you download the source DOCX, not the
  exact PDF that was sent.

## Field names on the Document entity (step 4)

Document has `Quote` navigation (`UpdateVisibility=common`) but raw
`QuoteId` int is what the UI sends. **Do not use `Quote@odata.bind`**
— it produces a misleading *"DocumentTypeCode field is required"*
error.

Writable on POST: `QuoteId`, `ContactId`, `LeadId`, `ProblemId`,
`DocumentTypeCode`, `Description`, `DocumentDate`, `StatusFlag`,
`EmailSubject`, `ToAddress`, `CcAddresses`, `BccAddresses`,
`FileName`. Server auto-populates `DocumentId`, `Direction`,
`FileExtension`, `Created`, `SearchText`, etc.

## Template-override is native to v1

Every override (template, recipient, subject, body, cc/bcc) is a
native Document/SendMessage body field. No separate "v2 with overrides"
tool needed — `send_quote_email` accepts:

- `to`, `cc`, `bcc` — CcAddress / BccAddress in the SendMessage body
- `subject`, `messageBody` — when supplied, skip the MergeData calls
  for those fields (step 1 is still called if subject contains `{}` placeholders,
  since MergeData is how they get resolved)
- `emailTemplateCode` — default `"_EMLQC"` (Email Cover For Simple PDF Quote)
- `quoteTemplateCode` — default `"_QUOTE"` (the PDF template)
- `attachPdf` — default `true`; when false, steps 3–5 are skipped

## Reusable helper

`sendEntityEmail({ entitySet, entityId, ... })` in
`src/tools/quote-messaging.ts` is entity-agnostic. When we extend to
Contact/Division/Opportunity/Order/Invoice/Problem/Job, each entity
tool just needs to provide (a) its entitySet name, (b) a
`defaultToResolver` for that entity's primary-contact email, (c)
sensible `emailTemplateCode`/`quoteTemplateCode` defaults keyed off
the entity's `AllowAt<Entity>` DocumentTemplate flag.

All the MergeData / Documents / AttachExistingDocument / SendMessage
plumbing and header handling is in the shared helper.

## Optional UI requests we skipped

The UI also runs, but we don't:

- `GET /DocumentAttachments/GetAttachments(id='<guid>')` — polls until
  the Azure Blob is committed. Not required; our sequential flow is
  slow enough that the commit is always done before SendMessage.
- `GET /Documents?$filter=DocumentType/AutomationProcess/Obsolete eq false and DocumentId eq <id>` — checks for automation workflows on the
  new Document. Cosmetic.
- `POST /SpokeHistories { ContactId, DivisionId, LeadId, SpokeCode: "DEFTN", ... }` after step 6 — appends an Activity Feed entry. Cosmetic for v1.

## Reference files

- Live smoke test: `npm run test:send-message -- <QuoteId>` — script in
  `src/test-send-message.ts`, exercises `sendQuoteEmail` +
  `getMergeOutput` end-to-end against the real API.
- Unit tests with mocked fetch: `npm run test:messaging`.
