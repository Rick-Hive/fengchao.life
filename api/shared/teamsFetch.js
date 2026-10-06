// Read the "Hive Orders" team's channel messages with Hive's own app identity.
//
// Channel messages are a protected Graph API for app-only access: the usual
// application permission (ChannelMessage.Read.All) needs a request to
// Microsoft. The way round that is resource-specific consent: a Teams app
// whose manifest asks for ChannelMessage.Read.Group, installed in the one team
// by its owner, lets this app read that team's channels and nothing else. The
// package is built by teamsApp() below (GET /api/crm/teams-app); until it is
// installed Graph answers 403 and fetchChannelMessages() says so.
const { graph, list } = require("./graph");

// The team (a group provisioned as a Team) by display name.
async function findTeam(name) {
  const q = String(name || "").replace(/'/g, "''");
  const data = await graph("GET", `/groups?$filter=displayName eq '${encodeURIComponent(q)}' and resourceProvisioningOptions/Any(x:x eq 'Team')&$select=id,displayName`);
  const hit = (data.value || [])[0];
  return hit ? { id: hit.id, name: hit.displayName } : null;
}

// Every message of every channel, oldest first. Replies are not read: the
// order notifications are top-level posts.
async function fetchChannelMessages(teamName) {
  const team = await findTeam(teamName);
  if (!team) throw Object.assign(new Error(`no team named "${teamName}"`), { code: "no_team" });
  const channels = await list(`/teams/${team.id}/channels?$select=id,displayName`, 100);
  const out = [];
  for (const ch of channels) {
    let data;
    try {
      data = await list(`/teams/${team.id}/channels/${ch.id}/messages?$top=50`, 5000);
    } catch (err) {
      if (err && (err.status === 403 || err.status === 401)) throw Object.assign(new Error("the app may not read this team's channels yet"), { code: "teams_forbidden", team: team.name, channel: ch.displayName });
      throw err;
    }
    for (const m of data) out.push({ id: m.id, channel: ch.displayName, createdDateTime: m.createdDateTime, subject: m.subject || "", from: (m.from && ((m.from.application && m.from.application.displayName) || (m.from.user && m.from.user.displayName))) || "", body: { contentType: m.body && m.body.contentType, content: m.body && m.body.content } });
  }
  out.sort((a, b) => String(a.createdDateTime).localeCompare(String(b.createdDateTime)));
  return { team, channels: channels.map((c) => c.displayName), messages: out };
}

// ---- the Teams app package (manifest + icons), for resource-specific consent ----
const zlib = require("zlib");

function crc32(buf) {
  let t = crc32.t;
  if (!t) { t = crc32.t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
// A solid-colour PNG (the manifest needs a 192×192 colour icon and a 32×32 outline).
function png(w, h, rgba) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 4 + 1) + 1 + x * 4; raw[o] = rgba[0]; raw[o + 1] = rgba[1]; raw[o + 2] = rgba[2]; raw[o + 3] = rgba[3]; } }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
// A zip (deflate) of {name: Buffer}.
function zip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const n = Buffer.from(name), d = zlib.deflateRawSync(data), crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(d.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(d.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, n, d); centrals.push(ch, n);
    offset += lh.length + n.length + d.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

function teamsApp() {
  const clientId = process.env.AZURE_CLIENT_ID;
  if (!clientId) throw new Error("AZURE_CLIENT_ID app setting is not configured");
  const manifest = {
    $schema: "https://developer.microsoft.com/en-us/json-schemas/teams/v1.16/MicrosoftTeams.schema.json",
    manifestVersion: "1.16",
    version: "1.0.0",
    id: clientId,
    packageName: "life.fengchao.hive.orders",
    developer: { name: "Hive 蜂巢", websiteUrl: "https://www.fengchao.life", privacyUrl: "https://www.fengchao.life/help/", termsOfUseUrl: "https://www.fengchao.life/help/" },
    name: { short: "Hive CRM", full: "Hive CRM — reads order posts" },
    description: { short: "Lets the Hive management centre read this team's order posts.", full: "Installed in the Hive Orders team only. Grants the fengchao.life app read access to this team's channel messages (resource-specific consent) so course orders announced here can be recorded in the CRM. Nothing is written to Teams." },
    icons: { color: "color.png", outline: "outline.png" },
    accentColor: "#1d4a83",
    webApplicationInfo: { id: clientId, resource: "https://RscBasedStoreApp" },
    authorization: { permissions: { resourceSpecific: [{ name: "ChannelMessage.Read.Group", type: "Application" }] } },
    validDomains: ["www.fengchao.life", "fengchao.life"],
  };
  return zip({ "manifest.json": Buffer.from(JSON.stringify(manifest, null, 2)), "color.png": png(192, 192, [29, 74, 131, 255]), "outline.png": png(32, 32, [255, 255, 255, 255]) });
}

module.exports = { findTeam, fetchChannelMessages, teamsApp, zip, png };
