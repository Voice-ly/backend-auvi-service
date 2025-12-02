import { Server } from "socket.io";
import "dotenv/config";

const origins = (process.env.ORIGIN ?? "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const io = new Server({
  cors: {
    origin: origins
  }
});

const port = Number(process.env.PORT);

io.listen(port);
console.log(`Server is running on port ${port}`);

// Store peers by room: { roomId: { socketId: { username, isVideoEnabled } } }
let rooms: Record<string, Record<string, any>> = {};

io.on("connection", (socket) => {
  console.log(
    "Peer joined with ID",
    socket.id,
    ". There are " + io.engine.clientsCount + " peer(s) connected."
  );

  let currentRoom: string | null = null;

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
      isVideoEnabled: false // Default to false
    };

    console.log(`Peer ${socket.id} (${username}) registered in room ${room}`);

    // Send existing peers in this room to the new user
    socket.emit("introduction", rooms[room]);

    // Notify others in the same room
    socket.to(room).emit("newUserConnected", {
      id: socket.id,
      username: username
    });
  });

  socket.on("signal", (to: string, from: string, data: any) => {
    if (currentRoom && rooms[currentRoom]?.[to]) {
      io.to(to).emit("signal", to, from, data);
    } else {
      console.log("Peer not found in current room!");
    }
  });

  socket.on("user-toggle-video", (isEnabled: boolean) => {
    if (currentRoom && rooms[currentRoom]?.[socket.id]) {
      rooms[currentRoom][socket.id].isVideoEnabled = isEnabled;
      // Broadcast only to the same room
      socket.to(currentRoom).emit("user-toggled-video", {
        id: socket.id,
        isEnabled
      });
    }
  });

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