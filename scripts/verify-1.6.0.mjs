import { deleteTask, deleteEnquiry, deleteActivityNote, deleteContact, mergeDivision, moveContact, reparentDivision } from "../dist/tools/cleanup.js";
import { createDivision, updateDivision, createContact, updateContact } from "../dist/tools/contacts.js";
import { createTask, updateTask } from "../dist/tools/reports.js";
import { createActivityNote } from "../dist/tools/notes.js";
import { getClient } from "../dist/client.js";

const c = getClient();
const PASSED = [], FAILED = [];
const ok = (msg, cond) => (cond ? PASSED : FAILED).push((cond ? "✓ " : "✗ ") + msg);

const TARGET_COMPANY_A = 1015; // Blue Kite Academy Trust
const TARGET_COMPANY_B = 1005; // West Country Group

console.log("=== v1.6.0 verification ===\n");

// SCENARIO 1: merge_division
console.log("--- 1. merge_division round-trip ---");
const divARes = await createDivision({ name: "TEST-MERGE-SRC-" + Date.now(), relationship: "Prospect" });
const divAId = parseInt(divARes.match(/DivisionId:\*\* (\d+)/)[1]);

const divBRes = await createDivision({ name: "TEST-MERGE-TGT-" + Date.now(), relationship: "Prospect" });
const divBId = parseInt(divBRes.match(/DivisionId:\*\* (\d+)/)[1]);
console.log("  Created Division A=" + divAId + " B=" + divBId);

const cAres = await createContact({ divisionId: divAId, forename: "TEST", surname: "SRC-CONTACT", jobTitle: "Class Teacher" });
const srcContactId = parseInt(cAres.match(/ContactId:\*\* (\d+)/)[1]);

const tAres = await createTask({ name: "TEST-MERGE-SRC-TASK", taskTypeId: "SHOWLEAD9b1fd0f1a45f", taskDateUtc: new Date().toISOString(), assignedTo: "DL", divisionId: divAId, contactId: srcContactId });
const srcTaskId = parseInt(tAres.match(/TaskId:\*\* (\d+)/)[1]);

const nAres = await createActivityNote({ objectType: "division", objectId: divAId, text: "TEST-MERGE-NOTE" });
const srcNoteId = parseInt(nAres.match(/note (\d+)/)[1]);

console.log("  Loaded into A: contact=" + srcContactId + " task=" + srcTaskId + " note=" + srcNoteId);

const mergeRes = await mergeDivision({ sourceDivisionId: divAId, targetDivisionId: divBId, deleteSource: true });
console.log(mergeRes);

const contactAfter = await c.getById("Contacts", srcContactId, "$select=ContactId,DivisionId,StatusFlag");
const taskAfter = await c.getById("Tasks", srcTaskId, "$select=TaskId,DivisionId,StatusFlag");
const noteAfter = await c.getById("Notepads", srcNoteId, "$select=NotepadId,DivisionId,ObjectId,StatusFlag");
const sourceDiv = await c.getById("Divisions", divAId, "$select=DivisionId,StatusFlag");
ok("1A: contact moved to B", contactAfter.DivisionId === divBId);
ok("1B: task moved to B", taskAfter.DivisionId === divBId);
ok("1C: note moved to B and ObjectId restamped", noteAfter.DivisionId === divBId && noteAfter.ObjectId === String(divBId));
ok("1D: source Division soft-deleted", sourceDiv.StatusFlag === "D");

await c.delete("Contacts", srcContactId);
await c.delete("Tasks", srcTaskId);
await c.delete("Notepads", srcNoteId);
await c.delete("Divisions", divBId);
console.log("  cleaned up\n");

// SCENARIO 2: reparent_division
console.log("--- 2. reparent_division ---");
const divCRes = await createDivision({ name: "TEST-REPARENT-" + Date.now(), relationship: "Prospect" });
const divCId = parseInt(divCRes.match(/DivisionId:\*\* (\d+)/)[1]);
const reparentRes = await reparentDivision({ divisionId: divCId, companyId: TARGET_COMPANY_A });
console.log(reparentRes);
const divCAfter = await c.getById("Divisions", divCId, "$select=DivisionId,CompanyId");
ok("2: reparent_division attached C to Company " + TARGET_COMPANY_A, divCAfter.CompanyId === TARGET_COMPANY_A);
const reparentAgain = await reparentDivision({ divisionId: divCId, companyId: TARGET_COMPANY_A });
ok("2-idem: idempotent on already-parented", /already under/.test(reparentAgain));
await c.delete("Divisions", divCId);
console.log("  cleaned up\n");

// SCENARIO 3: create_division with companyId
console.log("--- 3. create_division with companyId ---");
const divXRes = await createDivision({ name: "TEST-CREATE-WITH-COMPANY-" + Date.now(), relationship: "Prospect", companyId: TARGET_COMPANY_B });
console.log(divXRes);
const divXId = parseInt(divXRes.match(/DivisionId:\*\* (\d+)/)[1]);
const divXCompanyId = parseInt(divXRes.match(/CompanyId:\*\* (\d+)/)[1]);
ok("3A: division attached to existing Company on create", divXCompanyId === TARGET_COMPANY_B);
ok("3B: no new Company created", /existing — re-used/.test(divXRes));
await c.delete("Divisions", divXId);
console.log("  cleaned up\n");

// SCENARIO 4 + 5: update_task and delete_task
console.log("--- 4. update_task ---");
const t4Res = await createTask({ name: "TEST-UPDATE-TASK", taskTypeId: "SENDQUOTE", taskDateUtc: new Date().toISOString(), assignedTo: "DL", contactId: 23122, divisionId: 5380 });
const t4Id = parseInt(t4Res.match(/TaskId:\*\* (\d+)/)[1]);
const newDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
await updateTask({ taskId: t4Id, taskTypeId: "SHOWLEAD9b1fd0f1a45f", assignedTo: "CL1", taskDateUtc: newDate });
const t4After = await c.getById("Tasks", t4Id, "$select=TaskId,TaskTypeId,AssignedTo,TaskDateUtc");
ok("4A: task type changed to SHOWLEAD", t4After.TaskTypeId === "SHOWLEAD9b1fd0f1a45f");
ok("4B: assignee changed to CL1", t4After.AssignedTo === "CL1");
ok("4C: date changed", t4After.TaskDateUtc.substring(0, 10) === newDate.substring(0, 10));

console.log("--- 5. delete_task ---");
const delRes = await deleteTask({ taskId: t4Id });
console.log(delRes);
const t4Deleted = await c.getById("Tasks", t4Id, "$select=TaskId,StatusFlag");
ok("5A: task soft-deleted", t4Deleted.StatusFlag === "D");
const delAgain = await deleteTask({ taskId: t4Id });
ok("5B: re-delete idempotent", /already deleted/.test(delAgain));

// SCENARIO 6: delete_contact
console.log("\n--- 6. delete_contact ---");
const c6Res = await createContact({ divisionId: 5380, forename: "TEST", surname: "DEL-CLEAN-" + Date.now(), jobTitle: "Class Teacher" });
const c6Id = parseInt(c6Res.match(/ContactId:\*\* (\d+)/)[1]);
const c6Del = await deleteContact({ contactId: c6Id });
console.log(c6Del);
ok("6A: clean contact deleted", /Soft-deleted/.test(c6Del));

const c7Res = await createContact({ divisionId: 5380, forename: "TEST", surname: "DEL-WITH-TASK-" + Date.now(), jobTitle: "Bursar" });
const c7Id = parseInt(c7Res.match(/ContactId:\*\* (\d+)/)[1]);
const t7Res = await createTask({ name: "TEST-BLOCKER", taskTypeId: "SHOWLEAD9b1fd0f1a45f", taskDateUtc: new Date().toISOString(), assignedTo: "DL", contactId: c7Id, divisionId: 5380 });
const t7Id = parseInt(t7Res.match(/TaskId:\*\* (\d+)/)[1]);

try {
  await deleteContact({ contactId: c7Id });
  ok("6B: contact with task REJECTED", false);
} catch (err) {
  const passed = /refusing to delete/.test(err.message) && err.message.includes("Task");
  ok("6B: contact with task rejected with listing", passed);
  console.log("  error excerpt:", err.message.split("\n").slice(0, 3).join(" | "));
}

await c.delete("Tasks", t7Id);
const c7DelAfter = await deleteContact({ contactId: c7Id });
ok("6C: contact deletable once blocker resolved", /Soft-deleted/.test(c7DelAfter));

// SCENARIO 7: move_contact
console.log("\n--- 7. move_contact ---");
const movDiv1Res = await createDivision({ name: "TEST-MV-DIV1", relationship: "Prospect" });
const movDiv1Id = parseInt(movDiv1Res.match(/DivisionId:\*\* (\d+)/)[1]);
const movDiv2Res = await createDivision({ name: "TEST-MV-DIV2", relationship: "Prospect" });
const movDiv2Id = parseInt(movDiv2Res.match(/DivisionId:\*\* (\d+)/)[1]);

const movC = await createContact({ divisionId: movDiv1Id, forename: "TEST", surname: "MV-" + Date.now() });
const movCId = parseInt(movC.match(/ContactId:\*\* (\d+)/)[1]);
const movT = await createTask({ name: "TEST-MV-TASK", taskTypeId: "SHOWLEAD9b1fd0f1a45f", taskDateUtc: new Date().toISOString(), assignedTo: "DL", contactId: movCId, divisionId: movDiv1Id });
const movTId = parseInt(movT.match(/TaskId:\*\* (\d+)/)[1]);

const movRes = await moveContact({ contactId: movCId, targetDivisionId: movDiv2Id });
console.log(movRes);
const movCAfter = await c.getById("Contacts", movCId, "$select=ContactId,DivisionId");
const movTAfter = await c.getById("Tasks", movTId, "$select=TaskId,DivisionId");
ok("7A: contact moved", movCAfter.DivisionId === movDiv2Id);
ok("7B: contact-owned task re-stamped", movTAfter.DivisionId === movDiv2Id);
const movIdem = await moveContact({ contactId: movCId, targetDivisionId: movDiv2Id });
ok("7C: move_contact idempotent", /already on Division/.test(movIdem));

await c.delete("Contacts", movCId);
await c.delete("Tasks", movTId);
await c.delete("Divisions", movDiv1Id);
await c.delete("Divisions", movDiv2Id);
console.log("  cleaned up\n");

// SCENARIO 8: delete_enquiry (refuses if converted)
console.log("--- 8. delete_enquiry ---");
const eRes = await c.post("Enquiries", { Forename: "TEST", Surname: "DEL-" + Date.now(), Source: "connector-test" });
const eId = eRes.EnquiryId;
const eDel = await deleteEnquiry({ enquiryId: eId });
console.log(eDel);
ok("8A: enquiry soft-deleted", /Soft-deleted enquiry/.test(eDel));
const eIdem = await deleteEnquiry({ enquiryId: eId });
ok("8B: re-delete idempotent", /already deleted/.test(eIdem));

// SCENARIO 9: delete_activity_note idempotent
console.log("\n--- 9. delete_activity_note ---");
const nRes = await createActivityNote({ objectType: "division", objectId: 5380, text: "TEST-DELETE-NOTE" });
const nId = parseInt(nRes.match(/note (\d+)/)[1]);
const nDel = await deleteActivityNote({ noteId: nId });
console.log(nDel);
ok("9A: note soft-deleted", /Soft-deleted note/.test(nDel));
const nIdem = await deleteActivityNote({ noteId: nId });
ok("9B: re-delete idempotent", /already deleted|not found/.test(nIdem));

console.log("\n=== Results ===");
PASSED.forEach(p => console.log(p));
FAILED.forEach(f => console.log(f));
console.log("\n" + PASSED.length + " passed, " + FAILED.length + " failed");
process.exit(FAILED.length === 0 ? 0 : 1);
