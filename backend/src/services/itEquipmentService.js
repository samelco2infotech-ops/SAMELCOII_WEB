const db = require('../config/database');
const text = (value) => String(value ?? '').trim();
const dateValue = (value) => {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return text(value).slice(0, 10);
};

const hydrateAccountabilityHeader = (row = {}) => ({
  id: Number(row.id ?? row.Id ?? 0),
  usercode: text(row.usercode),
  username: text(row.username),
  dateissued: dateValue(row.dateissued),
  formNo: text(row.formno ?? row.formNo),
  accountcode: text(row.acountcode ?? row.accountcode),
  releasedby: text(row.releasedby),
  releasedsign: Number(row.releasedsign || 0),
  receivedsign: Number(row.receivedsign || 0),
  flagLocation: text(row.flag_location ?? row.flagLocation),
});

const normalizeAccountabilityInput = (input = {}) => {
  const lines = Array.isArray(input.lines) ? input.lines.map((line) => {
    const description = text(line?.description);
    const itemno = text(line?.itemno) || description;
    return {
      itemno,
      description: description || itemno,
      serial: text(line?.serial),
      qty: Math.max(1, Number.parseInt(line?.qty, 10) || 1),
    };
  }).filter((line) => line.itemno || line.description) : [];
  return {
    recipientUsercode: text(input.recipientUsercode ?? input.usercode).toUpperCase(),
    recipientName: text(input.recipientName ?? input.username),
    dateissued: dateValue(input.dateissued),
    formNo: text(input.formNo),
    existingFormNo: text(input.existingFormNo),
    id: Number.parseInt(input.id, 10) || 0,
    accountCode: text(input.accountCode),
    flagLocation: text(input.flagLocation) || 'Paranas',
    releasedsign: Number(input.releasedsign) === 1 ? 1 : 0,
    receivedsign: Number(input.receivedsign) === 1 ? 1 : 0,
    lines,
  };
};

const validateAccountability = (input) => {
  if (!input.recipientUsercode || !input.recipientName) {
    throw Object.assign(new Error('Employee code and name are required.'), { statusCode: 422 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateissued)) {
    throw Object.assign(new Error('Valid date issued (YYYY-MM-DD) is required.'), { statusCode: 422 });
  }
  if (!input.lines.length) {
    throw Object.assign(new Error('Add at least one material line before saving.'), { statusCode: 422 });
  }
};

const resolveUploadUrl = (raw) => {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^(https?:)?\/\//i.test(value) || value.startsWith('data:')) return value;
  const clean = value.replace(/^\/+/, '').replace(/^SAMELCII_WEB_SYSTEM\/+/i, '');
  const base = String(process.env.APP_PUBLIC_BASE || '').trim().replace(/\/+$/, '');
  if (!base) {
    return `/${clean}`;
  }
  return `${base}/${clean}`;
};

const inventoryDefaultAvatarDataUri = (itemCode, description) => {
  const seed = `${itemCode || ''}|${description || ''}` || 'inventory';
  const hue = Math.abs(
    Array.from(seed).reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0)
  ) % 360;
  const hue2 = (hue + 38) % 360;
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="hsl(${hue},58%,82%)"/>` +
    `<stop offset="100%" stop-color="hsl(${hue2},45%,74%)"/>` +
    `</linearGradient></defs>` +
    `<rect width="200" height="160" rx="18" fill="url(#g)"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const borrowedLinePhotoUrl = (photoMap, rowId, itemno, desc) => {
  const uploaded = photoMap.get(String(rowId || '')) || '';
  if (uploaded) return resolveUploadUrl(uploaded);
  return inventoryDefaultAvatarDataUri(itemno || 'item', desc || itemno || 'item');
};

const getInventory = async (limit = 100) => {
  const photoRows = await db.queryAll(
    `SELECT row_pk, relative_path
     FROM ite_inventory_photos
     WHERE source_table = 'materials_it'`
  ).catch(() => []);

  const photoMap = new Map(
    photoRows.map((row) => [String(row.row_pk), String(row.relative_path || '')])
  );

  const rows = await db.queryAll(
    `SELECT
       Id,
       materialcode,
       description,
       category,
       qty,
       inqty,
       outqty,
       qtymin,
       serial
     FROM materials_it
     ORDER BY category ASC, description ASC
     LIMIT ?`,
    [limit]
  );

  return rows.map((row) => ({
    id: row.Id,
    materialCode: row.materialcode || '',
    itemCode: row.materialcode || '',
    description: row.description || '',
    itemname: row.description || '',
    category: row.category || '',
    qty: Number(row.qty || 0),
    inqty: Number(row.inqty || 0),
    outqty: Number(row.outqty || 0),
    qtymin: Number(row.qtymin || 0),
    serial: row.serial || '',
    photoUrl: photoMap.get(String(row.Id)) || '',
    canUploadPhoto: true,
    invTable: 'materials_it',
  }));
};

const getInventoryByType = async (type, limit = 50) => {
  const all = await getInventory(limit);
  const target = String(type || '').trim().toLowerCase();
  if (!target || target === 'all') {
    return all;
  }
  return all.filter((row) => String(row.category || '').trim().toLowerCase() === target);
};

const getEquipmentAssigned = async (usercode) => {
  const headers = await db.queryAll(
    `SELECT
       Id,
       usercode,
       username,
       dateissued,
       formno,
       acountcode,
       releasedby,
       receivedby,
       statusid,
       flag_turnover,
       flag_location
     FROM accountabiltytb
     WHERE usercode = ?
     ORDER BY dateissued DESC, Id DESC`,
    [usercode]
  );

  if (!headers.length) {
    return [];
  }

  const photoRows = await db.queryAll(
    `SELECT row_pk, relative_path
     FROM ite_inventory_photos
     WHERE source_table = 'accoutabiltymaterials'`
  ).catch(() => []);

  const photoMap = new Map(
    photoRows.map((row) => [String(row.row_pk), String(row.relative_path || '')])
  );

  const formNos = Array.from(
    new Set(
      headers
        .map((header) => String(header.formno || '').trim())
        .filter(Boolean)
    )
  );

  const linesByForm = new Map(formNos.map((formNo) => [formNo, []]));
  if (formNos.length) {
    const placeholders = formNos.map(() => '?').join(',');
    const lines = await db.queryAll(
      `SELECT
         Id,
         TRIM(acountcode) AS acountcode,
         TRIM(itemno) AS itemno,
         TRIM(COALESCE(description, '')) AS description,
         COALESCE(qty, 1) AS qty,
         TRIM(COALESCE(serial, '')) AS serial
       FROM accoutabiltymaterials
       WHERE TRIM(acountcode) IN (${placeholders})
       ORDER BY Id ASC`,
      formNos
    );

    for (const line of lines) {
      const key = String(line.acountcode || '').trim();
      if (key && linesByForm.has(key)) {
        linesByForm.get(key).push(line);
      }
    }
  }

  const forms = [];
  for (const header of headers) {
    const formNo = String(header.formno || header.acountcode || header.Id || '').trim();
    const lines = linesByForm.get(formNo) || [];

    forms.push({
      header: {
        formNo,
        dateissued: header.dateissued || '',
        flagLocation: header.flag_location || '',
        accountCode: header.acountcode || formNo,
        releasedBy: header.releasedby || '',
        receivedBy: header.receivedby || '',
        statusId: header.statusid || '',
      },
      lines: lines.map((line) => {
        const itemno = String(line.itemno || '').trim();
        const description = String(line.description || '').trim();
        return {
          itemno,
          description: description || itemno,
          qty: Number(line.qty || 0),
          serial: String(line.serial || '').trim(),
          photoUrl: borrowedLinePhotoUrl(photoMap, line.Id, itemno, description),
        };
      }),
    });
  }

  return forms;
};

const searchUsers = async (query) => {
  const q = text(query);
  if (q.length < 2) return [];
  return db.queryAll(
    `SELECT TRIM(usercode) usercode,TRIM(COALESCE(name,'')) name,
            TRIM(COALESCE(position,'')) position,TRIM(COALESCE(department,'')) department
     FROM usertb
     WHERE (usercode LIKE ? OR name LIKE ?) AND usercode IS NOT NULL AND TRIM(usercode)<>''
     ORDER BY name ASC LIMIT 40`,
    [`%${q}%`, `%${q}%`]
  );
};

const nextAccountabilityFormNo = async (connection = null) => {
  const runner = connection || { query: async (sql, params) => [await db.queryAll(sql, params)] };
  const [rows] = await runner.query('SELECT COUNT(*) total FROM accountabiltytb');
  return `AC-${String(Number(rows[0]?.total || 0) + 2).padStart(8, '0')}`;
};

const listAccountability = async () => {
  const rows = await db.queryAll(
    `SELECT Id id,usercode,username,dateissued,formno,acountcode,releasedby,
            COALESCE(releasedsign,0) releasedsign,COALESCE(receivedsign,0) receivedsign,
            COALESCE(flag_location,'') flag_location
     FROM accountabiltytb
     ORDER BY CASE WHEN COALESCE(releasedsign,0)=1 AND COALESCE(receivedsign,0)=1 THEN 1 ELSE 0 END,Id DESC
     LIMIT 500`
  );
  return rows.map((row) => {
    const item = hydrateAccountabilityHeader(row);
    return { ...item, pending: !(item.releasedsign === 1 && item.receivedsign === 1) };
  });
};

const getAccountability = async ({ formNo = '', id = 0 } = {}) => {
  const cleanFormNo = text(formNo);
  const cleanId = Number.parseInt(id, 10) || 0;
  if (!cleanFormNo && !cleanId) {
    throw Object.assign(new Error('formNo or id is required.'), { statusCode: 422 });
  }
  const row = cleanFormNo
    ? await db.queryOne(
      `SELECT Id id,usercode,username,dateissued,formno,acountcode,releasedby,
              COALESCE(releasedsign,0) releasedsign,COALESCE(receivedsign,0) receivedsign,
              COALESCE(flag_location,'') flag_location
       FROM accountabiltytb WHERE TRIM(formno)=? LIMIT 1`,
      [cleanFormNo]
    )
    : await db.queryOne(
      `SELECT Id id,usercode,username,dateissued,formno,acountcode,releasedby,
              COALESCE(releasedsign,0) releasedsign,COALESCE(receivedsign,0) receivedsign,
              COALESCE(flag_location,'') flag_location
       FROM accountabiltytb WHERE Id=? LIMIT 1`,
      [cleanId]
    );
  if (!row) throw Object.assign(new Error('Accountability record not found.'), { statusCode: 404 });
  const header = hydrateAccountabilityHeader(row);
  const lines = await db.queryAll(
    `SELECT TRIM(itemno) itemno,TRIM(COALESCE(description,'')) description,
            TRIM(COALESCE(serial,'')) serial,COALESCE(qty,1) qty
     FROM accoutabiltymaterials WHERE TRIM(acountcode)=? ORDER BY Id ASC`,
    [header.formNo]
  );
  return {
    header: { ...header, pending: !(header.releasedsign === 1 && header.receivedsign === 1) },
    lines: lines.map((line) => ({
      itemno: text(line.itemno),
      description: text(line.description) || text(line.itemno),
      serial: text(line.serial),
      qty: Number(line.qty || 1),
    })),
  };
};

const saveAccountability = async (rawInput, actor = {}, update = false) => {
  const input = normalizeAccountabilityInput(rawInput);
  validateAccountability(input);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    let formNo = input.formNo;
    let headerId = 0;
    if (update) {
      const [rows] = input.existingFormNo
        ? await connection.query('SELECT Id id,TRIM(formno) formno FROM accountabiltytb WHERE TRIM(formno)=? LIMIT 1', [input.existingFormNo])
        : await connection.query('SELECT Id id,TRIM(formno) formno FROM accountabiltytb WHERE Id=? LIMIT 1', [input.id]);
      if (!rows.length) throw Object.assign(new Error('Record not found for update.'), { statusCode: 404 });
      headerId = Number(rows[0].id);
      formNo = text(rows[0].formno);
      await connection.execute(
        `UPDATE accountabiltytb
         SET usercode=?,username=?,dateissued=?,acountcode=?,releasedsign=?,receivedsign=?,
             receivedby=?,flag_location=? WHERE Id=? LIMIT 1`,
        [input.recipientUsercode, input.recipientName, input.dateissued, input.accountCode,
          input.releasedsign, input.receivedsign, input.recipientName, input.flagLocation, headerId]
      );
      await connection.execute('DELETE FROM accoutabiltymaterials WHERE TRIM(acountcode)=?', [formNo]);
    } else {
      if (!/^AC-\d{8}$/.test(formNo)) formNo = '';
      if (formNo) {
        const [existing] = await connection.query('SELECT 1 FROM accountabiltytb WHERE formno=? LIMIT 1', [formNo]);
        if (existing.length) formNo = '';
      }
      if (!formNo) formNo = await nextAccountabilityFormNo(connection);
      const [result] = await connection.execute(
        `INSERT INTO accountabiltytb
         (usercode,username,dateissued,formno,acountcode,releasedby,releasedsign,
          receivedby,receivedsign,statusid,flag_turnover,flag_location)
         VALUES (?,?,?,?,?,?,?,?,?,0,0,?)`,
        [input.recipientUsercode, input.recipientName, input.dateissued, formNo, input.accountCode,
          text(actor.name || actor.username || actor.usercode), input.releasedsign, input.recipientName,
          input.receivedsign, input.flagLocation]
      );
      headerId = result.insertId;
    }
    for (const line of input.lines) {
      await connection.execute(
        `INSERT INTO accoutabiltymaterials
         (acountcode,itemno,description,qty,cost,amount,\`date\`,serial,usercode)
         VALUES (?,?,?,?,0,0,?,?,?)`,
        [formNo, line.itemno, line.description, line.qty, input.dateissued, line.serial, input.recipientUsercode]
      );
    }
    await connection.commit();
    return { formNo, id: headerId };
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  hydrateAccountabilityHeader,
  normalizeAccountabilityInput,
  getInventory,
  getInventoryByType,
  getEquipmentAssigned,
  searchUsers,
  nextAccountabilityFormNo,
  listAccountability,
  getAccountability,
  saveAccountability,
};
