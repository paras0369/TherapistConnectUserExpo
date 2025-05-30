// Updated src/services/firebase.js - Fix deprecation warnings and use new API
import messaging from "@react-native-firebase/messaging";
import { getApp } from "@react-native-firebase/app";
import { Platform } from "react-native";

export class FirebaseService {
  static async initializeFirebase() {
    try {
      // Use new API - getApp() instead of deprecated method
      const app = getApp();
      console.log("Firebase app initialized:", app.name);

      // Request permission for notifications using new API
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        console.log("Authorization status:", authStatus);

        // Get FCM token using new API
        const fcmToken = await messaging().getToken();
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
      const fcmToken = await messaging().getToken();
      return fcmToken;
    } catch (error) {
      console.error("Error getting FCM token:", error);
      return null;
    }
  }

  static setupNotificationListeners(onCallNotification) {
    // Background message handler using new API
    messaging().setBackgroundMessageHandler(async (remoteMessage) => {
      console.log("Message handled in the background!", remoteMessage);
      if (remoteMessage.data?.type === "incoming_call") {
        onCallNotification(remoteMessage.data);
      }
    });

    // Foreground message handler
    const unsubscribe = messaging().onMessage(async (remoteMessage) => {
      console.log("A new FCM message arrived!", remoteMessage);
      if (remoteMessage.data?.type === "incoming_call") {
        onCallNotification(remoteMessage.data);
      }
    });

    // Handle notification tap when app is in background
    messaging().onNotificationOpenedApp((remoteMessage) => {
      console.log(
        "Notification caused app to open from background state:",
        remoteMessage
      );
      if (remoteMessage.data?.type === "incoming_call") {
        onCallNotification(remoteMessage.data);
      }
    });

    // Handle notification tap when app is completely closed
    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
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
      await messaging().subscribeToTopic(topic);
      console.log(`Subscribed to topic: ${topic}`);
    } catch (error) {
      console.error("Error subscribing to topic:", error);
    }
  }

  static async unsubscribeFromTopic(topic) {
    try {
      await messaging().unsubscribeFromTopic(topic);
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
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log("Message handled in the background!", remoteMessage);
});
