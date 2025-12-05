"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_1 = require("socket.io");
require("dotenv/config");

/**
 * Allowed CORS origins.
 * Parsed from the ORIGIN environment variable (comma-separated).
 *
 * @constant {string[]}
 */
const origins = (process.env.ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Socket.io server instance configured with CORS.
 *
 * @type {Server}
 */
const io = new socket_io_1.Server({
    cors: {
        origin: origins,
    },
});

/**
 * Port where the signaling server will listen.
 *
 * @constant {number}
 */
const port = Number(process.env.PORT);
io.listen(port);
console.log(`Server is running on port ${port}`);

/**
 * In-memory room structure.
 *
 * Structure:
 * {
 *   roomId: {
 *     socketId: {
 *       username: string,
 *       isVideoEnabled: boolean
 *     }
 *   }
 * }
 *
 * @typedef {Object.<string, Object.<string, {
 *   username: string,
 *   isVideoEnabled: boolean
 * }>>} Rooms
 */

/**
 * Stores all active rooms and their connected peers.
 *
 * @type {Rooms}
 */
let rooms = {};

/**
 * Fired when a new client connects.
 *
 * @event connection
 * @param {import("socket.io").Socket} socket
 */
io.on("connection", (socket) => {
    console.log("Peer joined with ID", socket.id, ". There are " + io.engine.clientsCount + " peer(s) connected.");

    /**
     * Keeps track of the room the socket is currently in.
     *
     * @type {string|null}
     */
    let currentRoom = null;

    /**
     * Register a peer in a room.
     *
     * @event register
     * @param {string} username - Username of the peer.
     * @param {string} [roomId] - Optional room ID (defaults to `"default"`).
     *
     * Emits:
     *  - `introduction`
     *  - `newUserConnected`
     */
    socket.on("register", (username, roomId) => {
        // Support both old (username only) and new (username, roomId) formats
        const room = roomId || "default";
        currentRoom = room;
        // Join the socket.io room
        socket.join(room);
        // Initialize room if it doesn't exist
        if (!rooms[room]) {
            rooms[room] = {};
        }
        // Register the peer in the room
        rooms[room][socket.id] = {
            username,
            isVideoEnabled: false, // Default to false
        };
        console.log(`Peer ${socket.id} (${username}) registered in room ${room}`);
        // Send existing peers in this room to the new user
        socket.emit("introduction", rooms[room]);
        // Notify others in the same room
        socket.to(room).emit("newUserConnected", {
            id: socket.id,
            username: username,
        });
    });
    /**
     * WebRTC signaling forwarding.
     *
     * @event signal
     * @param {string} to - Target peer socket ID.
     * @param {string} from - Sender socket ID.
     * @param {*} data - Signal payload (SDP, ICE candidate, etc.).
     *
     * Emits:
     *  - `signal`
     */
    socket.on("signal", (to, from, data) => {
        if (currentRoom && rooms[currentRoom]?.[to]) {
            io.to(to).emit("signal", to, from, data);
        }
        else {
            console.log("Peer not found in current room!");
        }
    });
    /**
     * Toggle user's video.
     *
     * @event user-toggle-video
     * @param {boolean} isEnabled - Video enabled flag.
     *
     * Emits:
     *  - `user-toggled-video`
     */
    socket.on("user-toggle-video", (isEnabled) => {
        if (currentRoom && rooms[currentRoom]?.[socket.id]) {
            rooms[currentRoom][socket.id].isVideoEnabled = isEnabled;
            // Broadcast only to the same room
            socket.to(currentRoom).emit("user-toggled-video", {
                id: socket.id,
                isEnabled,
            });
        }
    });
    /**
     * Fired when a user disconnects.
     *
     * @event disconnect
     *
     * Emits:
     *  - `userDisconnected`
     */
    socket.on("disconnect", () => {
        if (currentRoom && rooms[currentRoom]) {
            delete rooms[currentRoom][socket.id];
            // Clean up empty rooms
            if (Object.keys(rooms[currentRoom]).length === 0) {
                delete rooms[currentRoom];
            }
            // Notify others in the same room
            socket.to(currentRoom).emit("userDisconnected", socket.id);
        }
        console.log("Peer disconnected with ID", socket.id, ". There are " + io.engine.clientsCount + " peer(s) connected.");
    });
});
