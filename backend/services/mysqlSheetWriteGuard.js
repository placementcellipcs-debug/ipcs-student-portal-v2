const mysqlEnabled = () => String(process.env.MYSQL_ENABLED || '').trim().toLowerCase() === 'true';

const SHEETS_WRITE_BLOCKED = 'Google Sheets writes are disabled while MySQL is the portal backend. This workflow needs its MySQL save path enabled.';

const assertGoogleSheetsWriteAllowed = () => {
    if (!mysqlEnabled()) return;
    const error = new Error(SHEETS_WRITE_BLOCKED);
    error.code = 'MYSQL_SHEETS_WRITE_DISABLED';
    error.status = 503;
    throw error;
};

const writeMethods = new Set(['append', 'batchUpdate', 'batchClear', 'clear', 'update', 'create', 'delete']);
const proxyCache = new WeakMap();

const guardGoogleSheetsClient = client => {
    if (!client || typeof client !== 'object') return client;
    if (proxyCache.has(client)) return proxyCache.get(client);

    const proxy = new Proxy(client, {
        get(target, property) {
            const value = Reflect.get(target, property, target);
            if (!value || typeof value !== 'object') {
                if (typeof value === 'function' && writeMethods.has(String(property))) {
                    return (...args) => {
                        assertGoogleSheetsWriteAllowed();
                        return value.apply(target, args);
                    };
                }
                return typeof value === 'function' ? value.bind(target) : value;
            }
            return guardGoogleSheetsClient(value);
        },
    });
    proxyCache.set(client, proxy);
    return proxy;
};

module.exports = { assertGoogleSheetsWriteAllowed, guardGoogleSheetsClient };
