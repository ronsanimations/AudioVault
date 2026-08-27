try {
    // ==========================================
    // PART 1 OF 4: BINDINGS, STATE & TIMELINES
    // ==========================================
    const audioEngine = new Audio();
    const masterPlayTrigger = document.getElementById('master-play-trigger');
    const progressFill = document.getElementById('track-progress-fill');
    const progressBar = document.getElementById('track-progress-bar');
    const timeCurrent = document.getElementById('time-current');
    const timeDuration = document.getElementById('time-duration');
    const modal = document.getElementById('upload-modal');
    const loopToggleBtn = document.getElementById('loop-toggle-btn');
    const shuffleToggleBtn = document.getElementById('shuffle-toggle-btn');
    const searchInput = document.getElementById('search-input-field');
    const favoriteToggleBtn = document.getElementById('favorite-toggle-btn');
    const themeSelector = document.getElementById('theme-accent-selector');

    const navFeed = document.getElementById('nav-feed');
    const navVault = document.getElementById('nav-vault');
    const navAnalytics = document.getElementById('nav-analytics');
    const feedView = document.getElementById('feed-view');
    const vaultView = document.getElementById('vault-view');
    const analyticsView = document.getElementById('analytics-view');

    // Global Application State Containers
let vaultPlaylist = [];     
let originalUnshuffledList = []; 
let currentTrackIndex = -1;  
let isLoopingActive = false;
let isShuffleActive = false;
let currentFolderFilter = null;
let authToken = localStorage.getItem('vault_token') || null;

let favoritedTrackIds = JSON.parse(localStorage.getItem('vault_favorites')) || [];
let recentlyPlayedTracks = [];

// NEW: Dynamic network link switcher
const BACKEND_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://onrender.com'; 

    if (themeSelector) {
        const savedAccent = localStorage.getItem('vault_accent_color') || '#00F0FF';
        themeSelector.value = savedAccent;
        document.documentElement.style.setProperty('--vault-accent', savedAccent);
        themeSelector.onchange = () => {
            const selectedColor = themeSelector.value;
            document.documentElement.style.setProperty('--vault-accent', selectedColor);
            localStorage.setItem('vault_accent_color', selectedColor);
        };
    }

    function formatTime(secs) {
        const minutes = Math.floor(secs / 60); const seconds = Math.floor(secs % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }

    audioEngine.ontimeupdate = () => {
        if(!audioEngine.duration) return;
        const percentage = (audioEngine.currentTime / audioEngine.duration) * 100;
        if (progressFill) progressFill.style.width = `${percentage}%`;
        if (timeCurrent) timeCurrent.innerText = formatTime(audioEngine.currentTime);
    };
    audioEngine.onloadedmetadata = () => { if (timeDuration) timeDuration.innerText = formatTime(audioEngine.duration); };
    if (progressBar) {
        progressBar.onclick = (e) => {
            if(!audioEngine.duration) return;
            const rect = progressBar.getBoundingClientRect();
            audioEngine.currentTime = ((e.clientX - rect.left) / rect.width) * audioEngine.duration;
        };
    }

        // ==========================================
    // PART 2 OF 4: SEARCH, SKIP ACTIONS & PLAYBACK
    // ==========================================
    if (searchInput) {
        searchInput.oninput = () => {
            const query = searchInput.value.toLowerCase();
            const activeGrid = currentFolderFilter ? document.getElementById('folder-music-grid') : document.getElementById('main-music-grid');
            if (!activeGrid) return; activeGrid.innerHTML = '';
            const filtered = vaultPlaylist.filter(s => s.title.toLowerCase().includes(query) || s.artist.toLowerCase().includes(query));
            if (filtered.length === 0) { activeGrid.innerHTML = `<div style="color:var(--text-muted); padding:20px;">No matching search entries found.</div>`; return; }
            filtered.forEach((song) => addNewTrackToGrid(song, vaultPlaylist.indexOf(song), activeGrid));
        };
    }

    function playTrackAtIndex(index) {
        if (index < 0 || index >= vaultPlaylist.length) return;
        currentTrackIndex = index;
        const song = vaultPlaylist[index];
        document.getElementById('current-title').innerText = song.title;
        document.getElementById('current-artist').innerText = song.artist;
        const thumb = document.getElementById('current-thumb');
        if(song.imageUrl) { thumb.style.backgroundImage = `url('${song.imageUrl}')`; thumb.innerText = ""; }
        else { thumb.style.backgroundImage = "none"; thumb.innerText = "🎵"; }
        
        const allCards = document.querySelectorAll('.song-card');
        allCards.forEach(card => card.classList.remove('now-playing'));
        if (allCards[index]) allCards[index].classList.add('now-playing');

        if (favoriteToggleBtn) {
            const isFav = favoritedTrackIds.includes(song.id);
            favoriteToggleBtn.classList.toggle('favorited', isFav);
            favoriteToggleBtn.innerText = isFav ? "💖" : "🖤";
        }
        pushTrackToHistory(song);
        audioEngine.src = song.audioUrl;
        audioEngine.play().catch(() => {});
        if (masterPlayTrigger) masterPlayTrigger.innerText = "⏸";
    }

    const rewindBtn = document.getElementById('rewind-10s-btn');
    if (rewindBtn) { rewindBtn.onclick = () => { if (audioEngine.src) audioEngine.currentTime = Math.max(0, audioEngine.currentTime - 10); }; }

    const forwardBtn = document.getElementById('forward-10s-btn');
    if (forwardBtn) { forwardBtn.onclick = () => { if (audioEngine.src && audioEngine.duration) audioEngine.currentTime = Math.min(audioEngine.duration, audioEngine.currentTime + 10); }; }

    const skipNextBtn = document.getElementById('skip-next-btn');
    if (skipNextBtn) { skipNextBtn.onclick = () => { let next = currentTrackIndex + 1; playTrackAtIndex(next >= vaultPlaylist.length ? 0 : next); }; }

    const skipPrevBtn = document.getElementById('skip-back-btn');
    if (skipPrevBtn) { skipPrevBtn.onclick = () => { let prev = currentTrackIndex - 1; playTrackAtIndex(prev < 0 ? vaultPlaylist.length - 1 : prev); }; }

    if (masterPlayTrigger) {
        masterPlayTrigger.onclick = () => {
            if(!audioEngine.src) return;
            audioEngine.paused ? (audioEngine.play(), masterPlayTrigger.innerText = "⏸") : (audioEngine.pause(), masterPlayTrigger.innerText = "▶");
        };
    }

    audioEngine.onended = () => {
        if (isLoopingActive) { audioEngine.currentTime = 0; audioEngine.play(); return; }
        let next = currentTrackIndex + 1;
        if (next < vaultPlaylist.length) playTrackAtIndex(next);
        else if (masterPlayTrigger) masterPlayTrigger.innerText = "▶";
    };

    if (loopToggleBtn) { loopToggleBtn.onclick = () => { isLoopingActive = !isLoopingActive; loopToggleBtn.classList.toggle('active', isLoopingActive); }; }

    if (shuffleToggleBtn) {
        shuffleToggleBtn.onclick = () => {
            if (vaultPlaylist.length === 0) return;
            isShuffleActive = !isShuffleActive;
            if (isShuffleActive) {
                shuffleToggleBtn.classList.add('active'); originalUnshuffledList = [...vaultPlaylist];
                for (let i = vaultPlaylist.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [vaultPlaylist[i], vaultPlaylist[j]] = [vaultPlaylist[j], vaultPlaylist[i]];
                }
            } else { shuffleToggleBtn.classList.remove('active'); vaultPlaylist = [...originalUnshuffledList]; }
        };
    }

        // ==========================================
    // PART 3 OF 4: FAVORITES, HISTORY & ANALYTICS
    // ==========================================
    if (favoriteToggleBtn) {
        favoriteToggleBtn.onclick = () => {
            if (currentTrackIndex === -1 || vaultPlaylist.length === 0) return;
            const currentSong = vaultPlaylist[currentTrackIndex];
            if (favoritedTrackIds.includes(currentSong.id)) {
                favoritedTrackIds = favoritedTrackIds.filter(id => id !== currentSong.id);
                favoriteToggleBtn.classList.remove('favorited'); favoriteToggleBtn.innerText = "🖤";
            } else {
                favoritedTrackIds.push(currentSong.id);
                favoriteToggleBtn.classList.add('favorited'); favoriteToggleBtn.innerText = "💖";
            }
            localStorage.setItem('vault_favorites', JSON.stringify(favoritedTrackIds));
        };
    }

    function pushTrackToHistory(song) {
        recentlyPlayedTracks = recentlyPlayedTracks.filter(item => item.id !== song.id);
        recentlyPlayedTracks.unshift(song); if (recentlyPlayedTracks.length > 5) recentlyPlayedTracks.pop();
        const block = document.getElementById('sidebar-history-block');
        const container = document.getElementById('recent-history-list');
        if (!container || !block) return; block.style.display = 'block'; container.innerHTML = '';
        recentlyPlayedTracks.forEach(track => {
            const li = document.createElement('li'); li.className = 'history-item'; li.innerText = `🎵 ${track.title}`;
            li.onclick = () => { const queueIndex = vaultPlaylist.findIndex(s => s.id === track.id); if (queueIndex !== -1) playTrackAtIndex(queueIndex); };
            container.appendChild(li);
        });
    }

    if (navFeed) { navFeed.onclick = () => { currentFolderFilter = null; if (feedView) feedView.style.display = 'block'; if (vaultView) vaultView.style.display = 'none'; if (analyticsView) analyticsView.style.display = 'none'; navFeed.classList.add('active'); if (navVault) navVault.classList.remove('active'); if (navAnalytics) navAnalytics.classList.remove('active'); loadVaultTracks(); }; }
    if (navVault) { navVault.onclick = () => { if (feedView) feedView.style.display = 'none'; if (vaultView) vaultView.style.display = 'block'; if (analyticsView) analyticsView.style.display = 'none'; navVault.classList.add('active'); if (navFeed) navFeed.classList.remove('active'); if (navAnalytics) navAnalytics.classList.remove('active'); renderFoldersDashboard(); }; }
    if (navAnalytics) { navAnalytics.onclick = () => { if (feedView) feedView.style.display = 'none'; if (vaultView) vaultView.style.display = 'none'; if (analyticsView) analyticsView.style.display = 'block'; navAnalytics.classList.add('active'); if (navFeed) navFeed.classList.remove('active'); if (navVault) navVault.classList.remove('active'); calculateVaultAnalyticsDashboard(); }; }

    function calculateVaultAnalyticsDashboard() {
        const totalSongs = vaultPlaylist.length;
        document.getElementById('stat-total-songs').innerText = totalSongs;
        let totalSeconds = totalSongs * 215; const minutes = Math.floor(totalSeconds / 60);
        document.getElementById('stat-total-time').innerText = `${minutes} mins`;
        let simulatedMegabytes = (totalSongs * 4.8).toFixed(1);
        document.getElementById('stat-total-size').innerText = `${simulatedMegabytes} MB`;
    }

        // ==========================================
    // PART 4 OF 4: AUTH, FOLDERS & SYSTEM INITIALIZERS
    // ==========================================
    const authModal = document.getElementById('auth-modal');
    const authStatusBtn = document.getElementById('auth-status-btn');
    const authToggleMode = document.getElementById('auth-toggle-mode');
    const authForm = document.getElementById('auth-form');
    let isLoginMode = true;

    if (authStatusBtn) {
        authStatusBtn.onclick = () => {
            if (authToken) { localStorage.clear(); authToken = null; location.reload(); } 
            else if (authModal) { authModal.style.display = 'flex'; }
        };
    }
    if (authToggleMode) {
        authToggleMode.onclick = () => {
            isLoginMode = !isLoginMode;
            document.getElementById('auth-modal-title').innerText = isLoginMode ? "Access AudioVault Profile" : "Create Vault Account";
            document.getElementById('auth-submit-btn').innerText = isLoginMode ? "Login" : "Register Profile";
            authToggleMode.innerText = isLoginMode ? "Don't have an account? Register here" : "Already registered? Login here";
        };
    }
    if (authForm) {
        authForm.onsubmit = async (e) => {
            e.preventDefault();
            const username = document.getElementById('auth-user').value;
            const password = document.getElementById('auth-pass').value;
            const path = isLoginMode ? 'login' : 'register';
            try {
                // Change from: fetch(`http://localhost:5000/api/auth/${path}`...
                const res = await fetch(`${BACKEND_URL}/api/auth/${path}`, {
                const data = await res.json(); if (!res.ok) return alert(data.error);
                if (isLoginMode) { localStorage.setItem('vault_token', data.token); localStorage.setItem('vault_user', data.username); location.reload(); } 
                else { alert("Account created successfully!"); isLoginMode = true; authToggleMode.click(); }
            } catch { alert("Authentication channel dropped."); }
        };
    }

    function getStoredFolders() { const list = localStorage.getItem('vault_folders'); return list ? JSON.parse(list) : ["Chill Vibes", "Gaming Files", "Project Demos"]; }
    const createFolderBtn = document.getElementById('create-folder-btn');
    if (createFolderBtn) {
        createFolderBtn.onclick = () => {
            const name = prompt("Enter a unique folder title:"); if (!name) return; const folders = getStoredFolders();
            if (folders.includes(name)) return alert("Folder title conflict!"); folders.push(name);
            localStorage.setItem('vault_folders', JSON.stringify(folders)); renderFoldersDashboard();
        };
    }
    function syncFolderOptionsDropdown() {
        const selector = document.getElementById('form-folder'); if (!selector) return;
        selector.innerHTML = `<option value="">Unassigned (Acoustic Feed Only)</option>`;
        getStoredFolders().forEach(f => { selector.innerHTML += `<option value="${f}">${f}</option>`; });
    }
    function renderFoldersDashboard() {
        const fGrid = document.getElementById('main-folder-grid'); const mGrid = document.getElementById('folder-music-grid');
        if (fGrid) fGrid.style.display = 'grid'; if (mGrid) mGrid.innerHTML = '';
        document.getElementById('vault-title').innerText = "My Folder Vaults"; if (!fGrid) return; fGrid.innerHTML = '';
        getStoredFolders().forEach(folderName => {
            const card = document.createElement('div'); card.className = 'folder-card'; card.innerHTML = `<span class="folder-icon">📁</span>${folderName}`;
            card.onclick = () => { currentFolderFilter = folderName; fGrid.style.display = 'none'; document.getElementById('vault-title').innerText = `Vaults ➔ ${folderName}`; loadVaultTracks(); };
            fGrid.appendChild(card);
        });
    }

    async function loadVaultTracks() {
        if (!authToken) return;
        try {
            const response = await fetch(`${BACKEND_URL}/api/songs`, { headers: { 'Authorization': `Bearer ${authToken}` } });
            const tracks = await response.json();
            vaultPlaylist = currentFolderFilter ? tracks.filter(t => t.folder === currentFolderFilter) : tracks;
            const targetGrid = currentFolderFilter ? document.getElementById('folder-music-grid') : document.getElementById('main-music-grid');
            if (!targetGrid) return; targetGrid.innerHTML = '';
            if (vaultPlaylist.length === 0) { targetGrid.innerHTML = `<div style="color:var(--text-muted); padding:20px;">Vault empty.</div>`; return; }
            vaultPlaylist.forEach((song, index) => addNewTrackToGrid(song, index, targetGrid));
        } catch { console.log("Failed tracking data reads."); }
    }

    const uploadForm = document.getElementById('upload-form');
    if (uploadForm) {
        uploadForm.onsubmit = async (e) => {
            e.preventDefault(); const submitBtn = document.getElementById('vault-submit-btn'); submitBtn.innerText = "Encrypting..."; submitBtn.disabled = true;
            const formData = new FormData(); formData.append('title', document.getElementById('form-title').value); formData.append('artist', document.getElementById('form-artist').value); formData.append('folder', document.getElementById('form-folder').value);
            
            const audioInput = document.getElementById('form-audio'); 
            const imageInput = document.getElementById('form-image');
            
            // FIX BOUNDARIES: Extract array item 0 explicitly to stop silent freezes
            if (audioInput.files && audioInput.files.length > 0) { formData.append('audio', audioInput.files[0]); }
            if (imageInput.files && imageInput.files.length > 0) { formData.append('image', imageInput.files[0]); }
            try {
                const res = await fetch('http://localhost:5000/api/songs/upload', { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}` }, body: formData });
                if (res.ok) { if (modal) modal.style.display = 'none'; uploadForm.reset(); loadVaultTracks(); }
            } catch { alert("Upload link dropped."); }
            finally { submitBtn.innerText = "Secure to Vault"; submitBtn.disabled = false; }
        };
    }

    function addNewTrackToGrid(song, index, targetGrid) {
        const card = document.createElement('div'); card.className = 'song-card';
        card.onclick = (e) => { if (!e.target.classList.contains('delete-vault-btn')) playTrackAtIndex(index); };
        const coverStyle = song.imageUrl ? `style="background-image: url('${song.imageUrl}'); font-size:0;"` : '';
        card.innerHTML = `<button class="delete-vault-btn">&times;</button><div class="cover-art" ${coverStyle}>💿</div><div class="track-title">${song.title}</div><div class="artist-name">${song.artist}</div>`;
        card.querySelector('.delete-vault-btn').onclick = async (e) => {
            e.stopPropagation(); if (!confirm("Delete track?")) return;
            await fetch(`http://localhost:5000/api/songs/${song.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${authToken}` } });
            card.remove(); loadVaultTracks();
        };
        targetGrid.appendChild(card);
    }

    const studioBtn = document.getElementById('upload-studio-btn');
    const closeBtn = document.getElementById('close-modal-btn');
    if (studioBtn) { studioBtn.onclick = () => { syncFolderOptionsDropdown(); if (modal) modal.style.display = 'flex'; }; }
    if (closeBtn) { closeBtn.onclick = () => { if (modal) modal.style.display = 'none'; }; }

    if (authToken) {
        if (authStatusBtn) authStatusBtn.innerText = `Logout (${localStorage.getItem('vault_user')})`;
        if (studioBtn) studioBtn.style.display = 'block';
        if (navAnalytics) navAnalytics.style.display = 'block';
        loadVaultTracks();
    } else {
        if (studioBtn) studioBtn.style.display = 'none';
        if (navAnalytics) navAnalytics.style.display = 'none';
    }

} catch (error) {
    alert("AudioVault Script Compilation Error: " + error.message + "\nStack: " + error.stack);
}
