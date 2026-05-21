const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Enable CORS so staff can connect seamlessly across devices
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname, 'public')));

// Central Global App State
let currentPlayback = {
    url: 'https://stream.revma.ihrhls.com/v8/playlist.m3u8', // Default backup radio stream
    title: 'Default Office Radio Lounge',
    type: 'radio',
    startedAt: Date.now()
};

let globalQueue = [];
let playlists = {
    "🔥 Friday Morning Energy": [
        { url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", title: "Chill Sax Synth Vibe", type: "song" },
        { url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", title: "Retro Electronic Wave", type: "song" }
    ]
};

io.on('connection', (socket) => {
    // Catch new users up immediately on what's playing right now
    socket.emit('sync-playback', currentPlayback);
    socket.emit('update-queue', globalQueue);
    socket.emit('update-playlists', playlists);

    // Event: Switch channel or manual track skip
    socket.on('change-track', (trackData) => {
        currentPlayback = { ...trackData, startedAt: Date.now() };
        io.emit('sync-playback', currentPlayback);
    });

    // Event: Staff adds a song link to the queue
    socket.on('add-to-queue', (track) => {
        globalQueue.push(track);
        io.emit('update-queue', globalQueue);
    });

    // Event: Requesting the next song from queue (called automatically when front-end finishes a song)
    socket.on('song-finished', () => {
        if (globalQueue.length > 0) {
            // Pull the next song out of the shared queue
            const nextTrack = globalQueue.shift();
            currentPlayback = { ...nextTrack, startedAt: Date.now() };
            io.emit('sync-playback', currentPlayback);
            io.emit('update-queue', globalQueue);
        }
    });

    // Event: Staff creating a custom playlist
    socket.on('save-playlist', ({ name, tracks }) => {
        playlists[name] = tracks;
        io.emit('update-playlists', playlists);
    });

    // Event: Triggering an entire saved playlist to load into the live queue
    socket.on('load-playlist', (name) => {
        if (playlists[name]) {
            globalQueue = [...globalQueue, ...playlists[name]];
            io.emit('update-queue', globalQueue);
            
            // If nothing is playing or a radio is running, immediately jump into the playlist elements
            if (currentPlayback.type === 'radio') {
                const nextTrack = globalQueue.shift();
                currentPlayback = { ...nextTrack, startedAt: Date.now() };
                io.emit('sync-playback', currentPlayback);
                io.emit('update-queue', globalQueue);
            }
        }
    });
});

// Use Render/Railway assigned ports or default to 3000 locally
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`📡 Radio Station server active on port ${PORT}`);
});