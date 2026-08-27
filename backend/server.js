const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 5000;
const DB_FILE = path.join(__dirname, 'database.json');
const USERS_FILE = path.join(__dirname, 'users.json');
const uploadDir = path.join(__dirname, 'uploads');
const JWT_SECRET = 'audiovault_local_secret_key_2026';

// Initialization checks for physical hard drive storage files
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// MIDDLEWARE: Verifies secure user tokens before executing file mutations
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Access denied." });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Session expired." });
        req.user = user;
        next();
    });
};

// --- AUTHENTICATION PORTALS ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
            return res.status(400).json({ error: "Username already exists." });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = { id: Date.now().toString(), username, password: hashedPassword };
        users.push(newUser);
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.status(201).json({ message: "Account verified." });
    } catch {
        res.status(500).json({ error: "Registration failed." });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).json({ error: "Invalid credentials." });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username: user.username });
});

// --- TRACK MANIPULATION ROADWAYS (USER ISOLATED) ---
app.get('/api/songs', authenticateToken, (req, res) => {
    const songs = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const userSongs = songs.filter(s => s.userId === req.user.id);
    res.json(userSongs);
});

app.post('/api/songs/upload', authenticateToken, upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'image', maxCount: 1 }]), (req, res) => {
    try {
        const { title, artist, folder } = req.body;
        const audioFile = req.files?.['audio']?.[0]?.filename;
        const imageFile = req.files?.['image']?.[0]?.filename;
        if (!audioFile) return res.status(400).json({ error: "Audio track missing." });

        const newTrack = {
            id: Date.now().toString(),
            userId: req.user.id,
            title, artist, folder: folder || null,
            audioUrl: `http://localhost:5000/uploads/${audioFile}`,
            imageUrl: imageFile ? `http://localhost:5000/uploads/${imageFile}` : null
        };
        const songs = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        songs.unshift(newTrack);
        fs.writeFileSync(DB_FILE, JSON.stringify(songs, null, 2));
        res.status(201).json({ message: "Secured.", song: newTrack });
    } catch {
        res.status(500).json({ error: "Upload failed." });
    }
});

app.delete('/api/songs/:id', authenticateToken, (req, res) => {
    const songs = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const target = songs.find(s => s.id === req.params.id && s.userId === req.user.id);
    if (!target) return res.status(404).json({ error: "Track missing." });

    const cleanFile = (url) => url ? url.split('/uploads/')[1] : null;
    const aFile = cleanFile(target.audioUrl);
    const iFile = cleanFile(target.imageUrl);

    if (aFile && fs.existsSync(path.join(uploadDir, aFile))) fs.unlinkSync(path.join(uploadDir, aFile));
    if (iFile && fs.existsSync(path.join(uploadDir, iFile))) fs.unlinkSync(path.join(uploadDir, iFile));

    const filtered = songs.filter(s => s.id !== req.params.id);
    fs.writeFileSync(DB_FILE, JSON.stringify(filtered, null, 2));
    res.json({ message: "Wiped." });
});

app.listen(PORT, () => console.log(`🚀 AudioVault Production API live on port ${PORT}`));
