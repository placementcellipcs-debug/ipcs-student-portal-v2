const axios = require('axios');

const api = axios.create({
    baseURL: process.env.API_BASE_URL || 'https://api.ipcstalenzo.com',
});

module.exports = api;
