const crypto = require('crypto');
const mysqlPool = require('../config/mysqlPool');

const normalized = value => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
const clean = value => String(value ?? '').trim();
const getField = (fields, ...names) => {
  const index = new Map(Object.entries(fields || {}).map(([key, value]) => [key.toLocaleLowerCase('en-US').replace(/[^a-z0-9]/g, ''), value]));
  for (const name of names) {
    const key = name.toLocaleLowerCase('en-US').replace(/[^a-z0-9]/g, '');
    if (index.has(key)) return clean(index.get(key));
  }
  return '';
};
const stableUuid = value => {
  const bytes = crypto.createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

async function main() {
  const apply = process.argv.includes('--apply');
  const connection = await mysqlPool.getPool().getConnection();
  try {
    const [runs] = await connection.execute("SELECT status FROM source_import_runs ORDER BY started_at DESC LIMIT 1");
    if (runs[0]?.status !== 'completed') throw new Error('Import and verify the one-time source snapshot before loading company data.');
    const [sourceRows] = await connection.execute(
      `SELECT sheet_row_number, row_data_json FROM source_sheet_records
       WHERE source_key = 'shared_placement' AND tab_name = 'Clients' ORDER BY sheet_row_number`,
    );
    const records = sourceRows.map(row => ({
      rowNumber: Number(row.sheet_row_number),
      fields: typeof row.row_data_json === 'string' ? JSON.parse(row.row_data_json).fields || {} : row.row_data_json?.fields || {},
    })).map(({ rowNumber, fields }) => {
      const name = getField(fields, 'Company Name', 'Company');
      const key = normalized(name);
      if (!key) return null;
      const data = {
        id: stableUuid(`company:${key}`), name: name.slice(0, 240), key: key.slice(0, 240),
        website: getField(fields, 'Company Website', 'Website', 'URL') || null,
        contact: getField(fields, 'Contact Number', 'Company Contact', 'Phone', 'Contact') || null,
        email: getField(fields, 'Mail ID', 'Company Mail ID', 'Company Email', 'Email') || null,
        person: getField(fields, 'Contact Person', 'Company Contact Person', 'Person') || null,
        logo: getField(fields, 'Company Logo', 'Logo') || null,
        location: getField(fields, 'Company Location', 'Location', 'State') || null,
        sourceRow: rowNumber,
        fields,
      };
      return data;
    }).filter(Boolean);
    const unique = new Map(records.map(record => [record.key, record]));
    const report = { mode: apply ? 'apply' : 'preview', sourceRows: records.length, uniqueCompanies: unique.size };
    if (!apply) {
      console.log(JSON.stringify(report, null, 2));
      console.log('Preview only. No company names or contact details were printed.');
      return;
    }
    await connection.beginTransaction();
    for (const company of unique.values()) {
      await connection.execute(
        `INSERT INTO companies (id, company_name, normalized_name, website, contact_number, email, contact_person, logo_url, location, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE company_name = VALUES(company_name), website = COALESCE(NULLIF(VALUES(website), ''), website),
           contact_number = COALESCE(NULLIF(VALUES(contact_number), ''), contact_number), email = COALESCE(NULLIF(VALUES(email), ''), email),
           contact_person = COALESCE(NULLIF(VALUES(contact_person), ''), contact_person), logo_url = COALESCE(NULLIF(VALUES(logo_url), ''), logo_url),
           location = COALESCE(NULLIF(VALUES(location), ''), location), metadata = VALUES(metadata)`,
        [company.id, company.name, company.key, company.website, company.contact, company.email, company.person, company.logo,
          company.location, JSON.stringify({ source: 'shared_placement:Clients', sourceRow: company.sourceRow, fields: company.fields })],
      );
    }
    await connection.commit();
    const [[counts]] = await connection.execute('SELECT COUNT(*) AS total FROM companies');
    console.log(JSON.stringify({ ...report, status: 'completed', companiesInDatabase: Number(counts.total) }, null, 2));
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error(`Company directory load failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    connection.release();
    await mysqlPool.close();
  }
}

main().catch(error => { console.error(`Company directory load could not start: ${error.message}`); process.exitCode = 1; });
