const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Parse JSON bodies (useful later for quoting tool data)
app.use(express.json());

// Basic API route to test if backend is alive
app.get('/api/status', (req, res) => {
    res.json({ status: 'Z-Vorm Server is running' });
});

// Future route for STL file uploads and quoting
// app.post('/api/upload-stl', ...);

app.listen(PORT, () => {
    console.log(`Z-Vorm local server started on http://localhost:${PORT}`);
    console.log(`Press Ctrl+C in PowerShell to stop the server.`);
});