const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.SAMELCII_JSON_API_PORT || 3077);
const HOST = process.env.SAMELCII_JSON_API_HOST || "0.0.0.0";
const DATA_DIR = path.join(__dirname, "data", "membership");
const MASTER_BACKUP_SQL = path.join(__dirname, "..", "database", "backups", "dbsamelco_copy_memid_backup_20260521_121006.sql");

const AREA_OPTIONS = [
  "001 - CATBALOGAN",
  "002 - JIABONG",
  "003 - MOTIONG",
  "004 - PARANAS",
  "005 - SAN SEBASTIAN",
  "006 - HINABANGAN",
  "007 - CALBIGA",
  "008 - PINABACDAO",
  "009 - VILLAREAL",
  "010 - STA. RITA",
  "011 - TALALORA",
  "012 - BASEY",
  "013 - DARAM",
  "014 - ZUMARRAGA",
  "015 - MARABUT",
  "016 - SAN JOSE DE BUAN",
  "019 - CINCORAMA",
  "020 - BAGONGON",
  "021 - BASIAO"
];

function resolveAgmaAreaCode(areaCode) {
  return normalizeCode(areaCode);
}

function readJson(file, fallback) {
  try {
    return repairValue(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function repairText(value) {
  return String(value ?? "")
    .replace(/\uFFFD/g, "")
    .replace(/¥/g, "Ñ")
    .trim();
}

function repairValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => repairValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, repairValue(item)]));
  }
  if (typeof value === "string") {
    return repairText(value);
  }
  return value;
}

function normalizeCode(value) {
  const digits = String(value || "").trim().match(/\d+/);
  if (!digits) return "";
  return digits[0].padStart(3, "0").slice(-3);
}

function normalizeText(value) {
  return repairText(value);
}

function normalizeRateCode(value) {
  const text = normalizeText(value).toUpperCase();
  if (!text) return "";
  if (text.length === 1) return text;
  if (/^RESIDENTIAL$/.test(text)) return "R";
  if (/^COMMERCIAL$/.test(text)) return "C";
  if (/^STREET\s*LIGHT$/.test(text)) return "S";
  if (/^PUBLIC\s*BUILDING$/.test(text)) return "P";
  if (/^INDUSTRIALS?$/.test(text)) return "I";
  return text[0];
}

function parseRateCodes(value) {
  const list = String(value || "")
    .split(",")
    .map((item) => normalizeRateCode(item))
    .filter(Boolean);
  return Array.from(new Set(list));
}

function memberName(row) {
  return [row.LastName, row.FirstName, row.MiddleName]
    .map(normalizeText)
    .filter(Boolean)
    .join(", ")
    .replace(/,\s*,/g, ",") || "No Name";
}

function send(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  res.end(JSON.stringify(payload));
}

function loadBooksRaw() {
  return readJson(path.join(DATA_DIR, "books_raw.json"), []);
}

function loadMembers() {
  return readJson(path.join(DATA_DIR, "members.json"), []);
}

function parseSqlValue(token) {
  const text = String(token || "").trim();
  if (!text || /^null$/i.test(text)) return "";
  if (text.startsWith("'") && text.endsWith("'")) {
    return text
      .slice(1, -1)
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, "\\");
  }
  return text;
}

function parseMasterBackupLookup() {
  try {
    const sql = fs.readFileSync(MASTER_BACKUP_SQL, "utf8");
    const lookup = new Map();
    const insertRe = /INSERT INTO\s+`master`\s+VALUES\s+([\s\S]*?);/gi;
    let insertMatch;
    while ((insertMatch = insertRe.exec(sql))) {
      const body = insertMatch[1];
      let inString = false;
      let escapeNext = false;
      let depth = 0;
      let current = "";
      let fields = [];
      for (let i = 0; i < body.length; i += 1) {
        const ch = body[i];
        if (inString) {
          current += ch;
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          if (ch === "\\") {
            escapeNext = true;
          } else if (ch === "'") {
            inString = false;
          }
          continue;
        }
        if (ch === "'") {
          inString = true;
          current += ch;
          continue;
        }
        if (ch === "(") {
          depth += 1;
          if (depth === 1) {
            current = "";
            fields = [];
          } else {
            current += ch;
          }
          continue;
        }
        if (ch === "," && depth === 1) {
          fields.push(current);
          current = "";
          continue;
        }
        if (ch === ")" && depth === 1) {
          fields.push(current);
          const accountNumber = parseSqlValue(fields[4]);
          if (accountNumber) {
            lookup.set(accountNumber, {
              area: parseSqlValue(fields[1]),
              book: parseSqlValue(fields[2]),
              address: parseSqlValue(fields[6]),
              rateCode: parseSqlValue(fields[7])
            });
          }
          current = "";
          fields = [];
          depth = 0;
          continue;
        }
        if (depth >= 1) {
          current += ch;
        }
      }
    }
    return lookup;
  } catch {
    return new Map();
  }
}

let masterBackupLookupCache = null;

function getMasterBackupLookup() {
  if (masterBackupLookupCache) return masterBackupLookupCache;
  masterBackupLookupCache = parseMasterBackupLookup();
  return masterBackupLookupCache;
}

function loadAgmaRecords() {
  return readJson(path.join(DATA_DIR, "agma_records.json"), []);
}

function saveAgmaRecords(rows) {
  writeJson(path.join(DATA_DIR, "agma_records.json"), rows);
}

function handleMembership(req, res, url) {
  const action = String(url.searchParams.get("action") || "").trim();

  if (action === "areas") {
    send(res, 200, { ok: true, items: AREA_OPTIONS });
    return;
  }

  if (action === "books") {
    const areaCode = normalizeCode(url.searchParams.get("area"));
    const raw = loadBooksRaw();
    const members = loadMembers();
    const items = [];
    const seen = new Set();
    const rawLookup = new Map();
    raw.forEach((row) => {
      const rowArea = normalizeCode(row.areaCode);
      const bookCode = normalizeCode(row.bookCode);
      const areaName = normalizeText(row.areaName);
      if (!rowArea || !bookCode || !areaName) return;
      rawLookup.set(`${rowArea}|${bookCode}`, areaName);
    });

    const addBook = (bookCode, label) => {
      const normalizedBookCode = normalizeCode(bookCode);
      const normalizedLabel = normalizeText(label);
      if (!normalizedBookCode || !normalizedLabel) return;
      const entry = `${normalizedBookCode} - ${normalizedLabel}`;
      if (seen.has(entry)) return;
      seen.add(entry);
      items.push(entry);
    };

    members.forEach((row) => {
      const rowArea = normalizeCode(row.area || row.Area);
      if (areaCode && rowArea !== areaCode) return;
      if (areaCode === "014") {
        const sourceDb = normalizeText(row.sourceDb);
        if (sourceDb && sourceDb !== "dbsamelco_catbalogan") return;
      }
      const bookCode = normalizeCode(row.book || row.Book);
      if (!bookCode) return;
      const label = rawLookup.get(`${rowArea}|${bookCode}`) || normalizeText(row.areaName || row.bookName || row.raw?.AreaName) || `BOOK ${bookCode}`;
      addBook(bookCode, label);
    });

    raw.forEach((row) => {
      const rowArea = normalizeCode(row.areaCode);
      if (areaCode && rowArea !== areaCode) return;
      const bookCode = normalizeCode(row.bookCode);
      const areaName = normalizeText(row.areaName);
      if (!bookCode || !areaName) return;
      addBook(bookCode, areaName);
    });

    items.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    send(res, 200, { ok: true, items, areaCode });
    return;
  }

  if (action === "agma_list") {
    const areaCode = normalizeCode(url.searchParams.get("area"));
    const resolvedAreaCode = resolveAgmaAreaCode(areaCode);
    const bookCode = normalizeCode(url.searchParams.get("book"));
    const rateCodes = parseRateCodes(url.searchParams.get("rateCodes"));
    const limit = Math.max(1, Math.min(5000, parseInt(url.searchParams.get("limit") || "20", 10) || 20));
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const offset = (page - 1) * limit;

    const backupLookup = getMasterBackupLookup();
    const rows = loadMembers()
      .filter((row) => {
        const rowArea = normalizeCode(row.area || row.Area);
        const rowBook = normalizeCode(row.book || row.Book);
        if (resolvedAreaCode && rowArea !== resolvedAreaCode) return false;
        if (bookCode && rowBook !== bookCode) return false;
        if (rateCodes.length && !rateCodes.includes(normalizeRateCode(row.rateCode || row.RateCode))) return false;
        return true;
      })
      .map((row) => {
        const accountNumber = normalizeText(row.accountNumber || row.AssignAccountNo);
        const backup = backupLookup.get(accountNumber) || {};
        return {
          accountNumber,
          memberId: normalizeText(row.memberId || row.MEMID || backup.memberId || backup.MEMID),
          fullName: normalizeText(row.fullName || memberName(row)),
          area: normalizeCode(row.area || row.Area || backup.area),
          book: normalizeCode(row.book || row.Book || backup.book),
          address: normalizeText(row.address || row.Address || backup.address),
          rateCode: normalizeText(row.rateCode || row.RateCode || backup.rateCode)
        };
      });

    const total = rows.length;
    const items = limit >= total ? rows : rows.slice(offset, offset + limit);
    send(res, 200, { ok: true, items, total, mode: "json", resolvedArea: resolvedAreaCode || areaCode });
    return;
  }

  if (action === "save_agma" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString("utf8");
      if (body.length > 5_000_000) {
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        const payload = body.trim().startsWith("{")
          ? JSON.parse(body)
          : Object.fromEntries(new URLSearchParams(body));
        const rows = loadAgmaRecords();
        const areaCode = normalizeCode(payload.area);
        rows.push({
          id: Date.now(),
          accountNumber: normalizeText(payload.accountNumber),
          memberId: normalizeText(payload.memberId),
          lastName: normalizeText(payload.lastName),
          firstName: normalizeText(payload.firstName),
          middleName: normalizeText(payload.middleName),
          classification: normalizeText(payload.classification),
          area: resolveAgmaAreaCode(areaCode) || areaCode,
          book: normalizeCode(payload.book),
          venue: normalizeText(payload.venue),
          remarks: normalizeText(payload.remarks),
          addedBy: normalizeText(payload.addedBy || "json-api"),
          createdAt: new Date().toISOString(),
        });
        saveAgmaRecords(rows);
        send(res, 200, { ok: true, message: "AGMA record saved.", record: rows[rows.length - 1] });
      } catch (error) {
        send(res, 422, { ok: false, message: error?.message || "Unable to save AGMA." });
      }
    });
    return;
  }

  send(res, 400, { ok: false, message: "Unknown action." });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  if (req.method === "OPTIONS") {
    send(res, 204, {});
    return;
  }
  if (url.pathname === "/membership") {
    handleMembership(req, res, url);
    return;
  }
  send(res, 404, { ok: false, message: "Not found." });
});

server.listen(PORT, HOST, () => {
  console.log(`SAMELCII JSON API listening on http://${HOST}:${PORT}`);
});
