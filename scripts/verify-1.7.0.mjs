import { updateDivisionAddress } from "../dist/tools/division-address.js";
import { createDivision } from "../dist/tools/contacts.js";
import { getClient } from "../dist/client.js";

const c = getClient();
const PASSED = [], FAILED = [];
const ok = (msg, cond) => (cond ? PASSED : FAILED).push((cond ? "✓ " : "✗ ") + msg);

console.log("=== v1.7.0 update_division_address verification ===\n");

// Set up a throwaway Division with empty Address
const divRes = await createDivision({ name: "TEST-ADDR-1.7.0-" + Date.now(), relationship: "Prospect" });
const divId = parseInt(divRes.match(/DivisionId:\*\* (\d+)/)[1]);
const addressId = parseInt(divRes.match(/AddressId:\*\* (\d+)/)[1]);
console.log("test Division=" + divId + ", AddressId=" + addressId);

// 1. Happy path with divisionId — auto-resolves Address
console.log("\n--- 1. Happy path with divisionId ---");
const r1 = await updateDivisionAddress({
  divisionId: divId,
  addressLine1: "10 Test Street",
  addressLine3: "Plymouth",
  postcode: "PL1 2AB",
  country: "United Kingdom",
});
console.log(r1);
const a1 = await c.getById("Addresses", addressId, "$select=AddressLine1,AddressLine3,Postcode,Country");
ok("1A: returns success message with addressId", r1.includes("Address " + addressId + " updated"));
ok("1B: lists changed fields in camelCase", /addressLine1.*addressLine3.*postcode.*country/.test(r1));
ok("1C: AddressLine1 written", a1.AddressLine1 === "10 Test Street");
ok("1D: AddressLine3 written", a1.AddressLine3 === "Plymouth");
ok("1E: Postcode written", a1.Postcode === "PL1 2AB");
ok("1F: Country written", a1.Country === "United Kingdom");

// 2. Happy path with addressId directly (skips Division resolution)
console.log("\n--- 2. Happy path with addressId ---");
const r2 = await updateDivisionAddress({ addressId, addressLine2: "Suite 5" });
const a2 = await c.getById("Addresses", addressId, "$select=AddressLine1,AddressLine2");
ok("2A: returns success", /Address \d+ updated/.test(r2));
ok("2B: AddressLine2 written", a2.AddressLine2 === "Suite 5");
ok("2C: AddressLine1 preserved (partial update)", a2.AddressLine1 === "10 Test Street");

// 3. No fields supplied → no-op
console.log("\n--- 3. No fields supplied no-op ---");
const r3 = await updateDivisionAddress({ divisionId: divId });
ok("3: returns no-op message without PATCH", /No fields supplied; no change\./.test(r3));

// 4. Empty string explicitly clears the field
console.log("\n--- 4. Empty string clears field ---");
const r4 = await updateDivisionAddress({ addressId, addressLine2: "" });
const a4 = await c.getById("Addresses", addressId, "$select=AddressLine1,AddressLine2");
ok("4A: returns success", /Address \d+ updated/.test(r4));
ok("4B: AddressLine2 cleared", a4.AddressLine2 === "" || a4.AddressLine2 === null);
ok("4C: AddressLine1 unaffected by clear", a4.AddressLine1 === "10 Test Street");

// 5. Whitespace trim
console.log("\n--- 5. Whitespace trim ---");
await updateDivisionAddress({ addressId, addressLine1: "  Trimmed Street  " });
const a5 = await c.getById("Addresses", addressId, "$select=AddressLine1");
ok("5: leading/trailing whitespace trimmed", a5.AddressLine1 === "Trimmed Street");

// 6. Whitespace-only string → clears (same as "")
console.log("\n--- 6. Whitespace-only string clears ---");
await updateDivisionAddress({ addressId, addressLine1: "Permanent" });
await updateDivisionAddress({ addressId, addressLine2: "   " });
const a6 = await c.getById("Addresses", addressId, "$select=AddressLine1,AddressLine2");
ok("6A: whitespace-only collapses to clear", a6.AddressLine2 === "" || a6.AddressLine2 === null);
ok("6B: other line preserved", a6.AddressLine1 === "Permanent");

// 7. Foreign address (German postcode + country)
console.log("\n--- 7. Foreign address ---");
await updateDivisionAddress({
  addressId,
  addressLine1: "Schulstraße 5",
  postcode: "61118",
  country: "Germany",
});
const a7 = await c.getById("Addresses", addressId, "$select=AddressLine1,Postcode,Country");
ok("7A: non-Latin character preserved", a7.AddressLine1 === "Schulstraße 5");
ok("7B: non-UK postcode accepted", a7.Postcode === "61118");
ok("7C: foreign country accepted", a7.Country === "Germany");

// 8. Neither divisionId nor addressId → rejected
console.log("\n--- 8. Missing both inputs ---");
try {
  await updateDivisionAddress({ addressLine1: "irrelevant" });
  ok("8: rejected when neither divisionId nor addressId supplied", false);
} catch (err) {
  ok("8: rejected when neither divisionId nor addressId supplied",
    /Must supply divisionId or addressId/.test(err.message));
}

// 9. Division with no MainAddressId AND no AddressId — exercise the error path.
//    (Can't easily produce this state on this tenant, so we simulate by passing
//    a deleted division — that exercises the StatusFlag='D' guard.)
console.log("\n--- 9. Soft-deleted Division refused ---");
// Soft-delete the test Division and try to update its address
await c.delete("Divisions", divId);
try {
  await updateDivisionAddress({ divisionId: divId, postcode: "ZZ1" });
  ok("9: soft-deleted Division rejected", false);
} catch (err) {
  ok("9: soft-deleted Division rejected", /soft-deleted/i.test(err.message));
}

console.log("\n=== Results ===");
PASSED.forEach(p => console.log(p));
FAILED.forEach(f => console.log(f));
console.log("\n" + PASSED.length + " passed, " + FAILED.length + " failed");
process.exit(FAILED.length === 0 ? 0 : 1);
