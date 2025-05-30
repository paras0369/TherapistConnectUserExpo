// Updated src/services/firebase.js - Using new modular API
import {
  getMessaging,
  requestPermission,
  setBackgroundMessageHandler,
  onMessage,
  getToken,
  onNotificationOpenedApp,
  getInitialNotification,
  subscribeToTopic,
  unsubscribeFromTopic,
} from "@react-native-firebase/messaging";
import { getApp } from "@react-native-firebase/app";
import { Platform } from "react-native";

export class FirebaseService {
  static async initializeFirebase() {
    try {
      // Use modular API - getApp()
      const app = getApp();
      console.log("Firebase app initialized:", app.name);

      // Get messaging instance
      const messaging = getMessaging(app);

      // Request permission for notifications using modular API
      const authStatus = await requestPermission(messaging);
      const enabled =
        authStatus === 1 || // AUTHORIZED
        authStatus === 2; // PROVISIONAL

      if (enabled) {
        console.log("Authorization status:", authStatus);

        // Get FCM token using modular API
        const fcmToken = await getToken(messaging);
        console.log("FCM Token:", fcmToken);
        return fcmToken;
      }
    } catch (error) {
      console.error("Firebase initialization error:", error);
    }
    return null;
  }

  static async getFCMToken() {
    try {
      const app = getApp();
      const messaging = getMessaging(app);
      const fcmToken = await getToken(messaging);
      return fcmToken;
    } catch (error) {
      console.error("Error getting FCM token:", error);
      return null;
    }
  }

  static setupNotificationListeners(onCallNotification) {
    const app = getApp();
    const messaging = getMessaging(app);

    // Background message handler using modular API
    setBackgroundMessageHandler(messaging, async (remoteMessage) => {
      console.log("Message handled in the background!", remoteMessage);
      if (remoteMessage.data?.type === "incoming_call") {
        onCallNotification(remoteMessage.data);
      }
    });

    // Foreground message handler
    const unsubscribe = onMessage(messaging, async (remoteMessage) => {
      console.log("A new FCM message arrived!", remoteMessage);
      if (remoteMessage.data?.type === "incoming_call") {
        onCallNotification(remoteMessage.data);
      }
    });

    // Handle notification tap when app is in background
    onNotificationOpenedApp(messaging, (remoteMessage) => {
      console.log(
        "Notification caused app to open from background state:",
        remoteMessage
      );
      if (remoteMessage.data?.type === "incoming_call") {
        onCallNotification(remoteMessage.data);
      }
    });

    // Handle notification tap when app is completely closed
    getInitialNotification(messaging).then((remoteMessage) => {
      if (remoteMessage) {
        console.log(
          "Notification caused app to open from quit state:",
          remoteMessage
        );
        if (remoteMessage.data?.type === "incoming_call") {
          onCallNotification(remoteMessage.data);
        }
      }
    });

    return unsubscribe;
  }

  static async subscribeToTopic(topic) {
    try {
      const app = getApp();
      const messaging = getMessaging(app);
      await subscribeToTopic(messaging, topic);
      console.log(`Subscribed to topic: ${topic}`);
    } catch (error) {
      console.error("Error subscribing to topic:", error);
    }
  }

  static async unsubscribeFromTopic(topic) {
    try {
      const app = getApp();
      const messaging = getMessaging(app);
      await unsubscribeFromTopic(messaging, topic);
      console.log(`Unsubscribed from topic: ${topic}`);
    } catch (error) {
      console.error("Error unsubscribing from topic:", error);
    }
  }

  // Check if Firebase is available
  static isFirebaseAvailable() {
    try {
      const app = getApp();
      return !!app;
    } catch (error) {
      console.warn("Firebase not available:", error);
      return false;
    }
  }
}

// Background message handler must be set outside of any component
// Using modular API
const initBackgroundHandler = () => {
  try {
    const app = getApp();
    const messaging = getMessaging(app);
    setBackgroundMessageHandler(messaging, async (remoteMessage) => {
      console.log("Message handled in the background!", remoteMessage);
    });
  } catch (error) {
    console.warn("Could not set background message handler:", error);
  }
};

initBackgroundHandler();
