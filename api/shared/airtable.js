// A small, schema-aware Airtable client for the CRM base.
//
// The sync reads the Hive base with table ids pinned in config.js. The CRM base
// (Customers / Orders / Order Items / Curriculums) is a different base in a
// different workspace, whose tables were built by hand and will be redesigned
// later, so nothing here pins an id: tables and fields are found by name
// through the metadata API (the PAT carries schema.bases:read), and every
// write is filtered against the schema first — a formula, rollup or lookup
// column is skipped rather than sent, because Airtable rejects the whole
// request (422) when any one field in it is not writable. Link fields are
// recognised by type, so "Order ID" on Order Items is written as a record link
// when it is one and as text when it is not; the code does not have to know
// which the base happens to use this month.
//
// Schema lookups are cached per function instance for ten minutes.
const API_ROOT = "https://api.airtable.com/v0";
const SCHEMA_TTL_MS = 10 * 60 * 1000;

function norm(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/[\s 　]+/g, "")
    .replace(/／/g, "/")
    .replace(/？/g, "?");
}

// Field types a create/update may carry a value for.
const WRITABLE = new Set([
  "singleLineText", "multilineText", "richText", "email", "url", "phoneNumber",
  "number", "currency", "percent", "rating", "duration",
  "date", "dateTime", "checkbox", "singleSelect", "multipleSelects",
  "multipleRecordLinks", "barcode", "multipleAttachments", "singleCollaborator", "multipleCollaborators",
]);

class AirtableBase {
  constructor(baseId, pat) {
    if (!baseId) throw new Error("Airtable base id missing");
    if (!pat) throw new Error("Airtable token missing");
    this.baseId = baseId;
    this.pat = pat;
    this._schema = null;
    this._schemaAt = 0;
  }

  async _request(method, path, { query, body } = {}) {
    const url = new URL(`${API_ROOT}/${path}`);
    if (query) for (const [k, v] of Object.entries(query)) if (v != null && v !== "") url.searchParams.set(k, String(v));
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${this.pat}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) {
      const detail = data && data.error ? (data.error.message || data.error.type || JSON.stringify(data.error)) : text.slice(0, 300);
      const err = new Error(`Airtable ${method} ${path} -> HTTP ${res.status}: ${detail}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // [{ id, name, primaryFieldId, fields: [{ id, name, type, options }] }]
  async schema(force) {
    const now = Date.now();
    if (!force && this._schema && now - this._schemaAt < SCHEMA_TTL_MS) return this._schema;
    const data = await this._request("GET", `meta/bases/${this.baseId}/tables`);
    this._schema = (data && data.tables) || [];
    this._schemaAt = now;
    return this._schema;
  }

  // Find a table by any of the names given (normalized; exact first, then a
  // name that starts with the candidate, then one that contains it).
  async table(names) {
    const list = Array.isArray(names) ? names : [names];
    const tables = await this.schema();
    for (const want of list) {
      const n = norm(want);
      if (!n) continue;
      const exact = tables.find((t) => norm(t.name) === n || t.id === want);
      if (exact) return exact;
    }
    for (const want of list) {
      const n = norm(want);
      const hit = tables.find((t) => norm(t.name).startsWith(n)) || tables.find((t) => norm(t.name).includes(n));
      if (hit) return hit;
    }
    const have = tables.map((t) => t.name).join(", ");
    throw new Error(`table not found: ${list.join(" / ")} (base has: ${have})`);
  }

  // Find a field on a table by name, the same tolerant way. Returns the field
  // object ({id, name, type, options}) or null.
  static field(table, spec) {
    const fields = table.fields || [];
    if (spec instanceof RegExp) return fields.find((f) => spec.test(f.name)) || null;
    const n = norm(spec);
    if (!n) return null;
    const parts = n.split("/");
    const en = parts[0] || "";
    const zh = parts[1] || "";
    const sorted = fields.slice().sort((a, b) => a.name.localeCompare(b.name));
    return (
      sorted.find((f) => norm(f.name) === n) ||
      (en && sorted.find((f) => norm(f.name).startsWith(en))) ||
      sorted.find((f) => (en && norm(f.name).includes(en)) || (zh && norm(f.name).includes(zh))) ||
      null
    );
  }

  static isWritable(field) {
    return !!field && WRITABLE.has(field.type);
  }

  // The link field on `table` that points at `targetTableId`, if any.
  static linkTo(table, targetTableId) {
    return (table.fields || []).find((f) => f.type === "multipleRecordLinks" && f.options && f.options.linkedTableId === targetTableId) || null;
  }

  // Build the `fields` object for a create from {spec: value} pairs, keeping
  // only fields that exist on the table and can be written, and coercing the
  // value to what the field's type expects. Returns { fields, skipped }.
  static prepare(table, pairs) {
    const fields = {};
    const skipped = [];
    for (const [spec, raw] of Object.entries(pairs)) {
      if (raw === undefined || raw === null || raw === "") continue;
      const fld = AirtableBase.field(table, spec);
      if (!fld) { skipped.push(`${spec} (no such field)`); continue; }
      if (!WRITABLE.has(fld.type)) { skipped.push(`${fld.name} (${fld.type})`); continue; }
      const v = coerce(fld, raw);
      if (v === undefined) { skipped.push(`${fld.name} (value did not fit ${fld.type})`); continue; }
      fields[fld.name] = v;
    }
    return { fields, skipped };
  }

  async list(tableId, { filterByFormula, fields, maxRecords, sort, view } = {}) {
    const records = [];
    let offset;
    do {
      const query = { pageSize: 100 };
      if (filterByFormula) query.filterByFormula = filterByFormula;
      if (maxRecords) query.maxRecords = maxRecords;
      if (view) query.view = view;
      const url = new URL(`${API_ROOT}/${this.baseId}/${tableId}`);
      for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
      if (offset) url.searchParams.set("offset", offset);
      (fields || []).forEach((f) => url.searchParams.append("fields[]", f));
      (sort || []).forEach((s, i) => {
        url.searchParams.set(`sort[${i}][field]`, s.field);
        url.searchParams.set(`sort[${i}][direction]`, s.direction || "asc");
      });
      const res = await fetch(url, { headers: { Authorization: `Bearer ${this.pat}` } });
      const text = await res.text();
      if (!res.ok) throw new Error(`Airtable list ${tableId} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
      const data = JSON.parse(text);
      records.push(...(data.records || []));
      offset = data.offset;
      if (maxRecords && records.length >= maxRecords) break;
    } while (offset);
    return records;
  }

  async create(tableId, fields) {
    const data = await this._request("POST", `${this.baseId}/${tableId}`, { body: { fields, typecast: true } });
    return data;
  }

  // Create several records (Airtable takes at most 10 per request).
  async createMany(tableId, fieldsList) {
    const out = [];
    for (let i = 0; i < fieldsList.length; i += 10) {
      const chunk = fieldsList.slice(i, i + 10).map((fields) => ({ fields }));
      const data = await this._request("POST", `${this.baseId}/${tableId}`, { body: { records: chunk, typecast: true } });
      out.push(...((data && data.records) || []));
    }
    return out;
  }

  async get(tableId, recordId) {
    return this._request("GET", `${this.baseId}/${tableId}/${recordId}`);
  }

  async update(tableId, recordId, fields) {
    return this._request("PATCH", `${this.baseId}/${tableId}/${recordId}`, { body: { fields, typecast: true } });
  }

  // Update several records ([{ id, fields }]; Airtable takes at most 10 per request).
  async updateMany(tableId, records) {
    const out = [];
    for (let i = 0; i < records.length; i += 10) {
      const data = await this._request("PATCH", `${this.baseId}/${tableId}`, { body: { records: records.slice(i, i + 10), typecast: true } });
      out.push(...((data && data.records) || []));
    }
    return out;
  }
}

// Coerce a value to the shape Airtable expects for the field type; undefined
// when it cannot be represented.
function coerce(field, raw) {
  switch (field.type) {
    case "multipleRecordLinks": {
      const ids = (Array.isArray(raw) ? raw : [raw]).map(String).filter((s) => /^rec[A-Za-z0-9]{14}$/.test(s));
      return ids.length ? ids : undefined;
    }
    case "number": case "currency": case "percent": case "rating": case "duration": {
      const n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(n) ? n : undefined;
    }
    case "checkbox":
      return !!raw;
    case "date": {
      const s = String(raw).trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
    }
    case "dateTime": {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
    }
    case "multipleSelects":
      return (Array.isArray(raw) ? raw : [raw]).map(String).filter(Boolean);
    case "singleSelect":
      return String(raw);
    default:
      return typeof raw === "string" ? raw : String(raw);
  }
}

// Escape a string for use inside a filterByFormula string literal.
function formulaString(s) {
  return "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
}

module.exports = { AirtableBase, norm, formulaString, coerce, WRITABLE };
