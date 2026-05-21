const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Enable CORS so staff can connect seamlessly across different devices
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Explicitly serve static assets out of the local public directory folder
app.use(express.static(path.resolve(__dirname, 'public')));

// Optional routing handler to ensure index.html serves cleanly 
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});

// Central Global App State Container
let currentPlayback = {
    url: 'https://stream.revma.ihrhls.com/v8/playlist.m3u8', // Default baseline backup station
    title: 'Default Office Radio Lounge',
    type: 'radio',
    startedAt: Date.now(),
    isPlaying: true
};

let globalQueue = [];
let playlists = {
    "🔥 Friday Morning Energy": [
        { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Team Retro Classic Anthem", type: "song" }
    ]
};

io.on('connection', (socket) => {
    // Catch new users up immediately on current track layout settings
    socket.emit('sync-playback', currentPlayback);
    socket.emit('update-queue', globalQueue);
    socket.emit('update-playlists', playlists);

    // Event: Explicit tuning to a radio channel
    socket.on('change-track', (trackData) => {
        currentPlayback = { ...trackData, startedAt: Date.now(), isPlaying: true };
        io.emit('sync-playback', currentPlayback);
    });

    // Event: Shared Play/Pause button synchronization toggle
    socket.on('toggle-play-pause', () => {
        currentPlayback.isPlaying = !currentPlayback.isPlaying;
        io.emit('sync-state-change', {
            isPlaying: currentPlayback.isPlaying,
            type: currentPlayback.type
        });
    });

    // Event: Adding a YouTube URL to the queue
    socket.on('add-to-queue', (track) => {
        globalQueue.push(track);
        io.emit('update-queue', globalQueue);

        // FIX: If the station is on a standard live radio stream, we don't automatically cut it off.
        // But if playback was completely frozen or idling, immediately kick off the queued song!
        if (currentPlayback.type === 'standby' || !currentPlayback.isPlaying) {
            const nextTrack = globalQueue.shift();
            currentPlayback = { ...nextTrack, startedAt: Date.now(), isPlaying: true };
            io.emit('sync-playback', currentPlayback);
            io.emit('update-queue', globalQueue);
        }
    });

    // Event: Moving forward when an item finishes playing (or via Skip button)
    socket.on('song-finished', () => {
        if (globalQueue.length > 0) {
            // Pull next item cleanly out of the array pool
            const nextTrack = globalQueue.shift();
            currentPlayback = { ...nextTrack, startedAt: Date.now(), isPlaying: true };
            io.emit('sync-playback', currentPlayback);
            io.emit('update-queue', globalQueue);
        } else {
            // Fallback: If queue drops to zero items, reset state to an empty standby structure
            currentPlayback = {
                url: '',
                title: 'Queue Finished - Select a Track or Radio Station',
                type: 'standby',
                startedAt: Date.now(),
                isPlaying: false
            };
            io.emit('sync-playback', currentPlayback);
        }
    });

    // Event: Playlist preservation
    socket.on('save-playlist', ({ name, tracks }) => {
        playlists[name] = tracks;
        io.emit('update-playlists', playlists);
    });

    // Event: Loading an entire saved structural block back into active queue arrays
    socket.on('load-playlist', (name) => {
        if (playlists[name]) {
            globalQueue = [...globalQueue, ...playlists[name]];
            io.emit('update-queue', globalQueue);
            
            // Immediately kick off the first track if the radio is just idling
            if (currentPlayback.type === 'radio' || currentPlayback.type === 'standby') {
                const nextTrack = globalQueue.shift();
                currentPlayback = { ...nextTrack, startedAt: Date.now(), isPlaying: true };
                io.emit('sync-playback', currentPlayback);
                io.emit('update-queue', globalQueue);
            }
        }
    });
});

// Set environment cloud server configuration port layouts
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`📡 Radio Station server active on port ${PORT}`);
});