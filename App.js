// App.js - Simplified without Firebase
import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { Provider } from "react-redux";
import { store } from "./src/store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { setAuth, logout } from "./src/store/authSlice";
import api from "./src/services/api";

// Import screens based on app type
// For User App:
import LoginScreen from "./src/screens/LoginScreen";
import OTPScreen from "./src/screens/OTPScreen";
import UserDashboard from "./src/screens/UserDashboard";
import ZegoCallScreen from "./src/screens/ZegoCallScreen";

// For Therapist App:
// import TherapistLoginScreen from "./src/screens/TherapistLoginScreen";
// import TherapistDashboard from "./src/screens/TherapistDashboard";
// import ZegoCallScreen from "./src/screens/ZegoCallScreen";

const Stack = createStackNavigator();

function AppNavigator() {
  const [isLoading, setIsLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState("Login");

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    setIsLoading(true);
    try {
      const storedToken = await AsyncStorage.getItem("token");
      const storedUserType = await AsyncStorage.getItem("userType");

      if (storedToken && storedUserType === "user") {
        api.defaults.headers.common["Authorization"] = `Bearer ${storedToken}`;

        try {
          const profileResponse = await api.get("/user/profile");
          const userProfile = profileResponse.data.user;

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
          await store.dispatch(logout());
          api.defaults.headers.common["Authorization"] = null;
          setInitialRoute("Login");
        }
      } else {
        await store.dispatch(logout());
        api.defaults.headers.common["Authorization"] = null;
        setInitialRoute("Login");
      }
    } catch (error) {
      console.error("Error checking auth state:", error);
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
          name="ZegoCallScreen"
          component={ZegoCallScreen}
          options={{ headerShown: false }}
        />
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
