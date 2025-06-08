// src/screens/OTPScreen.js - Simplified without Firebase
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  StatusBar,
  Animated,
  Dimensions,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { verifyOTP, sendOTP } from "../store/authSlice";
import LinearGradient from "react-native-linear-gradient";

const { width } = Dimensions.get("window");

export default function OTPScreen({ route, navigation }) {
  const { phoneNumber } = route.params;
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [timer, setTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [resending, setResending] = useState(false);
  const otpRefs = useRef([]);
  const shakeAnimation = useRef(new Animated.Value(0)).current;
  const dispatch = useDispatch();
  const { loading } = useSelector((state) => state.auth);

  useEffect(() => {
    // Start countdown timer
    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          setCanResend(true);
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Focus first input
    setTimeout(() => {
      if (otpRefs.current[0]) {
        otpRefs.current[0].focus();
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);

  const handleOtpChange = (value, index) => {
    if (value.length > 1) {
      // Handle paste
      const pastedOtp = value.slice(0, 6).split("");
      const newOtp = [...otp];
      pastedOtp.forEach((digit, i) => {
        if (i < 6) {
          newOtp[i] = digit;
        }
      });
      setOtp(newOtp);

      // Focus last filled input or next empty one
      const lastFilledIndex = Math.min(pastedOtp.length - 1, 5);
      if (otpRefs.current[lastFilledIndex]) {
        otpRefs.current[lastFilledIndex].focus();
      }
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleBackspace = (index) => {
    if (otp[index] === "" && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const shakeInputs = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, {
        toValue: 10,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: -10,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 10,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleVerifyOTP = async () => {
    const otpString = otp.join("");

    if (otpString.length !== 6) {
      Alert.alert("Error", "Please enter complete 6-digit OTP");
      shakeInputs();
      return;
    }

    try {
      await dispatch(
        verifyOTP({
          phoneNumber,
          otp: otpString,
        })
      ).unwrap();
      navigation.reset({
        index: 0,
        routes: [{ name: "UserDashboard" }],
      });
    } catch (error) {
      Alert.alert("Error", "Invalid OTP. Please try again.");
      shakeInputs();
      // Clear OTP on error
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    }
  };

  const handleResendOTP = async () => {
    if (!canResend || resending) return;

    try {
      setResending(true);
      await dispatch(sendOTP(phoneNumber)).unwrap();
      Alert.alert("Success", "OTP sent successfully!");

      // Reset timer
      setTimer(30);
      setCanResend(false);

      // Clear current OTP
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();

      // Restart timer
      const interval = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error) {
      Alert.alert("Error", "Failed to resend OTP. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isOtpComplete = otp.every((digit) => digit !== "");

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />

      <LinearGradient colors={["#667eea", "#764ba2"]} style={styles.gradient}>
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <View style={styles.messageIcon}>
              <Text style={styles.messageEmoji}>💬</Text>
            </View>
          </View>
          <Text style={styles.title}>Verify Your Phone</Text>
          <Text style={styles.subtitle}>We've sent a 6-digit code to</Text>
          <Text style={styles.phoneNumber}>{phoneNumber}</Text>
        </View>

        <View style={styles.otpContainer}>
          <View style={styles.card}>
            <Text style={styles.otpTitle}>Enter Verification Code</Text>

            <Animated.View
              style={[
                styles.otpInputContainer,
                { transform: [{ translateX: shakeAnimation }] },
              ]}
            >
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => (otpRefs.current[index] = ref)}
                  style={[
                    styles.otpInput,
                    digit ? styles.otpInputFilled : {},
                    isOtpComplete && index === 5 ? styles.otpInputComplete : {},
                  ]}
                  value={digit}
                  onChangeText={(value) => handleOtpChange(value, index)}
                  onKeyPress={({ nativeEvent }) => {
                    if (nativeEvent.key === "Backspace") {
                      handleBackspace(index);
                    }
                  }}
                  keyboardType="numeric"
                  maxLength={index === 0 ? 6 : 1}
                  selectTextOnFocus
                  textAlign="center"
                />
              ))}
            </Animated.View>

            <TouchableOpacity
              style={[
                styles.verifyButton,
                !isOtpComplete && styles.verifyButtonDisabled,
              ]}
              onPress={handleVerifyOTP}
              disabled={loading || !isOtpComplete}
            >
              <LinearGradient
                colors={
                  !isOtpComplete ? ["#ccc", "#ccc"] : ["#667eea", "#764ba2"]
                }
                style={styles.verifyButtonGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.verifyButtonText}>
                    ✓ Verify & Continue
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.resendContainer}>
              {!canResend ? (
                <Text style={styles.timerText}>
                  Resend code in {formatTime(timer)}
                </Text>
              ) : (
                <TouchableOpacity
                  style={styles.resendButton}
                  onPress={handleResendOTP}
                  disabled={resending}
                >
                  {resending ? (
                    <ActivityIndicator size="small" color="#667eea" />
                  ) : (
                    <Text style={styles.resendButtonText}>🔄 Resend Code</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.helpText}>
              Didn't receive the code? Check your SMS or try resending
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>← Change Phone Number</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
}

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
  iconContainer: {
    marginBottom: 20,
  },
  messageIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  messageEmoji: {
    fontSize: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.8)",
    textAlign: "center",
    marginBottom: 5,
  },
  phoneNumber: {
    fontSize: 18,
    color: "#fff",
    fontWeight: "600",
    textAlign: "center",
  },
  otpContainer: {
    flex: 0.6,
    paddingHorizontal: 20,
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
  otpTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    marginBottom: 30,
  },
  otpInputContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  otpInput: {
    width: 45,
    height: 55,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e9ecef",
    backgroundColor: "#f8f9fa",
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  otpInputFilled: {
    borderColor: "#667eea",
    backgroundColor: "#fff",
  },
  otpInputComplete: {
    borderColor: "#4CAF50",
    backgroundColor: "#f1f8e9",
  },
  verifyButton: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 25,
  },
  verifyButtonGradient: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  resendContainer: {
    alignItems: "center",
    marginBottom: 20,
    minHeight: 40,
    justifyContent: "center",
  },
  timerText: {
    fontSize: 16,
    color: "#666",
  },
  resendButton: {
    padding: 10,
  },
  resendButtonText: {
    fontSize: 16,
    color: "#667eea",
    fontWeight: "600",
  },
  helpText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: 30,
    paddingBottom: 30,
    alignItems: "center",
  },
  backButton: {
    padding: 15,
  },
  backButtonText: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.8)",
    fontWeight: "500",
  },
});
