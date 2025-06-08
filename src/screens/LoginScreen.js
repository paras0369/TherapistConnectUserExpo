// src/screens/LoginScreen.js (FOR USER APP - Therapist Button Removed)
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Dimensions,
  StatusBar,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { sendOTP } from "../store/authSlice"; // Assuming path is correct for Expo structure
// Assuming path is correct
import LinearGradient from "react-native-linear-gradient";

const { width, height } = Dimensions.get("window");

export default function LoginScreen({ navigation }) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [fcmToken, setFcmToken] = useState(null);
  const dispatch = useDispatch();
  const { loading } = useSelector((state) => state.auth);

  useEffect(() => {
    initializeFirebase();
  }, []);

  const handleSendOTP = async () => {
    if (!phoneNumber || phoneNumber.length < 10) {
      Alert.alert("Error", "Please enter a valid phone number");
      return;
    }
    if (!fcmToken) {
      Alert.alert(
        "Setup Incomplete",
        "FCM token not yet available. Please wait a moment and try again."
      );
      // Optionally, try to fetch it again
      // await initializeFirebase();
      return;
    }

    try {
      // In the User app, fcmToken is passed to OTP screen, then with verifyOTP
      await dispatch(sendOTP(phoneNumber)).unwrap();
      navigation.navigate("OTP", { phoneNumber, fcmToken });
    } catch (error) {
      Alert.alert("Error", "Failed to send OTP. Please try again.");
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />
      <LinearGradient colors={["#667eea", "#764ba2"]} style={styles.gradient}>
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <View style={styles.logo}>
              <Text style={styles.logoIcon}>🧠</Text>
            </View>
            <Text style={styles.title}>TherapyConnect</Text>
            <Text style={styles.subtitle}>
              Your mental wellness journey starts here
            </Text>
          </View>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.card}>
            <Text style={styles.formTitle}>Welcome Back</Text>
            <Text style={styles.formSubtitle}>
              Enter your phone number to continue
            </Text>

            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <Text style={styles.countryCode}>+91</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter phone number"
                  placeholderTextColor="#999"
                  keyboardType="phone-pad"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  maxLength={10}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSendOTP}
              disabled={loading}
            >
              <LinearGradient
                colors={loading ? ["#ccc", "#ccc"] : ["#667eea", "#764ba2"]}
                style={styles.buttonGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Send OTP</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* REMOVED THERAPIST LOGIN BUTTON AND DIVIDER */}
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            By continuing, you agree to our Terms & Privacy Policy
          </Text>
        </View>
      </LinearGradient>
    </View>
  );
}

// Styles (copied from your provided LoginScreen.js, remove styles for therapist button if any)
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  header: {
    flex: 0.4,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },
  logoContainer: {
    alignItems: "center",
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  logoIcon: {
    fontSize: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.8)",
    textAlign: "center",
    lineHeight: 22,
  },
  formContainer: {
    flex: 0.6,
    paddingHorizontal: 20,
    justifyContent: "center", // Center the card vertically if less content
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 30,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 15,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    marginBottom: 8,
  },
  formSubtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 30,
  },
  inputContainer: {
    marginBottom: 25,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    paddingHorizontal: 15,
    height: 55,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  countryCode: {
    fontSize: 16,
    color: "#333",
    marginRight: 10,
    fontWeight: "500",
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#333",
    height: "100%",
  },
  button: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 20, // Adjust as needed after removing other buttons
  },
  buttonGradient: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  // Removed divider and therapistButton styles
  footer: {
    paddingHorizontal: 30,
    paddingBottom: 30,
    alignItems: "center",
    position: "absolute", // Keep footer at bottom
    bottom: 0,
    left: 0,
    right: 0,
  },
  footerText: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "center",
    lineHeight: 18,
  },
});
