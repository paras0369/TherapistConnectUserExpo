// 1. Fixed ZegoCallScreen.js - BackHandler issue
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
import { updateUserBalance, updateTherapistEarnings } from "../store/authSlice";

// Polyfill for deprecated BackHandler.removeEventListener
if (BackHandler && !BackHandler.removeEventListener) {
  BackHandler.removeEventListener = (eventType, listener) => {
    console.warn('BackHandler.removeEventListener is deprecated. Using modern remove() method.');
    // This is a no-op since we can't remove without subscription reference
  };
}

export default function ZegoCallScreen({ route, navigation }) {
  const {
    // New format parameters
    callData,
    userType = "user",
    internalCallId,

    // Legacy format parameters (for backward compatibility)
    roomId,
    callId,
    userId,
    userName,
    isCaller = false,
    zegoCallId,
    callType = CALL_TYPES.VOICE,
    therapistId,
    therapistName,
  } = route.params;

  const { user, therapist } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const currentUser = user || therapist;

  // Component state
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState(null);
  const [callParams, setCallParams] = useState(null);
  const [callStatus, setCallStatus] = useState("connecting");

  // Refs for cleanup
  const cleanupExecutedRef = useRef(false);
  const navigationExecutedRef = useRef(false);
  const backHandlerRef = useRef(null);

  // Initialize call when component mounts
  useEffect(() => {
    initializeCall();

    // Setup app state listener
    const appStateSubscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    // Setup back handler with proper cleanup
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBackPress
    );
    backHandlerRef.current = backHandler;

    return () => {
      // Clean up app state listener
      if (appStateSubscription?.remove) {
        appStateSubscription.remove();
      }

      // Clean up back handler properly
      if (backHandlerRef.current) {
        if (typeof backHandlerRef.current.remove === "function") {
          // New API (React Native 0.65+)
          backHandlerRef.current.remove();
        } else {
          // Old API - but check if the method exists
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
        backHandlerRef.current = null;
      }

      executeCleanup();
    };
  }, []);

  // Handle navigation cleanup
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (!navigationExecutedRef.current) {
          executeCleanup();
        }
      };
    }, [])
  );

  const initializeCall = async () => {
    try {
      console.log("🚀 Initializing ZegoCloud call screen");
      console.log("Route params:", route.params);

      // Initialize ZegoCloud service
      await unifiedZegoService.initialize();

      // Determine call parameters based on the format received
      let finalCallData;
      let finalUserType;
      let finalInternalCallId;

      if (callData) {
        // New format
        finalCallData = callData;
        finalUserType = userType;
        finalInternalCallId = internalCallId;
      } else {
        // Legacy format - convert to new format
        finalCallData = {
          zegoCallId: zegoCallId || roomId,
          callType,
          isInitiator: isCaller,
          targetUserId: therapistId || userId,
          targetUserName: therapistName || userName,
        };
        finalUserType = therapistId ? "therapist" : "user";
        finalInternalCallId = callId;
      }

      // Generate standardized call parameters
      const params = unifiedZegoService.generateCallParams(
        currentUser,
        finalCallData
      );

      // Validate parameters
      unifiedZegoService.validateCallParams(params);

      console.log("Generated call params:", params);
      setCallParams(params);

      // Start call tracking
      unifiedZegoService.startCall({
        ...finalCallData,
        internalCallId: finalInternalCallId,
        userType: finalUserType,
      });

      // Emit call start event via socket
      if (finalInternalCallId) {
        socketService.emit("call-screen-joined", {
          callId: finalInternalCallId,
          userId: currentUser.id,
          userType: finalUserType,
          zegoCallId: params.callID,
        });
      }

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
    console.log("📱 App state changed to:", nextAppState);
  };

  const handleBackPress = () => {
    Alert.alert("End Call", "Are you sure you want to end this call?", [
      { text: "Cancel", style: "cancel" },
      { text: "End Call", style: "destructive", onPress: handleCallEnd },
    ]);
    return true;
  };

  const handleCallStart = () => {
    console.log("📞 Call started (users connected)");
    setCallStatus("active");
    unifiedZegoService.markCallAsStarted();
  };

  const handleUserJoin = (users) => {
    console.log("👥 Users joined call:", users);
    if (!unifiedZegoService.getCurrentCall()?.started && users.length > 0) {
      handleCallStart();
    }
  };

  const handleUserLeave = (users) => {
    console.log("👋 User left call, remaining:", users);
    if (users.length <= 1) {
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
          callParams?.callType || CALL_TYPES.VOICE
        ),
      };

      // Process call end if there's an internal call ID and actual duration
      const finalInternalCallId = internalCallId || callId;
      if (callResult.duration > 0 && finalInternalCallId) {
        await processCallEnd(callResult, finalInternalCallId);
      }

      // Emit call end event
      if (finalInternalCallId) {
        socketService.emit("call-ended", {
          callId: finalInternalCallId,
          userId: currentUser.id,
          userType: userType || (therapist ? "therapist" : "user"),
          duration: callResult.duration,
          reason: callResult.reason,
        });
      }

      executeCleanup();
      navigation.goBack();
    } catch (error) {
      console.error("❌ Error processing call end:", error);
      executeCleanup();
      navigation.goBack();
    }
  };

  const processCallEnd = async (callResult, callId) => {
    try {
      console.log("💰 Processing call end with result:", callResult);

      const response = await api.post(`/call/end/${callId}`, {
        endedBy: userType || (therapist ? "therapist" : "user"),
        duration: callResult.duration,
        reason: callResult.reason,
        ...callResult.cost,
      });

      // Update balance/earnings based on user type
      if (user && response.data.newBalance !== undefined) {
        dispatch(updateUserBalance(response.data.newBalance));
        console.log("💰 User balance updated:", response.data.newBalance);
      } else if (therapist && response.data.newEarnings !== undefined) {
        dispatch(updateTherapistEarnings(response.data.newEarnings));
        console.log(
          "💰 Therapist earnings updated:",
          response.data.newEarnings
        );
      }

      console.log("✅ Call end processed successfully");
    } catch (error) {
      console.error("❌ Failed to process call end:", error);
    }
  };

  const handleCallError = (errorCode, message) => {
    console.error("🚨 Call error:", { errorCode, message });
    setError(`Call error (${errorCode}): ${message}`);

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

    const finalCallType = callParams.callType || callType || CALL_TYPES.VOICE;
    const finalUserType = userType || (therapist ? "therapist" : "user");

    return unifiedZegoService.createCallConfig(finalCallType, finalUserType, {
      onCallEnd: handleCallEnd,
      onUserJoin: handleUserJoin,
      onUserLeave: handleUserLeave,
      onCallStart: handleCallStart,
      onError: handleCallError,
    });
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
            {(callData?.callType || callType) === CALL_TYPES.VIDEO
              ? "📹 Video"
              : "🎤 Voice"}{" "}
            Call
          </Text>
        </LinearGradient>
      </View>
    );
  }

  // Main call UI
  const finalCallType = callParams.callType || callType || CALL_TYPES.VOICE;
  const baseConfig =
    finalCallType === CALL_TYPES.VIDEO
      ? ONE_ON_ONE_VIDEO_CALL_CONFIG
      : ONE_ON_ONE_VOICE_CALL_CONFIG;

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
      </View>

      {/* ZegoCloud UI */}
      <ZegoUIKitPrebuiltCall
        appID={callParams.appID}
        appSign={callParams.appSign}
        userID={callParams.userID}
        userName={callParams.userName}
        callID={callParams.callID}
        config={{
          ...baseConfig,
          ...getCallConfig(),
        }}
      />
    </View>
  );
}

// Styles remain the same...
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
    alignSelf: "flex-start",
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
