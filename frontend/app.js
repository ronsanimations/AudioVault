const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// 1. Host static assets straight out of the active folder
app.use(express.static(__dirname));

// 2. FIXED CATCH-ALL: Use a middleware function instead of string patterns
// This avoids the routing parser error entirely and securely sends your HTML
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🌐 AudioVault Interface online at: http://localhost:3000`);
});
