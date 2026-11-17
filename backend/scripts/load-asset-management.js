const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');

const SOURCE = 'tpo_asset';
const TABLES = [
  'Asset_Category_Master_V3', 'Asset_Subcategory_Master_V3', 'Asset_Type_Master_V3',
  'Asset_Locations_V3', 'Asset_Register_V3', 'Asset_Inventory_V3',
  'Asset_Assignments_V3', 'Asset_Maintenance_V3', 'Asset_History_V3',
  'Asset_Activity_Log_V3', 'Asset_Documents_V3', 'Asset_Custom_Data_V3',
  'Asset_Vendors_V3', 'Asset_Approvals_V3', 'Asset_Transfers_V3',
  'Asset_Transfer_Items_V3', 'Asset_Disposals_V3', 'Asset_QR_Registry_V3',
  'Asset_Audits_V3', 'Asset_Audit_Items_V3', 'Asset_Notification_Log_V3',
  'Asset_Inventory_Transactions_V3',
];
const normalize = value => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, '');
const keyOf = value => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9]/g, '');
const text = value => String(value ?? '').normalize('NFKC').trim();
const uuidFor = value => {
  const bytes = crypto.createHash('sha1').update(String(value)).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const stableId = (tab, row) => uuidFor(`${SOURCE}:${tab}:${row.sheet_row_number}`);
const parseJson = value => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
};
const fieldsOf = row => {
  const data = parseJson(row.row_data_json);
  return data.fields && typeof data.fields === 'object' ? data.fields : {};
};
const get = (fields, ...aliases) => {
  const wanted = new Set(aliases.map(keyOf));
  for (const [name, value] of Object.entries(fields || {})) {
    if (wanted.has(keyOf(name)) && value !== undefined && value !== null && text(value) !== '') return value;
  }
  return '';
};
const parseNumber = value => {
  const cleaned = text(value).replace(/,/g, '').replace(/[^\d.-]/g, '');
  const result = Number(cleaned);
  return cleaned && Number.isFinite(result) ? result : null;
};
function parseDate(value, dateOnly = false) {
  const raw = text(value);
  if (!raw) return null;
  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  let year; let month; let day; let hour = '00'; let minute = '00'; let second = '00';
  if (match) [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
  else {
    match = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!match) return null;
    [, day, month, year, hour = '00', minute = '00', second = '00'] = match;
  }
  const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return null;
  return dateOnly ? date : `${date} ${String(hour).padStart(2, '0')}:${minute}:${second}`;
}
function parseJsonText(value) {
  const raw = text(value);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return { raw }; }
}
function status(value, fallback = 'active') {
  return text(value || fallback).toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || fallback;
}
function rowsOf(all, tab) { return all.get(tab) || []; }
function sourceKey(tab, row) { return `${tab}:${row.sheet_row_number}`; }

async function loadSource(connection) {
  const placeholders = TABLES.map(() => '?').join(',');
  const [records] = await connection.execute(
    `SELECT tab_name, sheet_row_number, row_data_json FROM source_sheet_records
      WHERE source_key = ? AND tab_name IN (${placeholders}) ORDER BY tab_name, sheet_row_number`,
    [SOURCE, ...TABLES],
  );
  const byTab = new Map(TABLES.map(tab => [tab, []]));
  for (const row of records) byTab.get(row.tab_name)?.push(row);
  return byTab;
}

function makePreview(all) {
  const assetRows = [...rowsOf(all, 'Asset_Register_V3'), ...rowsOf(all, 'Asset_Inventory_V3')];
  const codes = assetRows.map(row => text(get(fieldsOf(row), 'Asset_ID', 'Item_ID', 'Asset Code'))).filter(Boolean);
  const seen = new Set(); const duplicateCodes = [];
  for (const code of codes) { const normalized = normalize(code); if (seen.has(normalized)) duplicateCodes.push(code); else seen.add(normalized); }
  const counts = Object.fromEntries(TABLES.map(tab => [tab, rowsOf(all, tab).length]));
  const missingAssetCodeRows = rowsOf(all, 'Asset_Register_V3').filter(row => !text(get(fieldsOf(row), 'Asset_ID', 'Asset Code'))).length;
  const missingInventoryCodeRows = rowsOf(all, 'Asset_Inventory_V3').filter(row => !text(get(fieldsOf(row), 'Item_ID', 'Item Code'))).length;
  const duplicateClassificationCodes = [];
  const taxonomy = [
    ['Asset_Category_Master_V3', ['Category_ID', 'Category_Code', 'ID'], ['Category_Name', 'Category', 'Name']],
    ['Asset_Subcategory_Master_V3', ['Subcategory_ID', 'Subcategory_Code', 'ID'], ['Subcategory_Name', 'Subcategory', 'Name']],
    ['Asset_Type_Master_V3', ['Asset_Type_ID', 'Asset_Type_Code', 'Item_Type_ID', 'ID'], ['Asset_Type_Name', 'Asset_Type', 'Name']],
  ];
  const indexedTaxonomy = new Map();
  for (const [tab, codeAliases, nameAliases] of taxonomy) {
    const byCode = new Map(); const byName = new Map();
    for (const row of rowsOf(all, tab)) {
      const f = fieldsOf(row);
      const code = normalize(get(f, ...codeAliases));
      const name = normalize(get(f, ...nameAliases));
      if (code) byCode.set(code, (byCode.get(code) || 0) + 1);
      if (name) byName.set(name, (byName.get(name) || 0) + 1);
    }
    for (const [code, count] of byCode) if (count > 1) duplicateClassificationCodes.push({ tab, code, count });
    indexedTaxonomy.set(tab, { byCode: new Set(byCode.keys()), byName: new Set(byName.keys()) });
  }
  const unresolvedClassificationParents = [];
  for (const row of rowsOf(all, 'Asset_Subcategory_Master_V3')) {
    const f = fieldsOf(row); const parentCode = normalize(get(f, 'Category_ID')); const parentName = normalize(get(f, 'Category_Name', 'Category'));
    const categories = indexedTaxonomy.get('Asset_Category_Master_V3');
    if (parentCode && !categories.byCode.has(parentCode) && parentName && !categories.byName.has(parentName)) unresolvedClassificationParents.push('subcategory');
    else if (!parentCode && (!parentName || !categories.byName.has(parentName))) unresolvedClassificationParents.push('subcategory');
  }
  for (const row of rowsOf(all, 'Asset_Type_Master_V3')) {
    const f = fieldsOf(row); const parentCode = normalize(get(f, 'Subcategory_ID')); const parentName = normalize(get(f, 'Subcategory_Name', 'Subcategory'));
    const subcategories = indexedTaxonomy.get('Asset_Subcategory_Master_V3');
    if (parentCode && !subcategories.byCode.has(parentCode) && parentName && !subcategories.byName.has(parentName)) unresolvedClassificationParents.push('asset_type');
    else if (!parentCode && (!parentName || !subcategories.byName.has(parentName))) unresolvedClassificationParents.push('asset_type');
  }
  return {
    source: SOURCE, tabsFound: Object.values(counts).filter(Boolean).length, counts,
    duplicateAssetCodes: [...new Set(duplicateCodes)], duplicateClassificationCodes,
    unresolvedClassificationParentRows: unresolvedClassificationParents.length,
    missingAssetCodeRows, missingInventoryCodeRows,
  };
}

async function fetchMaps(connection) {
  const [branches] = await connection.execute('SELECT id, name, normalized_name FROM branches');
  const [users] = await connection.execute('SELECT id, normalized_email, employee_id FROM users WHERE status = \'active\'');
  const [assets] = await connection.execute('SELECT id, asset_code, source_record_key FROM assets');
  const [locations] = await connection.execute('SELECT id, name, normalized_name, branch_id, metadata FROM asset_locations');
  return {
    branches: new Map(branches.map(row => [normalize(row.normalized_name || row.name), row.id])),
    usersByEmail: new Map(users.filter(row => row.normalized_email).map(row => [normalize(row.normalized_email), row.id])),
    usersByEmployee: new Map(users.filter(row => row.employee_id).map(row => [normalize(row.employee_id), row.id])),
    assets: new Map(assets.map(row => [normalize(row.asset_code), row.id])),
    locations,
  };
}

async function runImport(connection, all) {
  const counts = {};
  const maps = await fetchMaps(connection);
  const source = SOURCE;
  const classificationIds = new Map();
  const classificationCandidates = new Map();
  const addClassificationLookup = (key, id) => {
    if (!key) return;
    const found = classificationCandidates.get(key) || [];
    if (!found.includes(id)) found.push(id);
    classificationCandidates.set(key, found);
    if (found.length === 1) classificationIds.set(key, id);
    else classificationIds.delete(key);
  };
  const findClassification = (kind, parentId, code, name) => {
    const normalizedCode = normalize(code); const normalizedName = normalize(name);
    const scopedCode = `${kind}:${normalize(parentId)}:code:${normalizedCode}`;
    const scopedName = `${kind}:${normalize(parentId)}:name:${normalizedName}`;
    return (parentId && normalizedCode && classificationIds.get(scopedCode))
      || (parentId && normalizedName && classificationIds.get(scopedName))
      || (normalizedCode && classificationIds.get(`${kind}:code:${normalizedCode}`))
      || (normalizedName && classificationIds.get(`${kind}:name:${normalizedName}`))
      || null;
  };
  const upsertClassification = async (row, kind, parentId, fallbackCode) => {
    const f = fieldsOf(row);
    const name = text(get(f, kind === 'category' ? 'Category_Name' : kind === 'subcategory' ? 'Subcategory_Name' : 'Asset_Type_Name', 'Name'));
    if (!name) return null;
    const sourceCode = text(get(f, kind === 'category' ? 'Category_ID' : kind === 'subcategory' ? 'Subcategory_ID' : 'Asset_Type_ID', 'Category_Code', 'Asset_Type_Code', 'Item_Type_ID', 'ID')) || fallbackCode;
    const id = stableId(`classification_${kind}`, row);
    const internalCode = `${kind.toUpperCase()}-${id}`;
    const statusValue = status(get(f, 'Status'));
    const sourceRecordKey = sourceKey(row.tab_name, row);
    await connection.execute(
      `INSERT INTO asset_classifications
        (id, classification_code, kind, name, parent_id, type_class, status, source, source_record_key, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), parent_id=VALUES(parent_id), type_class=VALUES(type_class), status=VALUES(status), metadata=VALUES(metadata)`,
      [id, internalCode, kind, name, parentId, status(get(f, 'Type', 'Record_Type'), ''), statusValue, source, sourceRecordKey, JSON.stringify({ fields: f, sourceCode, sourceRow: row.sheet_row_number })],
    );
    if (kind === 'category') {
      addClassificationLookup(`category:code:${normalize(sourceCode)}`, id);
      addClassificationLookup(`category:name:${normalize(name)}`, id);
    } else {
      addClassificationLookup(`${kind}:${normalize(parentId)}:code:${normalize(sourceCode)}`, id);
      addClassificationLookup(`${kind}:${normalize(parentId)}:name:${normalize(name)}`, id);
      addClassificationLookup(`${kind}:code:${normalize(sourceCode)}`, id);
      addClassificationLookup(`${kind}:name:${normalize(name)}`, id);
    }
    return id;
  };

  for (const [tab, kind] of [['Asset_Category_Master_V3', 'category']]) {
    for (const row of rowsOf(all, tab)) await upsertClassification(row, kind, null, `CAT-${stableId('cat', row).slice(0, 8)}`);
  }
  for (const [tab, kind, parentKind] of [['Asset_Subcategory_Master_V3', 'subcategory', 'category'], ['Asset_Type_Master_V3', 'asset_type', 'subcategory']]) {
    for (const row of rowsOf(all, tab)) {
      const f = fieldsOf(row);
      const parentCode = kind === 'subcategory' ? get(f, 'Category_ID') : get(f, 'Subcategory_ID');
      const parentName = kind === 'subcategory' ? get(f, 'Category_Name', 'Category') : get(f, 'Subcategory_Name', 'Subcategory');
      const parentCategoryId = kind === 'asset_type'
        ? findClassification('category', null, get(f, 'Category_ID'), get(f, 'Category_Name', 'Category'))
        : null;
      const parentId = kind === 'subcategory'
        ? findClassification(parentKind, null, parentCode, parentName)
        : findClassification(parentKind, parentCategoryId, parentCode, parentName);
      await upsertClassification(row, kind, parentId, `${kind.toUpperCase()}-${stableId(kind, row).slice(0, 8)}`);
    }
  }
  counts.classifications = [...rowsOf(all, 'Asset_Category_Master_V3'), ...rowsOf(all, 'Asset_Subcategory_Master_V3'), ...rowsOf(all, 'Asset_Type_Master_V3')].length;

  for (const row of rowsOf(all, 'Asset_Locations_V3')) {
    const f = fieldsOf(row);
    const name = text(get(f, 'Location_Name', 'Name')) || [get(f, 'Room'), get(f, 'Area') && `(${get(f, 'Area')})`].filter(Boolean).join(' ');
    if (!name) continue;
    const branchName = text(get(f, 'Branch', 'Branch_ID'));
    const branchId = maps.branches.get(normalize(branchName)) || null;
    const normalizedName = normalize(name);
    const exists = maps.locations.find(item => normalize(item.normalized_name || item.name) === normalizedName && (item.branch_id || null) === branchId);
    const id = exists?.id || stableId('Asset_Locations_V3', row);
    const metadata = { fields: f, branchName, sourceRow: row.sheet_row_number };
    if (!exists) {
      await connection.execute(
        `INSERT INTO asset_locations (id, name, normalized_name, branch_id, metadata)
         VALUES (?, ?, ?, ?, ?)`,
        [id, name, normalizedName, branchId, JSON.stringify(metadata)],
      );
      maps.locations.push({ id, name, normalized_name: normalizedName, branch_id: branchId, metadata });
    }
  }

  const locationFor = (branchName, locationName) => {
    const branchId = maps.branches.get(normalize(branchName)) || null;
    const name = normalize(locationName);
    return maps.locations.find(item => normalize(item.normalized_name || item.name) === name && (item.branch_id || null) === branchId)?.id || null;
  };
  for (const row of rowsOf(all, 'Asset_Register_V3')) {
    const f = fieldsOf(row);
    const code = text(get(f, 'Asset_ID', 'Asset Code'));
    if (!code) continue;
    const branchName = text(get(f, 'Branch'));
    const branchId = maps.branches.get(normalize(branchName)) || null;
    const locationName = text(get(f, 'Location'));
    const locationId = locationFor(branchName, locationName);
    const categoryId = findClassification('category', null, get(f, 'Category_ID'), get(f, 'Category'));
    const subcategoryId = findClassification('subcategory', categoryId, get(f, 'Subcategory_ID'), get(f, 'Subcategory'));
    const typeId = findClassification('asset_type', subcategoryId, get(f, 'Asset_Type_ID'), get(f, 'Asset_Type'));
    const id = stableId('Asset_Register_V3', row);
    const sourceRecordKey = sourceKey(row.tab_name, row);
    const trackingMode = status(get(f, 'Tracking_Mode', 'Tracking Mode'), 'individual');
    const photoUrl = text(get(f, 'Photo_URL', 'Image_URL', 'Photo', 'Image URL'));
    const metadata = {
      fields: f,
      branchName,
      locationName,
      condition: text(get(f, 'Condition')) || 'GOOD',
      brand: text(get(f, 'Brand')),
      model: text(get(f, 'Model')),
      serialNumber: text(get(f, 'Serial_Number', 'Serial Number')),
      vendor: text(get(f, 'Vendor')),
      invoiceNumber: text(get(f, 'Invoice_Number', 'Invoice Number')),
      warrantyEnd: parseDate(get(f, 'Warranty_End', 'Warranty End'), true),
      createdBy: text(get(f, 'Created_By', 'Created By')),
      updatedBy: text(get(f, 'Updated_By', 'Updated By')),
      updatedAt: parseDate(get(f, 'Updated_At', 'Updated At')),
      recordType: 'ASSET',
      sourceRow: row.sheet_row_number,
    };
    const qrToken = stableId('asset_qr', { ...row, tab_name: code });
    await connection.execute(
      `INSERT INTO assets
        (id, asset_code, name, category, subcategory, asset_type, category_classification_id, subcategory_classification_id,
         type_classification_id, branch_id, asset_condition, brand, model, serial_number, vendor_name, invoice_number,
         warranty_end, created_by_name, updated_by_name, tracking_mode, quantity, status, location_id,
         qr_token, image_url, model_3d_url, purchased_at, purchase_cost, source, source_record_key, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), category=VALUES(category), subcategory=VALUES(subcategory),
         asset_type=VALUES(asset_type), category_classification_id=VALUES(category_classification_id),
         subcategory_classification_id=VALUES(subcategory_classification_id), type_classification_id=VALUES(type_classification_id),
         branch_id=VALUES(branch_id), asset_condition=VALUES(asset_condition), brand=VALUES(brand), model=VALUES(model),
         serial_number=VALUES(serial_number), vendor_name=VALUES(vendor_name), invoice_number=VALUES(invoice_number),
         warranty_end=VALUES(warranty_end), created_by_name=VALUES(created_by_name), updated_by_name=VALUES(updated_by_name),
         tracking_mode=VALUES(tracking_mode), quantity=VALUES(quantity),
         status=VALUES(status), location_id=VALUES(location_id), image_url=COALESCE(NULLIF(VALUES(image_url), ''), image_url),
         model_3d_url=VALUES(model_3d_url), purchased_at=VALUES(purchased_at), purchase_cost=VALUES(purchase_cost), metadata=VALUES(metadata)`,
      [id, code, text(get(f, 'Asset_Name', 'Name')) || code, text(get(f, 'Category')), text(get(f, 'Subcategory')),
        text(get(f, 'Asset_Type')), categoryId, subcategoryId, typeId, branchId, text(get(f, 'Condition')) || 'GOOD',
        text(get(f, 'Brand')) || null, text(get(f, 'Model')) || null, text(get(f, 'Serial_Number', 'Serial Number')) || null,
        text(get(f, 'Vendor')) || null, text(get(f, 'Invoice_Number', 'Invoice Number')) || null,
        parseDate(get(f, 'Warranty_End', 'Warranty End'), true), text(get(f, 'Created_By', 'Created By')) || null,
        text(get(f, 'Updated_By', 'Updated By')) || null, trackingMode, parseNumber(get(f, 'Quantity')) || 1, status(get(f, 'Status')),
        locationId, qrToken, photoUrl || null, text(get(f, 'Model_3D_URL', '3D Model URL')) || null,
        parseDate(get(f, 'Purchase_Date', 'Purchased_At'), true), parseNumber(get(f, 'Purchase_Cost')),
        source, sourceRecordKey, JSON.stringify(metadata)],
    );
    maps.assets.set(normalize(code), id);
  }
  counts.assets = rowsOf(all, 'Asset_Register_V3').filter(row => text(get(fieldsOf(row), 'Asset_ID', 'Asset Code'))).length;

  for (const row of rowsOf(all, 'Asset_Inventory_V3')) {
    const f = fieldsOf(row);
    const code = text(get(f, 'Item_ID', 'Item Code'));
    if (!code) continue;
    const branchName = text(get(f, 'Branch'));
    const branchId = maps.branches.get(normalize(branchName)) || null;
    const id = stableId('Asset_Inventory_V3', row);
    const metadata = { fields: f, branchName, recordType: 'INVENTORY', sourceRow: row.sheet_row_number };
    await connection.execute(
      `INSERT INTO asset_inventory_items
        (id, item_code, name, category, subcategory, asset_type, branch_id, quantity, minimum_quantity, status, source, source_record_key, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), category=VALUES(category), subcategory=VALUES(subcategory),
         asset_type=VALUES(asset_type), branch_id=VALUES(branch_id), quantity=VALUES(quantity),
         minimum_quantity=VALUES(minimum_quantity), status=VALUES(status), metadata=VALUES(metadata)`,
      [id, code, text(get(f, 'Item_Name', 'Name')) || code, text(get(f, 'Category')) || null,
        text(get(f, 'Subcategory')) || null, text(get(f, 'Asset_Type')) || null, branchId,
        parseNumber(get(f, 'Quantity')) || 0, parseNumber(get(f, 'Minimum_Quantity', 'Minimum Quantity')) || 0,
        status(get(f, 'Status')), source, sourceKey(row.tab_name, row), JSON.stringify(metadata)],
    );
  }
  counts.inventoryItems = rowsOf(all, 'Asset_Inventory_V3').filter(row => text(get(fieldsOf(row), 'Item_ID', 'Item Code'))).length;

  const actorId = f => maps.usersByEmail.get(normalize(get(f, 'Actor_Email', 'Reported_By_Email', 'Requested_By_Email', 'Uploaded_By_Email')))
    || maps.usersByEmployee.get(normalize(get(f, 'Employee_ID', 'Employee ID', 'Actor_ID')))
    || null;
  const assetId = f => maps.assets.get(normalize(get(f, 'Asset_ID', 'Asset Code')));
  const baseMetadata = (row, f) => JSON.stringify({ fields: f, sourceRow: row.sheet_row_number });

  for (const row of rowsOf(all, 'Asset_Maintenance_V3')) {
    const f = fieldsOf(row); const code = text(get(f, 'Maintenance_ID', 'Ticket_ID'));
    if (!code || !text(get(f, 'Issue'))) continue;
    const id = stableId(row.tab_name, row); const asset = assetId(f);
    await connection.execute(
      `INSERT INTO asset_maintenance_tickets
        (id,ticket_code,asset_id,issue,status,reported_by_user_id,reported_by_name,reported_at,resolved_at,previous_status,cost,remarks,source,source_record_key,metadata)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE asset_id=VALUES(asset_id),issue=VALUES(issue),status=VALUES(status),reported_by_user_id=VALUES(reported_by_user_id),reported_by_name=VALUES(reported_by_name),reported_at=VALUES(reported_at),resolved_at=VALUES(resolved_at),previous_status=VALUES(previous_status),cost=VALUES(cost),remarks=VALUES(remarks),metadata=VALUES(metadata)`,
      [id, code, asset || null, text(get(f, 'Issue')), status(get(f, 'Status'), 'open'), actorId(f), text(get(f, 'Reported_By')) || null,
        parseDate(get(f, 'Reported_Date', 'Reported_At')), parseDate(get(f, 'Completed_Date', 'Resolved_At')),
        status(get(f, 'Previous_Status'), ''), parseNumber(get(f, 'Cost')), text(get(f, 'Remarks')) || null,
        source, sourceKey(row.tab_name, row), baseMetadata(row, f)],
    );
  }
  counts.maintenanceTickets = rowsOf(all, 'Asset_Maintenance_V3').filter(row => text(get(fieldsOf(row), 'Maintenance_ID', 'Ticket_ID'))).length;

  for (const row of rowsOf(all, 'Asset_Assignments_V3')) {
    const f = fieldsOf(row); const code = text(get(f, 'Assignment_ID'));
    if (!code) continue;
    const id = stableId(row.tab_name, row); const asset = assetId(f);
    const branchName = text(get(f, 'Branch'));
    await connection.execute(
      `INSERT INTO asset_assignments
        (id,assignment_code,asset_id,employee_id,employee_name,branch_id,assigned_by_user_id,assigned_at,returned_at,condition_on_issue,condition_on_return,status,remarks,source,source_record_key,metadata)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE asset_id=VALUES(asset_id),employee_id=VALUES(employee_id),employee_name=VALUES(employee_name),branch_id=VALUES(branch_id),assigned_by_user_id=VALUES(assigned_by_user_id),assigned_at=VALUES(assigned_at),returned_at=VALUES(returned_at),condition_on_issue=VALUES(condition_on_issue),condition_on_return=VALUES(condition_on_return),status=VALUES(status),remarks=VALUES(remarks),metadata=VALUES(metadata)`,
      [id, code, asset || null, text(get(f, 'Employee_ID', 'Employee ID')) || null, text(get(f, 'Employee_Name', 'Employee Name')) || null,
        maps.branches.get(normalize(branchName)) || null, actorId(f), parseDate(get(f, 'Assigned_Date', 'Assigned_At')),
        parseDate(get(f, 'Returned_Date')), text(get(f, 'Condition_On_Issue')) || null, text(get(f, 'Condition_On_Return')) || null,
        status(get(f, 'Status'), 'returned'), text(get(f, 'Remarks')) || null, source, sourceKey(row.tab_name, row), baseMetadata(row, f)],
    );
  }
  counts.assignments = rowsOf(all, 'Asset_Assignments_V3').filter(row => text(get(fieldsOf(row), 'Assignment_ID'))).length;

  for (const row of rowsOf(all, 'Asset_History_V3')) {
    const f = fieldsOf(row); const code = text(get(f, 'History_ID'));
    if (!code) continue;
    await connection.execute(
      `INSERT INTO asset_history (id,asset_id,action,actor_name,branch_name,occurred_at,before_state,after_state,remarks,source,source_record_key,metadata)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE asset_id=VALUES(asset_id),action=VALUES(action),actor_name=VALUES(actor_name),branch_name=VALUES(branch_name),occurred_at=VALUES(occurred_at),before_state=VALUES(before_state),after_state=VALUES(after_state),remarks=VALUES(remarks),metadata=VALUES(metadata)`,
      [stableId(row.tab_name, row), assetId(f) || null, text(get(f, 'Action')) || 'ASSET_HISTORY', text(get(f, 'Performed_By')) || null,
        text(get(f, 'Branch')) || null, parseDate(get(f, 'Timestamp')), JSON.stringify(parseJsonText(get(f, 'Old_Value'))),
        JSON.stringify(parseJsonText(get(f, 'New_Value'))), text(get(f, 'Remarks')) || null, source, sourceKey(row.tab_name, row), baseMetadata(row, f)],
    );
  }
  for (const row of rowsOf(all, 'Asset_Activity_Log_V3')) {
    const f = fieldsOf(row); const asset = maps.assets.get(normalize(get(f, 'Entity_ID', 'Asset_ID')));
    if (!asset) continue;
    const detail = { ...f, actorName: text(get(f, 'Actor_Name')), actorEmail: text(get(f, 'Actor_Email')), actorRole: text(get(f, 'Actor_Role')), branch: text(get(f, 'Branch')), entityType: text(get(f, 'Entity_Type')), before: parseJsonText(get(f, 'Before_JSON')), after: parseJsonText(get(f, 'After_JSON')) };
    await connection.execute(
      `INSERT INTO asset_activity (id,asset_id,actor_user_id,action,occurred_at,details)
       VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE action=VALUES(action),occurred_at=VALUES(occurred_at),details=VALUES(details)`,
      [stableId(row.tab_name, row), asset, actorId(f), text(get(f, 'Action')) || 'ASSET_ACTIVITY', parseDate(get(f, 'Timestamp')),
        JSON.stringify({ ...detail, source, sourceRecordKey: sourceKey(row.tab_name, row) })],
    );
  }
  counts.history = rowsOf(all, 'Asset_History_V3').length;
  counts.activity = rowsOf(all, 'Asset_Activity_Log_V3').filter(row => maps.assets.has(normalize(get(fieldsOf(row), 'Entity_ID', 'Asset_ID')))).length;

  for (const row of rowsOf(all, 'Asset_Documents_V3')) {
    const f = fieldsOf(row); const code = text(get(f, 'Document_ID'));
    if (!code) continue;
    const asset = assetId(f); const id = stableId(row.tab_name, row);
    await connection.execute(
      `INSERT INTO asset_documents (id,document_code,asset_id,document_type,file_name,url,uploaded_by_name,uploaded_at,source,source_record_key,metadata)
       VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE asset_id=VALUES(asset_id),document_type=VALUES(document_type),file_name=VALUES(file_name),url=VALUES(url),uploaded_by_name=VALUES(uploaded_by_name),uploaded_at=VALUES(uploaded_at),metadata=VALUES(metadata)`,
      [id, code, asset || null, text(get(f, 'Document_Type')) || null, text(get(f, 'File_Name')) || null, text(get(f, 'Drive_URL', 'URL')) || null,
        text(get(f, 'Uploaded_By')) || null, parseDate(get(f, 'Uploaded_At')), source, sourceKey(row.tab_name, row), baseMetadata(row, f)],
    );
  }
  for (const row of rowsOf(all, 'Asset_Custom_Data_V3')) {
    const f = fieldsOf(row); const code = text(get(f, 'Field_ID'));
    if (!code) continue;
    await connection.execute(
      `INSERT INTO asset_custom_fields (id,asset_id,field_name,field_value,source,source_record_key,metadata)
       VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE asset_id=VALUES(asset_id),field_name=VALUES(field_name),field_value=VALUES(field_value),metadata=VALUES(metadata)`,
      [stableId(row.tab_name, row), assetId(f) || null, text(get(f, 'Field_Name')) || 'Additional detail', text(get(f, 'Field_Value')) || null, source, sourceKey(row.tab_name, row), baseMetadata(row, f)],
    );
  }
  counts.documents = rowsOf(all, 'Asset_Documents_V3').length;
  counts.customFields = rowsOf(all, 'Asset_Custom_Data_V3').length;

  for (const row of rowsOf(all, 'Asset_QR_Registry_V3')) {
    const f = fieldsOf(row); const code = text(get(f, 'QR_ID'));
    const asset = assetId(f); if (!code || !asset) continue;
    await connection.execute(
      `INSERT INTO asset_qr_labels (id,asset_id,qr_value,qr_version,status,created_by_name,created_at,source,source_record_key,metadata)
       VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE asset_id=VALUES(asset_id),qr_value=VALUES(qr_value),qr_version=VALUES(qr_version),status=VALUES(status),created_by_name=VALUES(created_by_name),created_at=VALUES(created_at),metadata=VALUES(metadata)`,
      [stableId(row.tab_name, row), asset, text(get(f, 'QR_Value')) || '', text(get(f, 'QR_Version')) || null, status(get(f, 'Status')),
        text(get(f, 'Created_By')) || null, parseDate(get(f, 'Created_At')), source, sourceKey(row.tab_name, row), baseMetadata(row, f)],
    );
  }
  counts.qrLabels = rowsOf(all, 'Asset_QR_Registry_V3').length;
  return counts;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const connection = await mysqlPool.getPool().getConnection();
  try {
    if (apply) await connection.beginTransaction();
    const all = await loadSource(connection);
    const preview = makePreview(all);
    if (!preview.tabsFound) throw new Error(`No staged rows were found for ${SOURCE}. Refresh the local source snapshot first.`);
    if (!apply) {
      console.log(JSON.stringify({ mode: 'preview_only', ...preview, writes: 0 }, null, 2));
      return;
    }
    if (preview.duplicateAssetCodes.length) throw new Error(`Duplicate asset/item codes must be reconciled before loading: ${preview.duplicateAssetCodes.slice(0, 12).join(', ')}`);
    if (preview.unresolvedClassificationParentRows) throw new Error(`${preview.unresolvedClassificationParentRows} classification rows have no matching parent; reconcile the hierarchy before loading.`);
    const loaded = await runImport(connection, all);
    await connection.commit();
    console.log(JSON.stringify({ mode: 'applied_from_mysql_snapshot', ...preview, loaded, writes: Object.values(loaded).reduce((sum, count) => sum + count, 0) }, null, 2));
  } catch (error) {
    if (apply) await connection.rollback().catch(() => {});
    console.error(`Asset snapshot import failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    connection.release();
    await mysqlPool.close().catch(() => {});
  }
}

main();
