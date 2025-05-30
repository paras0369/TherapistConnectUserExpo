// src/services/socket.js
import io from "socket.io-client";

const SOCKET_URL = "http://192.168.29.45:3000"; // Change to your server URL

class SocketService {
  socket = null;

  connect() {
    this.socket = io(SOCKET_URL, {
      transports: ["websocket"],
    });
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  emit(event, data) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event) {
    if (this.socket) {
      this.socket.off(event);
    }
  }
}

export default new SocketService();
