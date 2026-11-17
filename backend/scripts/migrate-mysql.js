const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const migrationDirectory = path.resolve(__dirname, '../../database/migrations');

function getConnectionConfig() {
    if (String(process.env.MYSQL_ENABLED || '').trim().toLowerCase() !== 'true') {
        throw new Error('Set MYSQL_ENABLED=true in the local backend .env before applying migrations.');
    }
    const required = ['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD'];
    const missing = required.filter(name => !String(process.env[name] || '').trim());
    if (missing.length) throw new Error(`Missing MySQL settings: ${missing.join(', ')}`);

    return {
        host: process.env.MYSQL_HOST.trim(),
        port: Number(process.env.MYSQL_PORT || 3306),
        database: process.env.MYSQL_DATABASE.trim(),
        user: process.env.MYSQL_USER.trim(),
        password: process.env.MYSQL_PASSWORD,
        ssl: String(process.env.MYSQL_SSL || '').trim().toLowerCase() === 'true' ? { rejectUnauthorized: true } : undefined,
        connectTimeout: 10000,
        timezone: 'Z',
        charset: 'utf8mb4',
    };
}

function parseSqlStatements(source) {
    const withoutFullLineComments = source
        .split(/\r?\n/)
        .filter(line => !/^\s*--/.test(line))
        .join('\n');
    return withoutFullLineComments
        .split(/;\s*(?:\r?\n|$)/)
        .map(statement => statement.trim())
        .filter(Boolean);
}

async function main() {
    const files = fs.readdirSync(migrationDirectory)
        .filter(file => /^\d+_.+\.sql$/i.test(file))
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    if (!files.length) throw new Error(`No SQL migrations were found in ${migrationDirectory}`);

    const connection = await mysql.createConnection(getConnectionConfig());
    try {
        for (const file of files) {
            const version = file.replace(/\.sql$/i, '');
            let alreadyApplied = false;
            try {
                const [rows] = await connection.execute('SELECT version FROM schema_migrations WHERE version = ?', [version]);
                alreadyApplied = rows.length > 0;
            } catch (error) {
                if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
            }

            if (alreadyApplied) {
                console.log(`Skipped ${version}; it is already recorded.`);
                continue;
            }

            const source = fs.readFileSync(path.join(migrationDirectory, file), 'utf8');
            const statements = parseSqlStatements(source);
            for (const statement of statements) await connection.query(statement);
            console.log(`Applied ${version} (${statements.length} SQL statements).`);
        }
        console.log('All database migrations are up to date.');
    } finally {
        await connection.end();
    }
}

main().catch(error => {
    console.error(`MySQL migration failed: ${error.message}`);
    process.exitCode = 1;
});
