#!/usr/bin/env node

/**
 * Unit tests for quote-messaging with a mocked global fetch.
 *
 * Run with: npm run test:messaging
 *
 * These tests do NOT hit the real Prospect API — they assert the 6-step
 * flow (MergeData × 3 → POST /Documents → DocumentAttachments/AttachExistingDocument
 * → SendMessage) is called in order with the right bodies, and that the
 * handler formats the confirmation payload correctly.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.PROSPECT_PAT = process.env.PROSPECT_PAT || "test-token-for-mock";
process.env.PROSPECT_BASE_URL =
  process.env.PROSPECT_BASE_URL || "https://api-v1-westeurope.prospect365.com";
// Short-circuit /Info() auto-fetch for all tests except the header test that
// overrides this explicitly.
process.env.PROSPECT_PROFILE_ID = process.env.PROSPECT_PROFILE_ID || "test-profile-id";
// Required for the send_quote_email safety gate's API-user lookup.
process.env.PROSPECT_USER_ID = process.env.PROSPECT_USER_ID || "DL";

const { sendQuoteEmail, getMergeOutput, sendEntityEmail, getDocumentContent } = await import(
  "./tools/quote-messaging.js"
);

interface MockCall {
  url: string;
  method: string;
  body?: string;
  parsedBody?: unknown;
}

function installFetchMock(
  handler: (call: MockCall) => { status?: number; json?: unknown; text?: string; bytes?: Uint8Array; contentType?: string },
) {
  const calls: MockCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    const rawBody = typeof init?.body === "string" ? init.body : undefined;
    let parsedBody: unknown;
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : undefined;
    } catch { /* not JSON */ }
    const call: MockCall = { url: u, method: init?.method ?? "GET", body: rawBody, parsedBody };
    calls.push(call);
    const resp = handler(call);
    const status = resp.status ?? 200;
    const contentType = resp.contentType ?? "application/json";
    const bodyInit: BodyInit | null =
      resp.bytes !== undefined
        ? (resp.bytes as BodyInit)
        : resp.text ?? (resp.json !== undefined ? JSON.stringify(resp.json) : null);
    return new Response(bodyInit, {
      status,
      headers: { "content-type": contentType },
    });
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

function mergeResp(pairs: Record<string, string>): { json: unknown } {
  return {
    json: {
      "@odata.context": "$metadata#ProspectSoft.OData.Extensibility.Common.MergeResponse",
      value: Object.entries(pairs).map(([Name, Value]) => ({ Name, Value })),
    },
  };
}

test("sendEntityEmail: runs the 7-call flow with correct bodies and required headers", async () => {
  let mergeDataCalls = 0;

  const mock = installFetchMock((call) => {
    // Every call must carry the required headers
    // (asserted inside a separate check against .headers below)

    // Step 0: GET DocumentTemplates('<code>')?$select=Subject
    if (call.url.includes("/DocumentTemplates('_EMLQC')") && call.method === "GET") {
      return {
        json: {
          value: [{ Subject: "Your Quotation Ref: {QuoteId} / {VersionNumber}" }],
        },
      };
    }

    if (call.url.endsWith("/Quotes(15234)/MergeData()")) {
      mergeDataCalls++;
      const b = call.parsedBody as { Data?: Record<string, unknown>; FromTemplate?: string[] };
      if (mergeDataCalls === 1) {
        // Subject came from the template GET, with placeholders intact
        assert.equal(b.Data?.Subject, "Your Quotation Ref: {QuoteId} / {VersionNumber}");
        assert.equal(b.Data?.Body, "template:_EMLQC");
        assert.deepEqual(b.FromTemplate, ["Body"]);
        return mergeResp({ Subject: "Your Quotation Ref: 15234 / 3", Body: "<p>Rendered body</p>" });
      }
      if (mergeDataCalls === 2) {
        assert.deepEqual(b.FromTemplate, ["Signature"]);
        return mergeResp({ Signature: "<br>—DL" });
      }
      if (mergeDataCalls === 3) {
        assert.equal(b.Data?.DocumentName, "Quote Document {QuoteId}");
        return mergeResp({ DocumentName: "Quote Document 15234" });
      }
    }

    if (call.url.endsWith("/Documents") && call.method === "POST") {
      const b = call.parsedBody as Record<string, unknown>;
      assert.equal(b.QuoteId, 15234);
      assert.equal(b.DocumentTypeCode, "_QUOTE");
      assert.equal(b.StatusFlag, "D");
      return { json: { DocumentId: 99001 } };
    }

    if (call.url.endsWith("/DocumentAttachments/AttachExistingDocument") && call.method === "POST") {
      return { json: { Id: "attach-guid-abc123", SuccessFlag: true } };
    }

    if (call.url.endsWith("/Quotes(15234)/SendMessage()")) {
      const b = call.parsedBody as Record<string, unknown>;
      // Every HAR-confirmed field must be present
      assert.equal(b.ToAddress, "dale@westcountrygroup.com");
      assert.equal(b.Subject, "Your Quotation Ref: 15234 / 3");
      assert.match(b.MessageBody as string, /Rendered body/);
      assert.match(b.MessageBody as string, /—DL/);
      assert.equal(b.CreateDocument, true);
      assert.equal(b.CcAddress, "");
      assert.equal(b.BccAddress, "");
      assert.equal(b.DocumentTypeCode, "_EMLQC"); // email template, not _QUOTE
      assert.equal(b.IsAppointment, false);
      assert.equal(b.SendToSelf, false);
      assert.equal(b.AttachmentId, "attach-guid-abc123"); // threaded from step 5's Id
      assert.deepEqual(b.NewDocumentIds, [99001]);
      assert.deepEqual(b.FileNames, ["Quote Document 15234.pdf"]);
      return { json: { "@odata.context": "$metadata#Edm.Int32", value: 555 } };
    }

    throw new Error(`Unexpected call: ${call.method} ${call.url}`);
  });

  try {
    const result = await sendEntityEmail({
      entitySet: "Quotes",
      entityId: 15234,
      to: "dale@westcountrygroup.com",
      emailTemplateCode: "_EMLQC",
      attachment: { documentTemplateCode: "_QUOTE", documentNameTemplate: "Quote Document {QuoteId}" },
    });

    assert.equal(result.sentMessageDocumentId, 555);
    assert.equal(result.attachmentDocumentId, 99001);
    assert.equal(result.subject, "Your Quotation Ref: 15234 / 3");
    assert.equal(result.attachmentFilename, "Quote Document 15234.pdf");

    const urls = mock.calls.map((c) => c.url.replace(/.*prospect365\.com/, ""));
    assert.equal(urls.length, 7, `Expected 7 calls, got ${urls.length}:\n${urls.join("\n")}`);
    assert.ok(urls[0].startsWith("/DocumentTemplates"));
    assert.ok(urls[1].endsWith("/Quotes(15234)/MergeData()"));
    assert.ok(urls[2].endsWith("/Quotes(15234)/MergeData()"));
    assert.ok(urls[3].endsWith("/Quotes(15234)/MergeData()"));
    assert.ok(urls[4].endsWith("/Documents"));
    assert.ok(urls[5].endsWith("/DocumentAttachments/AttachExistingDocument"));
    assert.ok(urls[6].endsWith("/Quotes(15234)/SendMessage()"));
  } finally {
    mock.restore();
  }
});

test("ProspectClient: sends x-locale and x-profile-id headers when PROSPECT_PROFILE_ID is set", async () => {
  const origProfile = process.env.PROSPECT_PROFILE_ID;
  const origLocale = process.env.PROSPECT_LOCALE;
  process.env.PROSPECT_PROFILE_ID = "19928";
  process.env.PROSPECT_LOCALE = "en-GB";

  // Re-import with fresh client state
  const { ProspectClient } = await import(`./client.js?cache=${Date.now()}`);
  const c = new ProspectClient();

  let capturedHeaders: Record<string, string> | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    const h = init?.headers as Record<string, string> | undefined;
    capturedHeaders = h;
    return new Response(JSON.stringify({ value: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    await c.get("AnyEntitySet");
    assert.equal(capturedHeaders?.["x-locale"], "en-GB");
    assert.equal(capturedHeaders?.["x-profile-id"], "19928");
    assert.match(capturedHeaders?.Authorization ?? "", /^Bearer /);
  } finally {
    globalThis.fetch = originalFetch;
    if (origProfile === undefined) delete process.env.PROSPECT_PROFILE_ID;
    else process.env.PROSPECT_PROFILE_ID = origProfile;
    if (origLocale === undefined) delete process.env.PROSPECT_LOCALE;
    else process.env.PROSPECT_LOCALE = origLocale;
  }
});

test("sendEntityEmail: skips steps 3-5 when attachment is omitted (body-only email)", async () => {
  let mergeCalls = 0;
  const mock = installFetchMock((call) => {
    if (call.url.includes("/DocumentTemplates('_EMLQC')") && call.method === "GET") {
      return { json: { value: [{ Subject: "Subj {QuoteId}" }] } };
    }
    if (call.url.endsWith("/MergeData()")) {
      mergeCalls++;
      if (mergeCalls === 1) return mergeResp({ Subject: "Subj 1", Body: "B" });
      if (mergeCalls === 2) return mergeResp({ Signature: "Sig" });
      throw new Error("Did not expect 3rd MergeData call when attachPdf omitted");
    }
    if (call.url.endsWith("/SendMessage()")) {
      const b = call.parsedBody as Record<string, unknown>;
      assert.equal(b.CreateDocument, true, "CreateDocument must still be true for body-only sends");
      assert.equal(b.AttachmentId, undefined, "AttachmentId must not be present when no attachment");
      assert.equal(b.NewDocumentIds, undefined);
      assert.equal(b.FileNames, undefined);
      return { json: { value: 77 } };
    }
    throw new Error(`Unexpected: ${call.url}`);
  });
  try {
    const result = await sendEntityEmail({
      entitySet: "Quotes",
      entityId: 1,
      to: "x@y.z",
      emailTemplateCode: "_EMLQC",
    });
    assert.equal(result.sentMessageDocumentId, 77);
    assert.equal(result.attachmentDocumentId, undefined);
    const urls = mock.calls.map((c) => c.url);
    // Expected: DocumentTemplates GET + MergeData×2 + SendMessage = 4 calls
    assert.equal(urls.length, 4, `Expected 4 calls, got ${urls.length}`);
    assert.ok(!urls.some((u) => u.endsWith("/Documents")));
    assert.ok(!urls.some((u) => u.includes("AttachExistingDocument")));
  } finally {
    mock.restore();
  }
});

test("sendEntityEmail: throws descriptive error when SendMessage returns value:0", async () => {
  let merges = 0;
  const mock = installFetchMock((call) => {
    if (call.url.endsWith("/MergeData()")) {
      merges++;
      if (merges === 1) return mergeResp({ Subject: "S", Body: "B" });
      if (merges === 2) return mergeResp({ Signature: "" });
      throw new Error("no merge 3");
    }
    if (call.url.endsWith("/SendMessage()")) {
      return { json: { value: 0 } };
    }
    throw new Error(`Unexpected: ${call.url}`);
  });
  try {
    await assert.rejects(
      () =>
        sendEntityEmail({
          entitySet: "Quotes",
          entityId: 1,
          to: "x@y.z",
          emailTemplateCode: "_EMLQC",
        }),
      /SendMessage returned value:0.*regional write host/s,
    );
  } finally {
    mock.restore();
  }
});

test("sendEntityEmail: caller-supplied subject+body skips step 1 AND step 2 (no signature append)", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.endsWith("/SendMessage()")) {
      const b = call.parsedBody as Record<string, unknown>;
      assert.equal(b.Subject, "My subject");
      assert.equal(b.MessageBody, "My body");
      return { json: { value: 88 } };
    }
    throw new Error(`Did not expect non-send call: ${call.url}`);
  });
  try {
    const result = await sendEntityEmail({
      entitySet: "Quotes",
      entityId: 1,
      to: "x@y.z",
      subject: "My subject",
      messageBody: "My body",
      emailTemplateCode: "_EMLQC",
    });
    assert.equal(result.sentMessageDocumentId, 88);
    assert.equal(mock.calls.length, 1);
  } finally {
    mock.restore();
  }
});

test("sendEntityEmail: resolves missing `to` via defaultToResolver", async () => {
  let merges = 0;
  const mock = installFetchMock((call) => {
    if (call.url.endsWith("/MergeData()")) {
      merges++;
      if (merges === 1) return mergeResp({ Subject: "S", Body: "B" });
      if (merges === 2) return mergeResp({ Signature: "sig" });
      throw new Error("no merge 3");
    }
    if (call.url.endsWith("/SendMessage()")) {
      const b = call.parsedBody as Record<string, unknown>;
      assert.equal(b.ToAddress, "resolved@example.com");
      return { json: { value: 42 } };
    }
    throw new Error(`Unexpected: ${call.url}`);
  });
  try {
    const r = await sendEntityEmail({
      entitySet: "Quotes",
      entityId: 1,
      emailTemplateCode: "_EMLQC",
      defaultToResolver: async () => "resolved@example.com",
    });
    assert.equal(r.sentMessageDocumentId, 42);
    assert.equal(r.to, "resolved@example.com");
  } finally {
    mock.restore();
  }
});

test("sendQuoteEmail: SAFETY GATE — recipient is locked to the API user even when caller omits to/cc/bcc", async () => {
  let merges = 0;
  const mock = installFetchMock((call) => {
    // Safety-gate API-user lookup. First send_quote_email call after server boot
    // hits this; the result is then cached on the ProspectClient instance.
    if (call.url.includes("/Users?") && call.url.includes("UserCode")) {
      return {
        json: {
          value: [{ UserCode: "DL", EmailAddress: "apiuser@westcountrygroup.com" }],
        },
      };
    }
    if (call.url.includes("/DocumentTemplates('_EMLQC')") && call.method === "GET") {
      return { json: { value: [{ Subject: "Your Quotation Ref: {QuoteId} / {VersionNumber}" }] } };
    }
    if (call.url.endsWith("/MergeData()")) {
      merges++;
      if (merges === 1) return mergeResp({ Subject: "Your Quotation Ref: 15234 / 3", Body: "<p>body</p>" });
      if (merges === 2) return mergeResp({ Signature: "<br>—DL" });
      if (merges === 3) return mergeResp({ DocumentName: "Quote Document 15234" });
    }
    if (call.url.endsWith("/Documents") && call.method === "POST") {
      return { json: { DocumentId: 77 } };
    }
    if (call.url.endsWith("/DocumentAttachments/AttachExistingDocument")) {
      return { json: { Id: "attach-guid-909", SuccessFlag: true } };
    }
    if (call.url.endsWith("/Quotes(15234)/SendMessage()")) {
      const b = call.parsedBody as Record<string, unknown>;
      // Safety gate: must be the API user, never anyone else.
      assert.equal(b.ToAddress, "apiuser@westcountrygroup.com");
      assert.equal(b.CcAddress, "");
      assert.equal(b.BccAddress, "");
      assert.equal(b.AttachmentId, "attach-guid-909");
      assert.deepEqual(b.NewDocumentIds, [77]);
      return { json: { value: 909 } };
    }
    if (call.url.includes("/Documents(909)?") && call.method === "GET") {
      return {
        json: {
          value: [
            {
              DocumentId: 909,
              Created: "2026-04-23T10:00:00Z",
              FromAddress: "sales@westcountrygroup.com",
              EmailSubject: "Your Quotation Ref: 15234 / 3",
            },
          ],
        },
      };
    }
    throw new Error(`Unexpected: ${call.method} ${call.url}`);
  });

  try {
    const text = await sendQuoteEmail({
      quoteId: 15234,
      emailTemplateCode: "_EMLQC",
      quoteTemplateCode: "_QUOTE",
      attachPdf: true,
    });
    assert.match(text, /SAFETY GATE/);
    assert.match(text, /Email sent for Quote #15234/);
    assert.match(text, /Sent-email DocumentId.*909/);
    assert.match(text, /Attachment DocumentId.*77/);
    assert.match(text, /To:.*apiuser@westcountrygroup\.com/);
    assert.match(text, /Email template.*_EMLQC/);
    assert.match(text, /PDF template.*_QUOTE/);
    assert.match(text, /From:.*sales@westcountrygroup\.com/);
    assert.match(text, /Sent:.*2026-04-23T10:00:00Z/);
    assert.match(text, /get_merge_output with documentId=77/);
  } finally {
    mock.restore();
  }
});

test("sendQuoteEmail: SAFETY GATE — caller-supplied to/cc/bcc are silently overridden to the API user", async () => {
  // Per spec: calling with to='foo@example.com' must NOT email foo. The
  // SendMessage body must show the cached API user email instead, and Cc/Bcc
  // must be empty regardless of what the caller passed.
  let merges = 0;
  let sendMessageBody: Record<string, unknown> | null = null;
  const mock = installFetchMock((call) => {
    if (call.url.includes("/Users?") && call.url.includes("UserCode")) {
      return {
        json: { value: [{ UserCode: "DL", EmailAddress: "apiuser@westcountrygroup.com" }] },
      };
    }
    if (call.url.includes("/DocumentTemplates('_EMLQC')") && call.method === "GET") {
      return { json: { value: [{ Subject: "Subj {QuoteId}" }] } };
    }
    if (call.url.endsWith("/MergeData()")) {
      merges++;
      if (merges === 1) return mergeResp({ Subject: "Subj 15234", Body: "B" });
      if (merges === 2) return mergeResp({ Signature: "Sig" });
      throw new Error("no merge 3 expected (attachPdf=false)");
    }
    if (call.url.endsWith("/Quotes(15234)/SendMessage()")) {
      sendMessageBody = call.parsedBody as Record<string, unknown>;
      return { json: { value: 1234 } };
    }
    if (call.url.includes("/Documents(1234)?") && call.method === "GET") {
      return { json: { value: [{ DocumentId: 1234 }] } };
    }
    throw new Error(`Unexpected: ${call.method} ${call.url}`);
  });

  try {
    const text = await sendQuoteEmail({
      quoteId: 15234,
      to: "foo@example.com",
      cc: "boss@example.com",
      bcc: "watcher@example.com",
      emailTemplateCode: "_EMLQC",
      attachPdf: false,
    });

    // Strict assertion: the recipient that hit SendMessage must be the API user,
    // never the caller-supplied address. cc/bcc must be empty.
    assert.ok(sendMessageBody, "SendMessage was never called");
    assert.equal(
      (sendMessageBody as Record<string, unknown>).ToAddress,
      "apiuser@westcountrygroup.com",
      "ToAddress leaked caller's foo@example.com — safety gate failed",
    );
    assert.equal((sendMessageBody as Record<string, unknown>).CcAddress, "");
    assert.equal((sendMessageBody as Record<string, unknown>).BccAddress, "");

    // Response must be honest about the override having fired.
    assert.match(text, /SAFETY GATE: caller-supplied to\/cc\/bcc were ignored/);
    assert.match(text, /To:.*apiuser@westcountrygroup\.com/);
    // And must not pretend foo@example.com was emailed.
    assert.doesNotMatch(text, /foo@example\.com/);
  } finally {
    mock.restore();
  }
});

// ─── getMergeOutput (now fetches /Documents(id)/Raw()) ───────

test("getDocumentContent: fetches metadata + binary in parallel, infers filename from FileName", async () => {
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"
  const mock = installFetchMock((call) => {
    if (call.url.includes("/Documents(8061)/Raw()")) {
      return { bytes: pdfBytes, contentType: "application/pdf" };
    }
    if (call.url.includes("/Documents(8061)?")) {
      return {
        json: {
          value: [
            {
              DocumentId: 8061,
              FileName: "Quote Document 15234",
              FileExtension: "pdf",
              Description: "Quote Document 15234",
              Created: "2026-04-23T10:00:00Z",
            },
          ],
        },
      };
    }
    throw new Error(`Unexpected: ${call.url}`);
  });
  try {
    const res = await getDocumentContent(8061);
    assert.equal(res.filename, "Quote Document 15234.pdf");
    assert.equal(res.mimeType, "application/pdf");
    assert.equal(res.bytes.length, 5);
    assert.equal(res.description, "Quote Document 15234");
    assert.equal(res.created, "2026-04-23T10:00:00Z");
  } finally {
    mock.restore();
  }
});

test("getMergeOutput: saveTo writes bytes and returns metadata-only markdown", async () => {
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { readFileSync, existsSync, rmSync, mkdtempSync } = await import("node:fs");

  const scratch = mkdtempSync(join(tmpdir(), "merge-out-"));
  const target = join(scratch, "downloaded.docx");
  const docxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // "PK.." zip magic

  const mock = installFetchMock((call) => {
    if (call.url.includes("/Documents(101)/Raw()")) {
      return {
        bytes: docxBytes,
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    }
    if (call.url.includes("/Documents(101)?")) {
      return {
        json: {
          value: [
            {
              DocumentId: 101,
              FileName: "Quote 101.docx",
              FileExtension: "docx",
              Description: "Quote 101",
            },
          ],
        },
      };
    }
    throw new Error(`Unexpected: ${call.url}`);
  });

  try {
    const text = await getMergeOutput({ documentId: 101, saveTo: target });
    assert.ok(existsSync(target));
    const onDisk = readFileSync(target);
    assert.deepEqual(new Uint8Array(onDisk), docxBytes);
    assert.match(text, /Saved to:.*downloaded\.docx/);
    assert.doesNotMatch(text, /Content \(base64\)/);
  } finally {
    mock.restore();
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("getMergeOutput: no saveTo returns base64 inline with correct size", async () => {
  const bytes = new Uint8Array([0x00, 0x01, 0x02]);
  const mock = installFetchMock((call) => {
    if (call.url.includes("/Documents(55)/Raw()")) {
      return { bytes, contentType: "application/pdf" };
    }
    if (call.url.includes("/Documents(55)?")) {
      return {
        json: { value: [{ DocumentId: 55, FileName: "Q-55.pdf", FileExtension: "pdf" }] },
      };
    }
    throw new Error(`Unexpected: ${call.url}`);
  });
  try {
    const text = await getMergeOutput({ documentId: 55 });
    assert.match(text, /Size:.*3 bytes/);
    assert.match(text, /AAEC/); // base64 of [0x00, 0x01, 0x02]
  } finally {
    mock.restore();
  }
});
