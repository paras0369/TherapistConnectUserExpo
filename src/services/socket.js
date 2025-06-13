import io from "socket.io-client";

const SOCKET_URL = "http://192.168.29.45:3000";

class SocketService {
  socket = null;
  connectionAttempts = 0;
  maxReconnectionAttempts = 5;

  connect() {
    if (this.socket?.connected) {
      console.log("✅ Socket already connected");
      return this.socket;
    }

    console.log("🔌 Connecting to socket...");

    this.socket = io(SOCKET_URL, {
      transports: ["websocket"],
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectionAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on("connect", () => {
      console.log("✅ Socket connected successfully:", this.socket.id);
      this.connectionAttempts = 0;
    });

    this.socket.on("disconnect", (reason) => {
      console.log("❌ Socket disconnected:", reason);
    });

    this.socket.on("connect_error", (error) => {
      this.connectionAttempts++;
      console.error("🚨 Socket connection error:", error);

      if (this.connectionAttempts >= this.maxReconnectionAttempts) {
        console.error("❌ Max reconnection attempts reached");
      }
    });

    this.socket.on("reconnect", (attemptNumber) => {
      console.log("🔄 Socket reconnected after", attemptNumber, "attempts");
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      console.log("🔌 Disconnecting socket");
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnected() {
    return this.socket?.connected || false;
  }

  emit(event, data) {
    if (this.socket?.connected) {
      console.log(`📤 Socket emit: ${event}`, data);
      this.socket.emit(event, data);
    } else {
      console.warn(`⚠️ Socket not connected, cannot emit: ${event}`);
      // Try to reconnect
      this.connect();
    }
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    } else {
      console.warn(`⚠️ Socket not available for event: ${event}`);
    }
  }

  off(event, callback) {
    if (this.socket) {
      if (callback) {
        this.socket.off(event, callback);
      } else {
        this.socket.off(event);
      }
    }
  }

  // Helper method to wait for connection
  waitForConnection(timeout = 5000) {
    return new Promise((resolve, reject) => {
      if (this.isConnected()) {
        resolve(true);
        return;
      }

      const timeoutId = setTimeout(() => {
        reject(new Error("Socket connection timeout"));
      }, timeout);

      this.socket.once("connect", () => {
        clearTimeout(timeoutId);
        resolve(true);
      });

      this.socket.once("connect_error", (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }
}

export default new SocketService();
