// /api/crm/{action} — the EquipMe order entry tool's backend.
//
// A data-entry tool, nothing more: a person holding the `crm_entry` role (or a
// portal admin) writes an EquipMe customer and order into the CRM base's
// existing Customers / Orders / Order Items tables from a form on /crm/,
// instead of typing into Airtable by hand. fengchao.life's own course orders
// do not pass through here (they still go to Teams only), and the CRM's
// reports and workflows are a separate design.
//
//   GET  crm/me                     who am I, may I use this
//   GET  crm/customer?q=            customers matching an email / name
//   GET  crm/curriculums?q=         curriculums matching a SKU / name
//   GET  crm/next-order-id          a suggested "Manual order N" id
//   GET  crm/schema                 which fields each write will carry (diagnostics)
//   POST crm/entry                  write Customers → Orders → Order Items
//
// Writes go through the schema-aware client in ../shared/airtable.js, so a
// column that has become a formula since this was written is skipped, not
// sent; the response says what was skipped. A failure part-way returns 502
// with the records already written, so nothing is silently half-done.
const { AirtableBase, formulaString } = require("../shared/airtable");
const { userRoles, userHasRole } = require("../shared/roles");
const cfg = require("../shared/config");

const ROLE = "crm_entry";

const TABLES = {
  customers: ["Customers", "Customer", "客户"],
  orders: ["Orders", "Order", "订单"],
  items: ["Order Items", "OrderItems", "Order Item", "订单项"],
  curriculums: ["Curriculums", "Curriculum", "Products", "课程"],
};

// Field specs, matched tolerantly against the live schema.
const F = {
  customers: {
    email: "Personal Email", teams: "Teams Account", first: "First Name", last: "Last Name",
    display: "Teams Display name", city: "City", active: "Is Active User",
  },
  orders: {
    id: "Order ID", amount: "Order Amount", received: "Received Amount", date: "Order Date",
    email: "Customer Email", name: "Customer Name", comments: "Order Comments",
  },
  items: {
    order: "Order ID", sku: "Curriculum SKU", qty: "Quantity", price: "Unit Price",
    total: "Total Price (RMB)", received: "Received Amount", notes: "Order Item Notes",
  },
  curriculums: {
    sku: "SKU", nameEn: "Product English Name", nameZh: "Product Chinese Name", price: "Product Price",
    publisher: "Royalty Recipient", available: "Available", onSite: "Is this on Equipme.cloud?",
  },
};

let baseSingleton = null;
function base() {
  const pat = process.env.AIRTABLE_CRM_PAT;
  const id = cfg.crmBaseId;
  if (!pat) throw Object.assign(new Error("AIRTABLE_CRM_PAT app setting is not configured"), { status: 500 });
  if (!baseSingleton || baseSingleton.pat !== pat || baseSingleton.baseId !== id) baseSingleton = new AirtableBase(id, pat);
  return baseSingleton;
}

function fname(table, spec) {
  const f = AirtableBase.field(table, spec);
  return f ? f.name : null;
}

function val(rec, table, spec) {
  const n = fname(table, spec);
  return n ? rec.fields[n] : undefined;
}

function text(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(", ");
  if (typeof v === "object") return v.name || v.email || v.id || "";
  return String(v).trim();
}

function num(v) {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// LOWER({field}) = LOWER('q') for exact, FIND(LOWER('q'), LOWER({field})) for partial.
function containsClause(fieldName, q) {
  return `FIND(LOWER(${formulaString(q)}), LOWER({${fieldName}}))`;
}
function equalsClause(fieldName, q) {
  return `LOWER({${fieldName}})=LOWER(${formulaString(q)})`;
}

function customerView(rec, table) {
  return {
    id: rec.id,
    email: text(val(rec, table, F.customers.email)),
    teams: text(val(rec, table, F.customers.teams)),
    first: text(val(rec, table, F.customers.first)),
    last: text(val(rec, table, F.customers.last)),
    display: text(val(rec, table, F.customers.display)),
    city: text(val(rec, table, F.customers.city)),
  };
}

function curriculumView(rec, table) {
  return {
    id: rec.id,
    sku: text(val(rec, table, F.curriculums.sku)),
    nameEn: text(val(rec, table, F.curriculums.nameEn)),
    nameZh: text(val(rec, table, F.curriculums.nameZh)),
    price: num(val(rec, table, F.curriculums.price)),
    publisher: text(val(rec, table, F.curriculums.publisher)),
    available: !!val(rec, table, F.curriculums.available),
  };
}

async function findCustomers(at, table, q) {
  const clauses = [];
  const exact = [];
  for (const spec of [F.customers.email, F.customers.teams]) {
    const n = fname(table, spec);
    if (n) { exact.push(equalsClause(n, q)); clauses.push(containsClause(n, q)); }
  }
  for (const spec of [F.customers.display, F.customers.first, F.customers.last]) {
    const n = fname(table, spec);
    if (n) clauses.push(containsClause(n, q));
  }
  if (!clauses.length) return { exact: [], partial: [] };
  const recs = await at.list(table.id, { filterByFormula: `OR(${clauses.join(",")})`, maxRecords: 20 });
  const ql = q.toLowerCase();
  const views = recs.map((r) => customerView(r, table));
  return {
    exact: views.filter((v) => v.email.toLowerCase() === ql || v.teams.toLowerCase() === ql),
    partial: views.filter((v) => v.email.toLowerCase() !== ql && v.teams.toLowerCase() !== ql),
    hasExactFormula: exact.length > 0,
  };
}

async function findCurriculums(at, table, q) {
  const clauses = [];
  for (const spec of [F.curriculums.sku, F.curriculums.nameEn, F.curriculums.nameZh]) {
    const n = fname(table, spec);
    if (n) clauses.push(containsClause(n, q));
  }
  if (!clauses.length) return [];
  const recs = await at.list(table.id, { filterByFormula: `OR(${clauses.join(",")})`, maxRecords: 25 });
  return recs.map((r) => curriculumView(r, table));
}

async function nextOrderId(at, table) {
  const idField = fname(table, F.orders.id);
  if (!idField) return "";
  const recs = await at.list(table.id, {
    filterByFormula: `FIND('manual order', LOWER({${idField}}))=1`,
    fields: [idField],
  });
  let max = 0;
  for (const r of recs) {
    const m = /manual\s*order\s*(\d+)/i.exec(String(r.fields[idField] || ""));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `Manual order ${max + 1}`;
}

// What each write will carry, given the live schema — shown on the page so the
// person entering data knows which columns the form actually fills.
function describe(table, specs, extraLinks) {
  const out = { table: table.name, writes: [], skips: [] };
  for (const [key, spec] of Object.entries(specs)) {
    const f = AirtableBase.field(table, spec);
    if (!f) out.skips.push(`${spec}: no such field`);
    else if (!AirtableBase.isWritable(f)) out.skips.push(`${f.name}: ${f.type}, computed by Airtable`);
    else out.writes.push(`${f.name} (${f.type})`);
  }
  (extraLinks || []).forEach((l) => { if (l) out.writes.push(`${l.name} (link)`); });
  return out;
}

function bad(context, status, message, extra) {
  context.res = { status, body: Object.assign({ error: message }, extra || {}) };
}

module.exports = async function (context, req) {
  const action = String((req.params && req.params.action) || "").toLowerCase();
  const method = String(req.method || "GET").toUpperCase();

  // Who is asking. `me` answers for anyone signed in; everything else needs the role.
  const who = await userRoles(req);
  const allowed = await userHasRole(req, ROLE);
  if (action === "me") {
    context.res = { status: 200, body: { user: who.user, roles: who.roles, allowed, role: ROLE } };
    return;
  }
  if (!allowed) return bad(context, 403, "crm_entry role required", { user: who.user });

  let at;
  try { at = base(); } catch (err) { return bad(context, err.status || 500, err.message); }

  try {
    if (method === "GET" && action === "customer") {
      const q = String((req.query && req.query.q) || "").trim();
      if (q.length < 2) return bad(context, 400, "q must be at least 2 characters");
      const table = await at.table(TABLES.customers);
      const found = await findCustomers(at, table, q);
      context.res = { status: 200, body: { q, exact: found.exact, partial: found.partial } };
      return;
    }

    if (method === "GET" && action === "curriculums") {
      const q = String((req.query && req.query.q) || "").trim();
      if (q.length < 2) return bad(context, 400, "q must be at least 2 characters");
      const table = await at.table(TABLES.curriculums);
      context.res = { status: 200, body: { q, results: await findCurriculums(at, table, q) } };
      return;
    }

    if (method === "GET" && action === "next-order-id") {
      const table = await at.table(TABLES.orders);
      context.res = { status: 200, body: { orderId: await nextOrderId(at, table) } };
      return;
    }

    if (method === "GET" && action === "schema") {
      const [customers, orders, items, curriculums] = await Promise.all([
        at.table(TABLES.customers), at.table(TABLES.orders), at.table(TABLES.items), at.table(TABLES.curriculums),
      ]);
      context.res = {
        status: 200,
        body: {
          base: at.baseId,
          customers: describe(customers, F.customers),
          orders: describe(orders, F.orders, [AirtableBase.linkTo(orders, customers.id)]),
          items: describe(items, F.items, [AirtableBase.linkTo(items, orders.id), AirtableBase.linkTo(items, curriculums.id)]),
        },
      };
      return;
    }

    if (method === "POST" && action === "entry") {
      await entry(context, req, at, who);
      return;
    }

    bad(context, 404, `unknown action: ${method} ${action}`);
  } catch (err) {
    context.log.error(`crm/${action}: ${(err && err.stack) || err}`);
    bad(context, err.status === 401 || err.status === 403 ? 502 : 500, String((err && err.message) || err));
  }
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function entry(context, req, at, who) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const c = body.customer && typeof body.customer === "object" ? body.customer : {};
  const o = body.order && typeof body.order === "object" ? body.order : {};
  const items = Array.isArray(body.items) ? body.items : [];

  // ---- validate ----------------------------------------------------------
  const problems = [];
  const email = String(c.email || "").trim().toLowerCase();
  const customerId = String(c.id || "").trim();
  if (!customerId && !EMAIL_RE.test(email)) problems.push("customer: an email address is required for a new customer");
  const orderId = String(o.orderId || "").trim();
  if (!orderId) problems.push("order: Order ID is required");
  const date = String(o.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date + "T00:00:00Z").getTime())) problems.push("order: date must be YYYY-MM-DD");
  const amount = num(o.amount);
  if (amount === null || amount < 0) problems.push("order: amount must be a number ≥ 0");
  let received = null;
  if (o.received !== "" && o.received != null) {
    received = num(o.received);
    if (received === null || received < 0) problems.push("order: received amount must be a number ≥ 0");
  }
  if (!items.length) problems.push("items: at least one item");
  const cleanItems = items.map((it, i) => {
    const qty = num(it.quantity);
    const price = num(it.unitPrice);
    const curriculumId = String(it.curriculumId || "").trim();
    if (!/^rec[A-Za-z0-9]{14}$/.test(curriculumId)) problems.push(`items[${i + 1}]: pick a curriculum from the list`);
    if (qty === null || qty < 1 || Math.floor(qty) !== qty) problems.push(`items[${i + 1}]: quantity must be a whole number ≥ 1`);
    if (price === null || price < 0) problems.push(`items[${i + 1}]: unit price must be a number ≥ 0`);
    return { curriculumId, qty, price, notes: String(it.notes || "").trim(), received: it.received === "" || it.received == null ? null : num(it.received) };
  });
  if (problems.length) return bad(context, 400, "please fix the form", { problems });

  const [customers, orders, itemsTable, curriculums] = await Promise.all([
    at.table(TABLES.customers), at.table(TABLES.orders), at.table(TABLES.items), at.table(TABLES.curriculums),
  ]);
  const written = [];
  const skipped = {};

  try {
    // ---- 1. customer: reuse by id, else by exact email, else create -------
    let customer = null;
    let customerCreated = false;
    if (customerId) {
      const rec = await at.get(customers.id, customerId);
      customer = customerView(rec, customers);
    } else {
      const found = await findCustomers(at, customers, email);
      if (found.exact.length) customer = found.exact[0];
    }
    if (!customer) {
      const prep = AirtableBase.prepare(customers, {
        [F.customers.email]: email,
        [F.customers.teams]: String(c.teams || "").trim(),
        [F.customers.first]: String(c.first || "").trim(),
        [F.customers.last]: String(c.last || "").trim(),
        [F.customers.display]: String(c.display || "").trim(),
        [F.customers.city]: String(c.city || "").trim(),
      });
      skipped.customers = prep.skipped;
      const rec = await at.create(customers.id, prep.fields);
      written.push({ table: customers.name, id: rec.id });
      customer = customerView(rec, customers);
      customerCreated = true;
    }
    const customerName = [customer.first, customer.last].filter(Boolean).join(" ") || customer.display || String(c.display || "").trim();

    // ---- 2. order ------------------------------------------------------------
    // Guard against the same id being entered twice (the id column is free text).
    const idField = fname(orders, F.orders.id);
    if (idField) {
      const dup = await at.list(orders.id, { filterByFormula: equalsClause(idField, orderId), maxRecords: 1, fields: [idField] });
      if (dup.length) return bad(context, 409, `an order with id "${orderId}" already exists`, { existing: dup[0].id });
    }
    const orderPairs = {
      [F.orders.id]: orderId,
      [F.orders.date]: date,
      [F.orders.amount]: amount,
      [F.orders.received]: received,
      [F.orders.email]: customer.email || email,
      [F.orders.name]: customerName,
      [F.orders.comments]: String(o.comments || "").trim(),
    };
    const orderPrep = AirtableBase.prepare(orders, orderPairs);
    const orderToCustomer = AirtableBase.linkTo(orders, customers.id);
    if (orderToCustomer) orderPrep.fields[orderToCustomer.name] = [customer.id];
    skipped.orders = orderPrep.skipped;
    const orderRec = await at.create(orders.id, orderPrep.fields);
    written.push({ table: orders.name, id: orderRec.id });

    // If only Customers carries the link (Order IDs), append there instead.
    if (!orderToCustomer) {
      const customerToOrder = AirtableBase.linkTo(customers, orders.id);
      if (customerToOrder) {
        const cur = await at.get(customers.id, customer.id);
        const existing = Array.isArray(cur.fields[customerToOrder.name]) ? cur.fields[customerToOrder.name] : [];
        await at.update(customers.id, customer.id, { [customerToOrder.name]: existing.concat([orderRec.id]) });
      }
    }

    // ---- 3. items --------------------------------------------------------------
    const itemToOrder = AirtableBase.linkTo(itemsTable, orders.id);
    const itemToCurriculum = AirtableBase.linkTo(itemsTable, curriculums.id);
    const orderRefField = itemToOrder || AirtableBase.field(itemsTable, F.items.order);
    const list = cleanItems.map((it) => {
      const pairs = {
        [F.items.qty]: it.qty,
        [F.items.price]: it.price,
        [F.items.total]: Math.round(it.qty * it.price * 100) / 100,
        [F.items.received]: it.received,
        [F.items.notes]: it.notes,
      };
      const prep = AirtableBase.prepare(itemsTable, pairs);
      if (itemToOrder) prep.fields[itemToOrder.name] = [orderRec.id];
      else if (orderRefField && AirtableBase.isWritable(orderRefField)) prep.fields[orderRefField.name] = orderId;
      if (itemToCurriculum) prep.fields[itemToCurriculum.name] = [it.curriculumId];
      else {
        const skuField = AirtableBase.field(itemsTable, F.items.sku);
        if (skuField && skuField.type === "multipleRecordLinks") prep.fields[skuField.name] = [it.curriculumId];
      }
      skipped.items = prep.skipped;
      return prep.fields;
    });
    const itemRecs = await at.createMany(itemsTable.id, list);
    itemRecs.forEach((r) => written.push({ table: itemsTable.name, id: r.id }));

    context.log(`crm/entry by ${who.user}: ${orderId} → customer ${customer.id}${customerCreated ? " (new)" : ""}, order ${orderRec.id}, ${itemRecs.length} items`);
    context.res = {
      status: 200,
      body: {
        ok: true,
        customer: { id: customer.id, created: customerCreated, email: customer.email || email, name: customerName },
        order: { id: orderRec.id, orderId },
        items: itemRecs.map((r) => r.id),
        skipped,
        url: `https://airtable.com/${at.baseId}/${orders.id}/${orderRec.id}`,
      },
    };
  } catch (err) {
    context.log.error(`crm/entry by ${who.user} failed after ${written.length} writes: ${(err && err.stack) || err}`);
    context.res = {
      status: 502,
      body: {
        error: String((err && err.message) || err),
        written,
        hint: written.length ? "These records were already created in Airtable; check them before entering the order again." : "Nothing was written.",
      },
    };
  }
}
