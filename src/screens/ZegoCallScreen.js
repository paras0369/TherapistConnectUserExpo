// src/screens/ModernZegoCallScreen.js
import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  Alert,
  AppState,
  StatusBar,
  BackHandler,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Platform,
} from "react-native";
import {
  ZegoUIKitPrebuiltCall,
  ONE_ON_ONE_VIDEO_CALL_CONFIG,
  ONE_ON_ONE_VOICE_CALL_CONFIG,
} from "@zegocloud/zego-uikit-prebuilt-call-rn";
import { useSelector, useDispatch } from "react-redux";
import { useFocusEffect } from "@react-navigation/native";
import LinearGradient from "react-native-linear-gradient";

import unifiedZegoService from "../services/unifiedZegoService";
import { CALL_TYPES, UI_CONFIG } from "../config/zegoConfig";
import api from "../services/api";
import socketService from "../services/socket";
import { updateUserBalance } from "../store/authSlice";

export default function ModernZegoCallScreen({ route, navigation }) {
  const {
    callData,
    userType = "user", // 'user' or 'therapist'
    internalCallId,
  } = route.params;

  const { user, therapist } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const currentUser = user || therapist;

  // Component state
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState(null);
  const [callParams, setCallParams] = useState(null);
  const [networkQuality, setNetworkQuality] = useState("good");
  const [callStatus, setCallStatus] = useState("connecting");

  // Refs for cleanup and state management
  const appStateRef = useRef(AppState.currentState);
  const cleanupExecutedRef = useRef(false);
  const navigationExecutedRef = useRef(false);

  // Initialize call when component mounts
  useEffect(() => {
    initializeCall();

    // Setup app state and back handler
    const appStateSubscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBackPress
    );

    return () => {
      if (backHandler) {
        // Handle different BackHandler API versions
        if (typeof backHandler.remove === "function") {
          // New API (React Native 0.65+)
          backHandler.remove();
        } else {
          // Old API - just don't call removeEventListener if it doesn't exist
          try {
            if (BackHandler.removeEventListener) {
              BackHandler.removeEventListener(
                "hardwareBackPress",
                handleBackPress
              );
            }
          } catch (error) {
            console.warn("BackHandler cleanup failed:", error);
          }
        }
      }
    };
  }, []);

  // Handle navigation cleanup
  useFocusEffect(
    useCallback(() => {
      return () => {
        // Screen is being unfocused/unmounted
        if (!navigationExecutedRef.current) {
          executeCleanup();
        }
      };
    }, [])
  );

  const initializeCall = async () => {
    try {
      console.log("🚀 Initializing modern call screen");

      // Initialize ZegoCloud service
      await unifiedZegoService.initialize();

      // Generate standardized call parameters
      const params = unifiedZegoService.generateCallParams(
        currentUser,
        callData
      );
      unifiedZegoService.validateCallParams(params);

      setCallParams(params);

      // Start call tracking
      unifiedZegoService.startCall({
        ...callData,
        internalCallId,
        userType,
        participants: [currentUser],
      });

      // Emit call start event via socket
      socketService.emit("call-screen-joined", {
        callId: internalCallId,
        userId: currentUser.id,
        userType,
        zegoCallId: params.callID,
      });

      setIsInitializing(false);
      setCallStatus("ready");

      console.log("✅ Call initialization complete");
    } catch (error) {
      console.error("❌ Call initialization failed:", error);
      setError(error.message);
      setIsInitializing(false);
    }
  };

  const handleAppStateChange = (nextAppState) => {
    console.log(
      "📱 App state changed:",
      appStateRef.current,
      "->",
      nextAppState
    );
    appStateRef.current = nextAppState;

    if (nextAppState === "background") {
      // Handle background state - could pause video, etc.
      console.log("🎬 App went to background during call");
    } else if (nextAppState === "active") {
      // Handle return to foreground
      console.log("🎬 App returned to foreground during call");
    }
  };

  const handleBackPress = () => {
    Alert.alert("End Call", "Are you sure you want to end this call?", [
      { text: "Cancel", style: "cancel" },
      { text: "End Call", style: "destructive", onPress: handleCallEnd },
    ]);
    return true;
  };

  const handleCallStart = () => {
    console.log("📞 Call actually started (users connected)");
    setCallStatus("active");
    unifiedZegoService.markCallAsStarted();
  };

  const handleUserJoin = (users) => {
    console.log("👥 Users in call:", users);
    if (!unifiedZegoService.getCurrentCall()?.started) {
      handleCallStart();
    }
  };

  const handleUserLeave = (users) => {
    console.log("👋 User left, remaining:", users);
    if (users.length === 0) {
      // Last person left, end call
      setTimeout(() => handleCallEnd("UserLeft"), 1000);
    }
  };

  const handleCallEnd = async (reason = "Ended", duration = null) => {
    if (navigationExecutedRef.current) {
      console.log("🛑 Call end already processed");
      return;
    }

    navigationExecutedRef.current = true;
    console.log("🏁 Handling call end:", { reason, duration });

    try {
      setCallStatus("ending");

      // Get call result from service
      const callResult = unifiedZegoService.getLastCallResult() || {
        reason: unifiedZegoService.parseCallEndReason(reason),
        duration: duration || unifiedZegoService.getCallDuration(),
        cost: unifiedZegoService.calculateCallCost(
          duration || unifiedZegoService.getCallDuration(),
          callData?.callType || CALL_TYPES.VOICE
        ),
      };

      // Only process cost if call actually happened (duration > 0)
      if (callResult.duration > 0 && internalCallId) {
        await processCallEnd(callResult);
      }

      // Emit call end event
      socketService.emit("call-ended", {
        callId: internalCallId,
        userId: currentUser.id,
        userType,
        duration: callResult.duration,
        reason: callResult.reason,
      });

      executeCleanup();

      // Navigate back with result
      navigation.goBack();
    } catch (error) {
      console.error("❌ Error processing call end:", error);
      // Still navigate back even if processing fails
      executeCleanup();
      navigation.goBack();
    }
  };

  const processCallEnd = async (callResult) => {
    try {
      console.log("💰 Processing call end with cost:", callResult);

      const response = await api.post(`/call/end/${internalCallId}`, {
        endedBy: userType,
        duration: callResult.duration,
        reason: callResult.reason,
        ...callResult.cost,
      });

      // Update user balance if user (not therapist)
      if (userType === "user" && response.data.newBalance !== undefined) {
        dispatch(updateUserBalance(response.data.newBalance));
        console.log("💰 User balance updated:", response.data.newBalance);
      }

      console.log("✅ Call end processed successfully");
    } catch (error) {
      console.error("❌ Failed to process call end:", error);
      // Don't throw - we still want to end the call UI
    }
  };

  const handleCallError = (errorCode, message) => {
    console.error("🚨 Call error:", { errorCode, message });
    setError(`Call error (${errorCode}): ${message}`);

    // Auto-end call after error
    setTimeout(() => {
      handleCallEnd("Error", 0);
    }, 2000);
  };

  const executeCleanup = () => {
    if (cleanupExecutedRef.current) return;

    cleanupExecutedRef.current = true;
    console.log("🧹 Executing call cleanup");

    try {
      unifiedZegoService.cleanup();
    } catch (error) {
      console.error("Error during cleanup:", error);
    }
  };

  const getCallConfig = () => {
    if (!callParams) return null;

    return unifiedZegoService.createCallConfig(
      callData?.callType || CALL_TYPES.VOICE,
      userType,
      {
        onCallEnd: handleCallEnd,
        onUserJoin: handleUserJoin,
        onUserLeave: handleUserLeave,
        onCallStart: handleCallStart,
        onError: handleCallError,
      }
    );
  };

  // Error UI
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={UI_CONFIG.colors.danger}
        />
        <LinearGradient
          colors={[UI_CONFIG.colors.danger, "#c62828"]}
          style={styles.errorGradient}
        >
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Call Error</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity
            style={styles.errorButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.errorButtonText}>Go Back</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    );
  }

  // Loading UI
  if (isInitializing || !callParams) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={UI_CONFIG.colors.primary}
        />
        <LinearGradient
          colors={[UI_CONFIG.colors.primary, UI_CONFIG.colors.secondary]}
          style={styles.loadingGradient}
        >
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingTitle}>Setting up call...</Text>
          <Text style={styles.loadingSubtitle}>
            {callData?.callType === CALL_TYPES.VIDEO ? "📹 Video" : "🎤 Voice"}{" "}
            Call
          </Text>

          {/* Network quality indicator */}
          <View style={styles.networkIndicator}>
            <Text style={styles.networkText}>Network: {networkQuality}</Text>
            <View
              style={[
                styles.networkDot,
                {
                  backgroundColor:
                    networkQuality === "good" ? "#4CAF50" : "#ff9800",
                },
              ]}
            />
          </View>
        </LinearGradient>
      </View>
    );
  }

  // Main call UI
  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={UI_CONFIG.colors.dark}
      />

      {/* Status indicator */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          {callStatus === "active" ? "🔴 Live" : "🟡 Connecting..."}
        </Text>
        <View style={styles.networkIndicator}>
          <Text style={styles.networkText}>{networkQuality}</Text>
        </View>
      </View>

      {/* ZegoCloud UI */}
      <ZegoUIKitPrebuiltCall
        appID={callParams.appID}
        appSign={callParams.appSign}
        userID={callParams.userID}
        userName={callParams.userName}
        callID={callParams.callID}
        config={{
          // Merge base config with our enhanced config
          ...(callData?.callType === CALL_TYPES.VIDEO
            ? ONE_ON_ONE_VIDEO_CALL_CONFIG
            : ONE_ON_ONE_VOICE_CALL_CONFIG),
          ...getCallConfig(),
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_CONFIG.colors.dark,
  },
  statusBar: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : StatusBar.currentHeight + 10,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 1000,
  },
  statusText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  networkIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  networkText: {
    color: "#fff",
    fontSize: 12,
    marginRight: 6,
  },
  networkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  loadingContainer: {
    flex: 1,
  },
  loadingGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
    marginTop: 20,
    textAlign: "center",
  },
  loadingSubtitle: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 16,
    marginTop: 10,
    textAlign: "center",
  },
  errorContainer: {
    flex: 1,
  },
  errorGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 16,
    textAlign: "center",
  },
  errorMessage: {
    fontSize: 16,
    color: "#fff",
    textAlign: "center",
    marginBottom: 30,
    lineHeight: 24,
    opacity: 0.9,
  },
  errorButton: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  errorButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
