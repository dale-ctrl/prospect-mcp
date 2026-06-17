# Wiring `create_product` / `update_product` into the prospect-mcp

Turnkey steps to deploy the new tools (handler in `src/tools/products.ts`). Repo: `dale-ctrl/prospect-mcp`.

## 1. Add the file
Copy `products.ts` into `src/tools/products.ts`.

## 2. `src/index.ts` — import (near the `./tools/catalogue.js` import, ~line 105)
```ts
import {
  createProductSchema, createProduct,
  updateProductSchema, updateProduct,
} from "./tools/products.js";
```

## 3. `src/index.ts` — permission map (alongside `create_inventory`, ~line 498)
```ts
  create_product: { module: "catalogue", action: "create" },
  update_product: { module: "catalogue", action: "edit" },
```

## 4. `src/index.ts` — register the tools (copy the `create_inventory` block, ~line 2146)
```ts
registerWriteTool("create_product",
  "Create a new product (ProductItem) in the catalogue. Use for bespoke / non-catalogue (NC) items before they go on a quote. Pass productItemId, or omit it with autoCode=true to auto-generate the next NC<DDMMYY><NN> code. Requires description, sellPrice, costPrice.",
  createProductSchema.shape,
  async (args) => { try { const result = await createProduct(createProductSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

registerWriteTool("update_product",
  "Update an existing product (ProductItem) — description, sell/cost price, supplier, references, obsolete flag.",
  updateProductSchema.shape,
  async (args) => { try { const result = await updateProduct(updateProductSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });
```

## 5. `config/permissions.json` — add the `catalogue` module
Add to the `modules` array:
```json
{
  "id": "catalogue",
  "label": "Product Catalogue",
  "description": "Create and edit ProductItem catalogue records (including non-catalogue NC items)",
  "actions": ["create", "edit"]
}
```
Add `catalogue` to DL's `writeAllow` string (append `,catalogue`), and add to DL's `permissions`:
```json
"catalogue": { "create": true, "edit": true }
```
Grant to any other users who create products (e.g. the estimating team) the same way.
Permissions are fetched live from GitHub each restart — no code pull needed for the permission
change to reach teammates, only for the tool code itself.

## 6. Build, ship, verify
```
npm run build
git add -A && git commit -m "feat: create_product / update_product catalogue write tools"
git push origin main
git tag -a v1.21.0 -m "create_product / update_product" && git push origin v1.21.0
# create the GitHub Release for v1.21.0 (Cowork needs the Release, not just the tag)
```
On each teammate's machine (since v1.19.0 the plugin is bundled and Cowork's Update button is sufficient — no `git pull` of the marketplace clone needed):
```
# In Cowork: Customize → Plugins → prospect-crm → click Update
# then fully restart Claude Desktop (quit via tray, kill stray node.exe in Task Manager, relaunch)
```
Permission changes (i.e. the new `catalogue` module) are fetched live from GitHub on each restart, so other users granted `catalogue.{create,edit}` see the new tools at next launch even without clicking Update.
**Smoke test:** `create_product(autoCode=true, description="TEST", sellPrice=10, costPrice=5)` →
`get_product_detail` it → confirm sell £10 / cost £5 (not £0.00). If £0.00, apply the raw-integer
price-field fix noted at the top of `products.ts`, then mark it obsolete or delete the test SKU.

## Then: finish the Marpool / Clyst Heath quotes
Once live, create `NC17062601` (D-end Boardroom Table, Hawk, WESTCOUNTRY-31797, sell £821.10 /
cost £391), then duplicate quotes 15669 (opp 14050) and 15671 (opp 15672), swap in the new table
on the 8-seat set, ensure 8 chairs, keep Marpool's after-school lines. Note line deletions /
regrouping still need the UI (delete is disabled on the tenant and lines can't be regrouped via API).
