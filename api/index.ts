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

let peers: any = {};

io.on("connection", (socket) => {
  if (!peers[socket.id]) {
    peers[socket.id] = {};
    console.log(
      "Peer joined with ID",
      socket.id,
      ". There are " + io.engine.clientsCount + " peer(s) connected."
    );
  }

  socket.on("register", (username) => {
    peers[socket.id].username = username;
    peers[socket.id].isVideoEnabled = false; // Default to false
    // Send existing peers to the new user
    socket.emit("introduction", peers);
    // Notify others
    socket.broadcast.emit("newUserConnected", { id: socket.id, username: username });
  });

  socket.on("signal", (to, from, data) => {
    if (to in peers) {
      io.to(to).emit("signal", to, from, data);
    } else {
      console.log("Peer not found!");
    }
  });

  socket.on("user-toggle-video", (isEnabled) => {
    if (peers[socket.id]) {
      peers[socket.id].isVideoEnabled = isEnabled;
    }
    socket.broadcast.emit("user-toggled-video", { id: socket.id, isEnabled });
  });

  socket.on("disconnect", () => {
    delete peers[socket.id];
    io.sockets.emit("userDisconnected", socket.id);
    console.log(
      "Peer disconnected with ID",
      socket.id,
      ". There are " + io.engine.clientsCount + " peer(s) connected."
    );
  });
});