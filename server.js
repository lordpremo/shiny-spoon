const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const cors = require("cors");
const { randomBytes } = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const sessions = new Map(); 
// sessions.set(sessionId, { uploaderSocketId, dashboards: Set<socketId> })

function createSessionId() {
  return randomBytes(4).toString("hex");
}

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("create_session", (cb) => {
    const sessionId = createSessionId();
    sessions.set(sessionId, {
      uploaderSocketId: socket.id,
      dashboards: new Set()
    });
    socket.join(sessionId);
    cb({ sessionId });
    console.log("Session created:", sessionId);
  });

  socket.on("join_dashboard", ({ sessionId }, cb) => {
    const session = sessions.get(sessionId);
    if (!session) {
      cb({ ok: false, error: "Session not found" });
      return;
    }
    session.dashboards.add(socket.id);
    socket.join(sessionId);
    cb({ ok: true });
    console.log("Dashboard joined session:", sessionId);
  });

  socket.on("send_file_chunk", ({ sessionId, fileId, name, size, chunk, done }) => {
    const session = sessions.get(sessionId);
    if (!session) return;

    io.to(sessionId).emit("receive_file_chunk", {
      fileId,
      name,
      size,
      chunk,
      done
    });
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
    for (const [sessionId, session] of sessions.entries()) {
      if (session.uploaderSocketId === socket.id) {
        io.to(sessionId).emit("session_closed");
        sessions.delete(sessionId);
      } else if (session.dashboards.has(socket.id)) {
        session.dashboards.delete(socket.id);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
