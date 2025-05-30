// TherapistConnectUserExpo/App.js
import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { Provider } from "react-redux"; // useSelector removed as it's internal to AppNavigator
import { store } from "./src/store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  View,
  ActivityIndicator,
  StyleSheet,
  Alert,
  AppState,
} from "react-native";
import { FirebaseService } from "./src/services/firebase";

import LoginScreen from "./src/screens/LoginScreen";
import OTPScreen from "./src/screens/OTPScreen";
import UserDashboard from "./src/screens/UserDashboard";
import CallScreen from "./src/screens/CallScreen";
// TherapistLoginScreen is removed from User App navigation

import {
  setAuth,
  logout,
  setFCMToken as setReduxFCMToken,
} from "./src/store/authSlice";
import api from "./src/services/api";

const Stack = createStackNavigator();

function AppNavigator() {
  const [isLoading, setIsLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState("Login"); // Default for User App

  useEffect(() => {
    let appStateSubscription;
    let notificationListenerUnsubscribe;

    const init = async () => {
      try {
        const fcmToken = await FirebaseService.initializeFirebase();
        console.log("User App FCM Token:", fcmToken);
        if (fcmToken) {
          store.dispatch(setReduxFCMToken(fcmToken)); // Store FCM in Redux
          notificationListenerUnsubscribe =
            FirebaseService.setupNotificationListeners(handleCallNotification);
        }
        await checkAuthState(fcmToken); // Pass FCM token to auth check
      } catch (error) {
        console.error("User App initialization error:", error);
        setInitialRoute("Login");
      } finally {
        setIsLoading(false);
      }
    };

    init();

    appStateSubscription = AppState.addEventListener(
      "change",
      (nextAppState) => {
        if (nextAppState === "active") {
          console.log("User App has come to the foreground");
          // Optionally re-check auth or refresh data if needed
          // FirebaseService.getFCMToken().then(token => checkAuthState(token)); // Example: re-check with fresh token
        }
      }
    );

    return () => {
      appStateSubscription?.remove();
      notificationListenerUnsubscribe?.(); // Clean up Firebase listener
    };
  }, []);

  const handleCallNotification = (notificationData) => {
    console.log("User App - Notification received:", notificationData);
    // User app primarily won't get 'incoming_call' unless for specific P2P features not described.
    // It might receive 'call_ended' or other informational notifications.
    if (notificationData.type === "call_ended") {
      Alert.alert("Call Ended", "Your session has concluded.");
      // Potentially navigate to dashboard or refresh history
    } else if (notificationData.type === "incoming_call") {
      console.warn(
        "User App received an 'incoming_call' notification. This is unusual."
      );
      // Could be an edge case or misconfiguration, display generic info
      Alert.alert(
        "Notification",
        "You have a new notification regarding a call."
      );
    }
    // Handle other relevant notification types for users
  };

  const checkAuthState = async (fcmToken) => {
    // fcmToken passed as argument
    setIsLoading(true);
    try {
      console.log("User App: Checking authentication state...");
      const storedToken = await AsyncStorage.getItem("token");
      const storedUserType = await AsyncStorage.getItem("userType");

      if (storedToken && storedUserType === "user") {
        console.log("User App: Found stored user credentials.");
        api.defaults.headers.common["Authorization"] = `Bearer ${storedToken}`; // Set token for API

        try {
          const profileResponse = await api.get("/user/profile");
          const userProfile = profileResponse.data.user;

          if (fcmToken && userProfile._id) {
            // Ensure we have user ID before updating FCM
            await api.post("/auth/update-fcm-token", {
              fcmToken,
              userType: "user",
              userId: userProfile._id,
            });
            console.log(
              "User App: FCM token updated for user ID:",
              userProfile._id
            );
          }

          store.dispatch(
            setAuth({
              token: storedToken,
              userType: "user",
              user: {
                id: userProfile._id,
                phoneNumber: userProfile.phoneNumber,
                coinBalance: userProfile.coinBalance,
              },
            })
          );
          setInitialRoute("UserDashboard");
        } catch (error) {
          console.log(
            "User App: Token validation or profile fetch failed",
            error.response?.data || error.message
          );
          await store.dispatch(logout()); // Use logout action
          api.defaults.headers.common["Authorization"] = null;
          setInitialRoute("Login");
        }
      } else {
        console.log(
          "User App: No stored user credentials found or type mismatch."
        );
        if (storedToken || storedUserType) await store.dispatch(logout()); // Clear if any partial/wrong data exists
        api.defaults.headers.common["Authorization"] = null;
        setInitialRoute("Login");
      }
    } catch (error) {
      console.error("User App: Error checking auth state:", error);
      await store.dispatch(logout());
      api.defaults.headers.common["Authorization"] = null;
      setInitialRoute("Login");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4A90E2" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerStyle: { backgroundColor: "#4A90E2" },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "bold" },
        }}
      >
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="OTP"
          component={OTPScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="UserDashboard"
          component={UserDashboard}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Call"
          component={CallScreen}
          options={{ headerShown: false }}
        />
        {/* TherapistLoginScreen is REMOVED from User App navigation stack */}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <AppNavigator />
    </Provider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
});
