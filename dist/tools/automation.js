/**
 * MCP tool handlers for Automation (workflows), Webhooks, and Import tracking.
 */
import { z } from "zod";
import { getClient } from "../client.js";
// ─── Schemas ──────────────────────────────────────────────────
export const searchAutomationProcessesSchema = z.object({
    name: z.string().optional().describe("Search in process name (partial match)"),
    enabledOnly: z.boolean().optional().default(true).describe("Only show enabled processes (default true)"),
    top: z.number().optional().default(20).describe("Max results (default 20)"),
});
export const searchAutomationInstancesSchema = z.object({
    processId: z.number().optional().describe("Filter by automation ProcessId"),
    stateId: z.string().optional().describe("Filter by state (e.g. 'Completed', 'Failed', 'Running')"),
    leadId: z.number().optional().describe("Filter by linked LeadId"),
    quoteId: z.number().optional().describe("Filter by linked QuoteId"),
    dateFrom: z.string().optional().describe("Started on or after (ISO date)"),
    dateTo: z.string().optional().describe("Started on or before (ISO date)"),
    top: z.number().optional().default(20).describe("Max results (default 20)"),
});
export const searchAutomationSchedulesSchema = z.object({
    activeOnly: z.boolean().optional().default(true).describe("Only show active (non-obsolete) schedules"),
    top: z.number().optional().default(20).describe("Max results (default 20)"),
});
export const searchWebhooksSchema = z.object({
    entityId: z.string().optional().describe("Filter by entity type (e.g. 'Contact', 'Lead', 'Quote')"),
    top: z.number().optional().default(20).describe("Max results (default 20)"),
});
export const getWebhookMessagesSchema = z.object({
    webhookId: z.number().describe("The WebhookId to list messages for"),
    top: z.number().optional().default(20).describe("Max results (default 20)"),
});
export const searchImportRunsSchema = z.object({
    dateFrom: z.string().optional().describe("Imports on or after (ISO date)"),
    dateTo: z.string().optional().describe("Imports on or before (ISO date)"),
    top: z.number().optional().default(20).describe("Max results (default 20)"),
});
export const getImportRunErrorsSchema = z.object({
    runId: z.number().describe("The import RunId to list errors for"),
    top: z.number().optional().default(50).describe("Max results (default 50)"),
});
// ─── Handlers ─────────────────────────────────────────────────
export async function searchAutomationProcesses(args) {
    const client = getClient();
    const filters = ["Obsolete eq false"];
    if (args.name)
        filters.push(`contains(Name,'${args.name}')`);
    if (args.enabledOnly)
        filters.push("Enabled eq true");
    const params = [
        `$filter=${filters.join(" and ")}`,
        `$select=Id,Name,TypeId,Enabled,Published,PublishComment,Version,Created`,
        `$orderby=Name`,
        `$top=${args.top || 20}`,
    ].join("&");
    const result = await client.get("AutomationProcesses", params);
    if (result.value.length === 0)
        return "No automation processes found.";
    const lines = result.value.map((p) => {
        const enabled = p.Enabled ? "Enabled" : "Disabled";
        const published = p.Published ? "Published" : "Draft";
        return [
            `**Process #${p.Id}** — ${p.Name || "(untitled)"}`,
            `  Type: ${p.TypeId || "N/A"} | ${enabled} | ${published} (v${p.Version})`,
            p.PublishComment ? `  Comment: ${p.PublishComment.substring(0, 80)}` : "",
        ].filter(Boolean).join("\n");
    });
    return `Found ${result.value.length} automation process(es):\n\n${lines.join("\n\n")}`;
}
export async function searchAutomationInstances(args) {
    const client = getClient();
    const filters = [];
    if (args.processId)
        filters.push(`ProcessId eq ${args.processId}`);
    if (args.stateId)
        filters.push(`contains(StateId,'${args.stateId}')`);
    if (args.leadId)
        filters.push(`LeadId eq ${args.leadId}`);
    if (args.quoteId)
        filters.push(`QuoteId eq ${args.quoteId}`);
    if (args.dateFrom)
        filters.push(`Started ge ${args.dateFrom}`);
    if (args.dateTo)
        filters.push(`Started le ${args.dateTo}`);
    const params = [
        filters.length > 0 ? `$filter=${filters.join(" and ")}` : "",
        `$select=Id,ProcessId,Description,StateId,Started,LastStepTimestamp,QuoteId,LeadId,ProblemId,FailureReason,IsTest`,
        `$orderby=Started desc`,
        `$top=${args.top || 20}`,
    ].filter(Boolean).join("&");
    const result = await client.get("AutomationInstances", params);
    if (result.value.length === 0)
        return "No automation instances found.";
    const lines = result.value.map((i) => {
        const started = i.Started?.substring(0, 16).replace("T", " ") || "N/A";
        const refs = [];
        if (i.QuoteId)
            refs.push(`Quote #${i.QuoteId}`);
        if (i.LeadId)
            refs.push(`Lead #${i.LeadId}`);
        if (i.ProblemId)
            refs.push(`Problem #${i.ProblemId}`);
        const test = i.IsTest ? " [TEST]" : "";
        return [
            `**Instance #${i.Id}**${test} — ${i.Description || `Process ${i.ProcessId}`}`,
            `  State: ${i.StateId || "N/A"} | Started: ${started}`,
            refs.length > 0 ? `  Linked: ${refs.join(", ")}` : "",
            i.FailureReason ? `  Error: ${i.FailureReason.substring(0, 100)}` : "",
        ].filter(Boolean).join("\n");
    });
    return `Found ${result.value.length} automation instance(s):\n\n${lines.join("\n\n")}`;
}
export async function searchAutomationSchedules(args) {
    const client = getClient();
    const filters = [];
    if (args.activeOnly)
        filters.push("Obsolete eq 0");
    const params = [
        filters.length > 0 ? `$filter=${filters.join(" and ")}` : "",
        `$select=ScheduleId,DisplayName,ExtensionId,Interval,StartTime,EndTime,RunOnMonday,RunOnTuesday,RunOnWednesday,RunOnThursday,RunOnFriday,RunOnSaturday,RunOnSunday,Sequence`,
        `$orderby=Sequence`,
        `$top=${args.top || 20}`,
    ].filter(Boolean).join("&");
    const result = await client.get("AutomationSchedules", params);
    if (result.value.length === 0)
        return "No automation schedules found.";
    const lines = result.value.map((s) => {
        const days = [];
        if (s.RunOnMonday)
            days.push("Mon");
        if (s.RunOnTuesday)
            days.push("Tue");
        if (s.RunOnWednesday)
            days.push("Wed");
        if (s.RunOnThursday)
            days.push("Thu");
        if (s.RunOnFriday)
            days.push("Fri");
        if (s.RunOnSaturday)
            days.push("Sat");
        if (s.RunOnSunday)
            days.push("Sun");
        return [
            `**Schedule #${s.ScheduleId}** — ${s.DisplayName || s.ExtensionId || "(untitled)"}`,
            `  Extension: ${s.ExtensionId || "N/A"} | Interval: ${s.Interval || "N/A"}min`,
            `  Days: ${days.join(", ") || "None"} | Time: ${s.StartTime?.substring(11, 16) || "?"} – ${s.EndTime?.substring(11, 16) || "?"}`,
        ].join("\n");
    });
    return `Found ${result.value.length} schedule(s):\n\n${lines.join("\n\n")}`;
}
export async function searchWebhooks(args) {
    const client = getClient();
    const filters = ["StatusFlag ne 'D'"];
    if (args.entityId)
        filters.push(`contains(EntityId,'${args.entityId}')`);
    const expand = "WebhookAction($select=Description)";
    const params = [
        `$filter=${filters.join(" and ")}`,
        `$expand=${expand}`,
        `$select=Id,EntityId,Action,WebhookUrl,Comments,ErrorEmail,Created`,
        `$orderby=Created desc`,
        `$top=${args.top || 20}`,
    ].join("&");
    const result = await client.get("Webhooks", params);
    if (result.value.length === 0)
        return "No webhooks found.";
    const lines = result.value.map((w) => {
        const action = w.WebhookAction?.Description || w.Action || "N/A";
        const url = w.WebhookUrl?.substring(0, 60) || "N/A";
        return [
            `**Webhook #${w.Id}** — ${w.EntityId || "N/A"} → ${action}`,
            `  URL: ${url}${w.WebhookUrl?.length > 60 ? "..." : ""}`,
            `  Comments: ${w.Comments || "N/A"} | Error email: ${w.ErrorEmail || "N/A"}`,
        ].join("\n");
    });
    return `Found ${result.value.length} webhook(s):\n\n${lines.join("\n\n")}`;
}
export async function getWebhookMessages(args) {
    const client = getClient();
    const params = [
        `$filter=WebhookId eq ${args.webhookId}`,
        `$select=Id,SeverityLevel,StatusCode,Message,AdditionalDetail,Created`,
        `$orderby=Created desc`,
        `$top=${args.top || 20}`,
    ].join("&");
    const result = await client.get("WebhookMessages", params);
    if (result.value.length === 0)
        return "No messages found for this webhook.";
    const lines = result.value.map((m) => {
        const date = m.Created?.substring(0, 16).replace("T", " ") || "N/A";
        const msg = m.Message?.substring(0, 120) || "N/A";
        return `**${date}** [${m.SeverityLevel}] ${m.StatusCode || ""} — ${msg}`;
    });
    return `## Webhook #${args.webhookId} Messages (${result.value.length})\n\n${lines.join("\n")}`;
}
export async function searchImportRuns(args) {
    const client = getClient();
    const filters = [];
    if (args.dateFrom)
        filters.push(`Created ge ${args.dateFrom}`);
    if (args.dateTo)
        filters.push(`Created le ${args.dateTo}`);
    const params = [
        filters.length > 0 ? `$filter=${filters.join(" and ")}` : "",
        `$select=RunId,TemplateId,Status,Created`,
        `$orderby=Created desc`,
        `$top=${args.top || 20}`,
    ].filter(Boolean).join("&");
    const result = await client.get("ImportRuns", params);
    if (result.value.length === 0)
        return "No import runs found.";
    const lines = result.value.map((r) => {
        const date = r.Created?.substring(0, 16).replace("T", " ") || "N/A";
        const status = r.Status?.substring(0, 80) || "N/A";
        return `**Import #${r.RunId}** — Template ${r.TemplateId} | ${date}\n  Status: ${status}`;
    });
    return `Found ${result.value.length} import run(s):\n\n${lines.join("\n\n")}`;
}
export async function getImportRunErrors(args) {
    const client = getClient();
    const params = [
        `$filter=RunId eq ${args.runId}`,
        `$select=RunId,RowNumber,ErrorMessage`,
        `$orderby=RowNumber`,
        `$top=${args.top || 50}`,
    ].join("&");
    const result = await client.get("ImportRunErrors", params);
    if (result.value.length === 0)
        return `No errors found for import run ${args.runId}.`;
    const lines = result.value.map((e) => `- Row ${e.RowNumber}: ${e.ErrorMessage?.substring(0, 150) || "Unknown error"}`);
    return `## Import Run #${args.runId} Errors (${result.value.length})\n${lines.join("\n")}`;
}
//# sourceMappingURL=automation.js.map