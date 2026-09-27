const connectSheet = require('../config/db');
const NodeCache = require('node-cache');

const dbCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

class DatabaseService {
    static async withRetry(fn, retries = 5, delay = 1000) {
        for (let i = 0; i < retries; i++) {
            try { return await fn(); } 
            catch (error) {
                if (i === retries - 1 || (error.code !== 429 && !error.message?.includes('quota') && !error.message?.includes('rate limit'))) {
                    throw error;
                }
                await new Promise(res => setTimeout(res, delay));
                delay *= 2; 
            }
        }
    }

    // Now accepts a specific spreadsheet ID, defaults to the main portal ID
    static async getSheetData(range, targetSpreadsheetId = process.env.SPREADSHEET_ID, ttlSeconds = 600) {
        const cacheKey = `SHEET_${targetSpreadsheetId}_${range}_${ttlSeconds}`;
        let data = dbCache.get(cacheKey);
        if (data) return data; 

        const { googleSheets, auth } = await connectSheet();

        const response = await this.withRetry(() => googleSheets.spreadsheets.values.get({ 
            auth, 
            spreadsheetId: targetSpreadsheetId, 
            range 
        }));
        
        data = response.data.values || [];
        dbCache.set(cacheKey, data, ttlSeconds);
        return data;
    }

    static async appendRow(range, rowData, targetSpreadsheetId = process.env.SPREADSHEET_ID) {
        const { googleSheets, auth } = await connectSheet();

        await this.withRetry(() => googleSheets.spreadsheets.values.append({ 
            auth, 
            spreadsheetId: targetSpreadsheetId, 
            range, 
            valueInputOption: "USER_ENTERED", 
            resource: { values: [rowData] } 
        }));
        
        dbCache.flushAll();
        return true;
    }

    static async ensureWorksheetWithHeaders(title, headers, targetSpreadsheetId = process.env.SPREADSHEET_ID) {
        if (!targetSpreadsheetId) throw new Error('SPREADSHEET_ID is not configured.');
        const { googleSheets, auth } = await connectSheet();
        const getMetadata = () => this.withRetry(() => googleSheets.spreadsheets.get({
            auth,
            spreadsheetId: targetSpreadsheetId,
            fields: 'sheets.properties(sheetId,title)',
        }));

        let metadata = await getMetadata();
        let sheet = (metadata.data.sheets || []).find((item) => item.properties?.title === title);
        if (!sheet) {
            try {
                await this.withRetry(() => googleSheets.spreadsheets.batchUpdate({
                    auth,
                    spreadsheetId: targetSpreadsheetId,
                    resource: { requests: [{ addSheet: { properties: { title } } }] },
                }));
            } catch (error) {
                // Another API worker may have created the tab between lookup and addSheet.
                metadata = await getMetadata();
                sheet = (metadata.data.sheets || []).find((item) => item.properties?.title === title);
                if (!sheet) throw error;
            }
            metadata = await getMetadata();
            sheet = (metadata.data.sheets || []).find((item) => item.properties?.title === title);
        }

        if (!sheet) throw new Error(`Could not create worksheet ${title}.`);
        const finalColumn = headers.length <= 26
            ? String.fromCharCode(64 + headers.length)
            : `A${String.fromCharCode(64 + (headers.length - 1))}`;
        const range = `${title}!A1:${finalColumn}1`;
        const headerResponse = await this.withRetry(() => googleSheets.spreadsheets.values.get({
            auth, spreadsheetId: targetSpreadsheetId, range,
        }));
        const currentHeaders = headerResponse.data.values?.[0] || [];
        if (currentHeaders.every((value) => !String(value || '').trim())) {
            await this.withRetry(() => googleSheets.spreadsheets.values.update({
                auth,
                spreadsheetId: targetSpreadsheetId,
                range,
                valueInputOption: 'RAW',
                resource: { values: [headers] },
            }));
            dbCache.flushAll();
            return true;
        }

        const matches = headers.every((header, index) => String(currentHeaders[index] || '').trim().toLowerCase() === header.toLowerCase());
        if (!matches) throw new Error(`Worksheet ${title} exists with different headers; refusing to overwrite it.`);
        return true;
    }

    // New method to update a specific row (used for GamePal streaks/scores)
    static async updateRow(range, rowData, targetSpreadsheetId = process.env.SPREADSHEET_ID) {
        const { googleSheets, auth } = await connectSheet();

        await this.withRetry(() => googleSheets.spreadsheets.values.update({ 
            auth, 
            spreadsheetId: targetSpreadsheetId, 
            range, 
            valueInputOption: "USER_ENTERED", 
            resource: { values: [rowData] } 
        }));
        
        dbCache.flushAll();
        return true;
    }

    static getVal(row, headers, possibleNames, fallbackIndex = -1, defaultValue = "N/A") {
        if (headers && headers.length > 0) {
            for (let name of possibleNames) {
                const idx = headers.findIndex(h => h && h.toString().trim().toLowerCase().includes(name.toLowerCase()));
                if (idx !== -1 && row[idx] !== undefined && row[idx] !== "") return row[idx].toString().trim();
            }
        }
        if (fallbackIndex !== -1 && row[fallbackIndex] !== undefined && row[fallbackIndex] !== "") return row[fallbackIndex].toString().trim();
        return defaultValue;
    }
}

module.exports = DatabaseService;
