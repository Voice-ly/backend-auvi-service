import { Server } from "socket.io";
import "dotenv/config";

/**
 * Allowed CORS origins.
 * Obtained from the ORIGIN environment variable as a comma-separated list.
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
const io = new Server({
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
 * @typedef {Object} Peer
 * @property {string} username - Username of the connected peer.
 * @property {boolean} isVideoEnabled - Whether the user's video is enabled.
 */

/**
 * @typedef {Object.<string, Peer>} RoomPeers
 */

/**
 * @typedef {Object.<string, RoomPeers>} Rooms
 */

/**
 * Stores all active rooms with their peer information.
 *
 * @type {Rooms}
 */
let rooms: Record<string, Record<string, any>> = {};

/**
 * Event fired when a new client connects.
 *
 * @listens connection
 * @param {import("socket.io").Socket} socket - Connected client socket.
 */
io.on("connection", (socket) => {
    console.log(
        "Peer joined with ID",
        socket.id,
        ". There are " + io.engine.clientsCount + " peer(s) connected."
    );

    /**
     * Keeps track of the room the user is currently in.
     *
     * @type {string | null}
     */
    let currentRoom: string | null = null;

    /**
     * Registers a new peer in a room.
     *
     * @event register
     * @param {string} username - The peer's username.
     * @param {string} [roomId="default"] - Optional room ID.
     *
     * @fires introduction - Sends the list of peers currently in the room.
     * @fires newUserConnected - Notifies peers that a new user joined.
     */

    socket.on("register", (username: string, roomId?: string) => {
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

        console.log(
            `Peer ${socket.id} (${username}) registered in room ${room}`
        );

        // Send existing peers in this room to the new user
        socket.emit("introduction", rooms[room]);

        // Notify others in the same room
        socket.to(room).emit("newUserConnected", {
            id: socket.id,
            username: username,
        });
    });

    /**
     * Handles WebRTC signaling messages.
     *
     * @event signal
     * @param {string} to - Destination peer ID.
     * @param {string} from - Sender peer ID.
     * @param {*} data - The signal payload (SDP / ICE).
     *
     * @fires signal - Forwards the signal to another peer.
     */

    socket.on("signal", (to: string, from: string, data: any) => {
        if (currentRoom && rooms[currentRoom]?.[to]) {
            io.to(to).emit("signal", to, from, data);
        } else {
            console.log("Peer not found in current room!");
        }
    });

    /**
     * Toggles the camera status for the current user.
     *
     * @event user-toggle-video
     * @param {boolean} isEnabled - Whether the camera should be enabled.
     *
     * @fires user-toggled-video - Broadcasts the updated video state.
     */
    socket.on("user-toggle-video", (isEnabled: boolean) => {
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
     * Handles client disconnection.
     *
     * @event disconnect
     *
     * @fires userDisconnected - Notifies peers that the user left the room.
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

        console.log(
            "Peer disconnected with ID",
            socket.id,
            ". There are " + io.engine.clientsCount + " peer(s) connected."
        );
    });
});
