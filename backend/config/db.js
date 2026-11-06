const { google } = require('googleapis');
const path = require('path');

let connectionPromise;

const connectSheet = async () => {
    if (!connectionPromise) {
        connectionPromise = (async () => {
            try {
                const auth = new google.auth.GoogleAuth({
                    // Ensure google-credentials.json is beside the backend server.
                    keyFile: path.join(__dirname, '../google-credentials.json'),
                    scopes: [
                        'https://www.googleapis.com/auth/spreadsheets',
                        'https://www.googleapis.com/auth/drive'
                    ],
                });

                const client = await auth.getClient();
                const googleSheets = google.sheets({ version: 'v4', auth: client });

                console.log("Successfully authenticated with Google Cloud Platform.");
                return { auth, googleSheets };
            } catch (error) {
                console.error("Database Connection Error:", error.message);
                throw error;
            }
        })();
    }

    try {
        return await connectionPromise;
    } catch (error) {
        connectionPromise = undefined;
        throw error;
    }
};

module.exports = connectSheet;
