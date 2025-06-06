// src/screens/ZegoCallScreen.js
import React, { useEffect, useState, useRef } from "react";
import {
  View,
  StyleSheet,
  Alert,
  AppState,
  StatusBar,
  BackHandler,
  ActivityIndicator,
  Text,
} from "react-native";
import {
  ZegoUIKitPrebuiltCall,
  ONE_ON_ONE_VIDEO_CALL_CONFIG,
  ONE_ON_ONE_VOICE_CALL_CONFIG,
} from "@zegocloud/zego-uikit-prebuilt-call-rn";
import { useSelector } from "react-redux";
import ZegoCloudService from "../services/zegoCloudService";
import { CALL_TYPES, CALL_STATUS, UI_CONFIG } from "../config/zegoConfig";
import api from "../services/api";

export default function ZegoCallScreen({ route, navigation }) {
  const {
    appID,
    appSign,
    userID,
    userName,
    callID,
    callType = CALL_TYPES.VOICE,
    isInitiator = false,
    internalCallId,
    therapistName,
    userId: remoteUserId,
  } = route.params;

  const { user, therapist } = useSelector((state) => state.auth);
  const currentUser = user || therapist;
  const userType = user ? "user" : "therapist";

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [callStarted, setCallStarted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const callStartTimeRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const callEndedRef = useRef(false);

  useEffect(() => {
    console.log("ZegoCallScreen mounted with params:", route.params);

    // Validate configuration
    if (!ZegoCloudService.isConfigured()) {
      setError(ZegoCloudService.getConfigurationError());
      return;
    }

    // Validate call parameters
    if (
      !ZegoCloudService.validateCallParams({
        appID,
        appSign,
        userID,
        userName,
        callID,
      })
    ) {
      setError("Invalid call parameters");
      return;
    }

    setIsLoading(false);

    // Handle hardware back button
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBackPress
    );

    // Handle app state changes
    const appStateSubscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    // Track call start time when component mounts
    callStartTimeRef.current = Date.now();

    return () => {
      backHandler.remove();
      appStateSubscription?.remove();
    };
  }, []);

  const handleBackPress = () => {
    Alert.alert("End Call", "Are you sure you want to end this call?", [
      { text: "Cancel", style: "cancel" },
      { text: "End Call", style: "destructive", onPress: handleCallEnd },
    ]);
    return true;
  };

  const handleAppStateChange = (nextAppState) => {
    console.log("App state changed:", appStateRef.current, "->", nextAppState);
    appStateRef.current = nextAppState;
  };

  const handleCallStart = () => {
    console.log("Call started");
    setCallStarted(true);
    callStartTimeRef.current = Date.now();
  };

  const handleUserJoin = (users) => {
    console.log("User joined call:", users);
    if (!callStarted) {
      handleCallStart();
    }
  };

  const handleUserLeave = (users) => {
    console.log("User left call:", users);
    // If this is a one-on-one call and the other user left, end the call
    if (users.length === 0) {
      handleCallEnd();
    }
  };

  const handleCallEnd = async (
    callID = null,
    reason = "Ended",
    duration = null
  ) => {
    if (callEndedRef.current) {
      console.log("Call already ended, skipping");
      return;
    }

    callEndedRef.current = true;
    console.log("Handling call end:", { callID, reason, duration });

    try {
      // Calculate actual duration if not provided
      let actualDuration = duration;
      if (!actualDuration && callStartTimeRef.current) {
        actualDuration = Math.floor(
          (Date.now() - callStartTimeRef.current) / 1000
        );
      }

      // Only process if call actually started (duration > 0)
      if (actualDuration && actualDuration > 0 && internalCallId) {
        const costData = ZegoCloudService.calculateCallCost(
          actualDuration,
          callType
        );

        // End call on backend
        await api.post(`/call/end/${internalCallId}`, {
          endedBy: userType,
          duration: actualDuration,
          zegoCallId: callID,
          reason: ZegoCloudService.parseCallEndReason(reason),
          ...costData,
        });

        console.log("Call ended on backend:", {
          duration: actualDuration,
          cost: costData,
        });
      }

      // Navigate back with call result
      navigation.goBack();
    } catch (error) {
      console.error("Error ending call:", error);
      // Still navigate back even if backend call fails
      navigation.goBack();
    }
  };

  const handleOnlySelfInRoom = () => {
    console.log("Only self in room - call not answered or other party left");

    // If initiator and no one joined, it's a missed call
    if (isInitiator && !callStarted) {
      handleCallEnd(callID, "Timeout", 0);
    } else {
      handleCallEnd(callID, "Ended", 0);
    }
  };

  const getCallConfig = () => {
    const baseConfig =
      callType === CALL_TYPES.VIDEO
        ? ONE_ON_ONE_VIDEO_CALL_CONFIG
        : ONE_ON_ONE_VOICE_CALL_CONFIG;

    return {
      ...baseConfig,
      ...ZegoCloudService.getCallConfig(callType, isInitiator, {
        onCallEnd: handleCallEnd,
        onOnlySelfInRoom: handleOnlySelfInRoom,
        onUserJoin: handleUserJoin,
        onUserLeave: handleUserLeave,
      }),
      // Customize UI
      bottomMenuBarConfig: {
        hideAutomatically: false,
        hideByClick: true,
        style: {
          backgroundColor: UI_CONFIG.colors.dark,
        },
      },
      topMenuBarConfig: {
        hideAutomatically: true,
        hideByClick: true,
        isVisible: true,
        title: callType === CALL_TYPES.VIDEO ? "Video Call" : "Voice Call",
        style: {
          backgroundColor: "rgba(0, 0, 0, 0.5)",
        },
      },
      // Audio settings
      enableSpeakerWhenJoining: callType === CALL_TYPES.VIDEO,
      // Video settings (only for video calls)
      ...(callType === CALL_TYPES.VIDEO && {
        enableCameraWhenJoining: true,
        useFrontFacingCamera: true,
      }),
    };
  };

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={UI_CONFIG.colors.danger}
        />
        <Text style={styles.errorTitle}>Call Setup Error</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <View style={styles.errorActions}>
          <TouchableOpacity
            style={styles.errorButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.errorButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={UI_CONFIG.colors.dark}
        />
        <ActivityIndicator size="large" color={UI_CONFIG.colors.primary} />
        <Text style={styles.loadingText}>Setting up call...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={UI_CONFIG.colors.dark}
      />

      <ZegoUIKitPrebuiltCall
        appID={parseInt(appID)}
        appSign={appSign}
        userID={userID}
        userName={userName}
        callID={callID}
        config={getCallConfig()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_CONFIG.colors.dark,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: UI_CONFIG.colors.dark,
  },
  loadingText: {
    color: UI_CONFIG.colors.light,
    fontSize: 16,
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: UI_CONFIG.colors.dark,
    padding: 20,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: UI_CONFIG.colors.danger,
    marginBottom: 16,
    textAlign: "center",
  },
  errorMessage: {
    fontSize: 16,
    color: UI_CONFIG.colors.light,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 24,
  },
  errorActions: {
    flexDirection: "row",
    justifyContent: "center",
  },
  errorButton: {
    backgroundColor: UI_CONFIG.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  errorButtonText: {
    color: UI_CONFIG.colors.light,
    fontSize: 16,
    fontWeight: "600",
  },
});
