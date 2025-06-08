// src/hooks/useCallManager.js
import { useState, useCallback, useRef, useEffect } from "react";
import { Alert, AppState } from "react-native";
import { useSelector, useDispatch } from "react-redux";

import unifiedZegoService from "../services/unifiedZegoService";
import socketService from "../services/socket";
import api from "../services/api";
import { CALL_TYPES, CALL_STATUS, CALL_PRICING } from "../config/zegoConfig";
import { updateUserBalance } from "../store/authSlice";

export const useCallManager = (userType = "user") => {
  const { user, therapist } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const currentUser = user || therapist;

  // Call state
  const [callState, setCallState] = useState({
    status: "idle", // 'idle', 'initiating', 'ringing', 'connecting', 'active', 'ending'
    currentCall: null,
    incomingCall: null,
    error: null,
    networkQuality: "good",
  });

  // Refs for cleanup and state management
  const callTimeoutRef = useRef(null);
  const callStartTimeRef = useRef(null);

  // Initialize service and socket listeners
  useEffect(() => {
    initializeService();
    setupSocketListeners();

    return () => {
      cleanup();
    };
  }, [currentUser]);

  const initializeService = async () => {
    try {
      await unifiedZegoService.initialize();
      console.log("✅ Call manager initialized");
    } catch (error) {
      console.error("❌ Call manager initialization failed:", error);
      setCallState((prev) => ({ ...prev, error: error.message }));
    }
  };

  const setupSocketListeners = () => {
    if (!currentUser) return;

    // Incoming call (for therapists)
    socketService.on("incoming-call", handleIncomingCall);

    // Call responses (for users)
    socketService.on("call-accepted", handleCallAccepted);
    socketService.on("call-rejected", handleCallRejected);
    socketService.on("call-timeout", handleCallTimeout);
    socketService.on("call-cancelled", handleCallCancelled);

    // Call state updates
    socketService.on("call-ended", handleRemoteCallEnd);
    socketService.on("user-busy", handleUserBusy);

    console.log("🔌 Socket listeners setup for call manager");
  };

  // Initiate call (for users)
  const initiateCall = useCallback(
    async (targetUser, callType = CALL_TYPES.VOICE) => {
      if (callState.status !== "idle") {
        console.log("⚠️ Call already in progress");
        return { success: false, error: "Call already in progress" };
      }

      try {
        setCallState((prev) => ({
          ...prev,
          status: "initiating",
          error: null,
        }));

        // Pre-flight checks
        const canProceed = await performPreflightChecks(callType);
        if (!canProceed.success) {
          throw new Error(canProceed.error);
        }

        // Generate call parameters
        const zegoCallId = unifiedZegoService.generateCallId(
          currentUser.id,
          targetUser._id
        );
        const callData = {
          targetUserId: targetUser._id,
          targetUserName: targetUser.name,
          callType,
          zegoCallId,
          initiatedBy: currentUser.id,
          estimatedCost: CALL_PRICING[callType].costPerMinute,
        };

        // Create call on backend
        const response = await api.post("/call/initiate", {
          therapistId: userType === "user" ? targetUser._id : currentUser.id,
          userId: userType === "user" ? currentUser.id : targetUser._id,
          callType,
          zegoCallId,
        });

        const internalCallId = response.data.callId;
        const roomId = response.data.roomId;

        // Update call state
        const fullCallData = {
          ...callData,
          internalCallId,
          roomId,
          status: "ringing",
        };

        setCallState((prev) => ({
          ...prev,
          status: "ringing",
          currentCall: fullCallData,
        }));

        // Emit call request via socket
        socketService.emit("call-therapist", {
          therapistId: targetUser._id,
          userId: currentUser.id,
          userName: currentUser.name || currentUser.phoneNumber,
          roomId,
          callId: internalCallId,
          zegoCallId,
          callType,
        });

        // Set call timeout
        callTimeoutRef.current = setTimeout(() => {
          handleCallTimeout({ reason: "timeout" });
        }, 30000); // 30 second timeout

        return { success: true, callData: fullCallData };
      } catch (error) {
        console.error("❌ Failed to initiate call:", error);
        setCallState((prev) => ({
          ...prev,
          status: "idle",
          error: error.response?.data?.error || error.message,
        }));
        return { success: false, error: error.message };
      }
    },
    [callState.status, currentUser, userType]
  );

  // Accept incoming call (for therapists)
  const acceptCall = useCallback(
    async (incomingCallData) => {
      if (!incomingCallData) {
        console.error("❌ No incoming call data");
        return { success: false, error: "No incoming call data" };
      }

      try {
        setCallState((prev) => ({
          ...prev,
          status: "connecting",
          currentCall: incomingCallData,
          incomingCall: null,
        }));

        // Notify backend via socket
        socketService.emit("call-accepted", {
          callId: incomingCallData.callId,
          therapistId: currentUser.id,
          userId: incomingCallData.userId,
          roomId: incomingCallData.roomId,
        });

        return { success: true, callData: incomingCallData };
      } catch (error) {
        console.error("❌ Failed to accept call:", error);
        setCallState((prev) => ({
          ...prev,
          status: "idle",
          error: error.message,
          incomingCall: null,
        }));
        return { success: false, error: error.message };
      }
    },
    [currentUser]
  );

  // Reject incoming call (for therapists)
  const rejectCall = useCallback(
    async (incomingCallData, reason = "rejected") => {
      if (!incomingCallData) return;

      try {
        // Notify backend via socket
        socketService.emit("call-rejected", {
          callId: incomingCallData.callId,
          therapistId: currentUser.id,
          userId: incomingCallData.userId,
          reason,
        });

        setCallState((prev) => ({
          ...prev,
          status: "idle",
          incomingCall: null,
        }));

        return { success: true };
      } catch (error) {
        console.error("❌ Failed to reject call:", error);
        return { success: false, error: error.message };
      }
    },
    [currentUser]
  );

  // Cancel outgoing call (for users)
  const cancelCall = useCallback(async () => {
    if (!callState.currentCall) return;

    try {
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
      }

      socketService.emit("cancel-call", {
        callId: callState.currentCall.internalCallId,
        userId: currentUser.id,
        therapistId: callState.currentCall.targetUserId,
        roomId: callState.currentCall.roomId,
      });

      setCallState((prev) => ({
        ...prev,
        status: "idle",
        currentCall: null,
      }));

      return { success: true };
    } catch (error) {
      console.error("❌ Failed to cancel call:", error);
      return { success: false, error: error.message };
    }
  }, [callState.currentCall, currentUser]);

  // Navigate to call screen
  const navigateToCall = useCallback(
    (navigation, callData) => {
      if (!navigation || !callData) {
        console.error("❌ Missing navigation or call data");
        return;
      }

      try {
        setCallState((prev) => ({ ...prev, status: "connecting" }));

        navigation.navigate("ModernZegoCallScreen", {
          callData,
          userType,
          internalCallId: callData.internalCallId || callData.callId,
        });
      } catch (error) {
        console.error("❌ Failed to navigate to call screen:", error);
        setCallState((prev) => ({
          ...prev,
          status: "idle",
          error: "Failed to join call",
        }));
      }
    },
    [userType]
  );

  // Pre-flight checks before initiating call
  const performPreflightChecks = async (callType) => {
    try {
      // Check ZegoCloud service
      if (!unifiedZegoService.isReady()) {
        return { success: false, error: "Call service not available" };
      }

      // Check user balance (for users only)
      if (userType === "user") {
        const requiredCoins = CALL_PRICING[callType].costPerMinute;
        if (currentUser.coinBalance < requiredCoins) {
          return {
            success: false,
            error: `Insufficient balance. Need ${requiredCoins} coins for ${callType} call.`,
          };
        }

        // Refresh balance to be sure
        try {
          const response = await api.get("/user/balance");
          if (response.data.coinBalance < requiredCoins) {
            return {
              success: false,
              error: `Insufficient balance. Need ${requiredCoins} coins for ${callType} call.`,
            };
          }
        } catch (balanceError) {
          console.warn("Could not verify balance:", balanceError);
        }
      }

      // Check socket connection
      if (!socketService.isConnected()) {
        return { success: false, error: "Not connected to server" };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // Socket event handlers
  const handleIncomingCall = (callData) => {
    console.log("📞 Incoming call:", callData);

    if (callState.status !== "idle") {
      // Already in a call, reject automatically
      rejectCall(callData, "busy");
      return;
    }

    setCallState((prev) => ({
      ...prev,
      status: "ringing",
      incomingCall: {
        ...callData,
        estimatedEarnings:
          CALL_PRICING[callData.callType].therapistEarningsPerMinute,
      },
    }));
  };

  const handleCallAccepted = (data) => {
    console.log("✅ Call accepted:", data);

    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }

    setCallState((prev) => ({
      ...prev,
      status: "connecting",
      currentCall: prev.currentCall
        ? { ...prev.currentCall, accepted: true }
        : null,
    }));
  };

  const handleCallRejected = (data) => {
    console.log("❌ Call rejected:", data);

    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }

    setCallState((prev) => ({
      ...prev,
      status: "idle",
      currentCall: null,
      error: "Therapist is not available right now",
    }));

    Alert.alert(
      "Call Rejected",
      "The therapist is not available right now. Please try again later."
    );
  };

  const handleCallTimeout = (data) => {
    console.log("⏰ Call timeout:", data);

    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }

    setCallState((prev) => ({
      ...prev,
      status: "idle",
      currentCall: null,
      error: "Call timeout",
    }));

    Alert.alert(
      "Call Timeout",
      "The therapist didn't respond in time. Please try again later."
    );
  };

  const handleCallCancelled = (data) => {
    console.log("🚫 Call cancelled:", data);

    setCallState((prev) => ({
      ...prev,
      status: "idle",
      currentCall: null,
      incomingCall: null,
    }));
  };

  const handleRemoteCallEnd = (data) => {
    console.log("🏁 Remote call end:", data);

    setCallState((prev) => ({
      ...prev,
      status: "idle",
      currentCall: null,
      incomingCall: null,
    }));

    // Update balance if needed
    if (userType === "user" && data.newBalance !== undefined) {
      dispatch(updateUserBalance(data.newBalance));
    }
  };

  const handleUserBusy = (data) => {
    console.log("📵 User busy:", data);

    setCallState((prev) => ({
      ...prev,
      status: "idle",
      currentCall: null,
      error: "User is busy",
    }));

    Alert.alert(
      "User Busy",
      "The person you're trying to call is currently busy."
    );
  };

  // Cleanup function
  const cleanup = () => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }

    // Remove socket listeners
    socketService.off("incoming-call", handleIncomingCall);
    socketService.off("call-accepted", handleCallAccepted);
    socketService.off("call-rejected", handleCallRejected);
    socketService.off("call-timeout", handleCallTimeout);
    socketService.off("call-cancelled", handleCallCancelled);
    socketService.off("call-ended", handleRemoteCallEnd);
    socketService.off("user-busy", handleUserBusy);

    console.log("🧹 Call manager cleanup completed");
  };

  // Clear error
  const clearError = useCallback(() => {
    setCallState((prev) => ({ ...prev, error: null }));
  }, []);

  // Check if can make call
  const canMakeCall = useCallback(
    (callType = CALL_TYPES.VOICE) => {
      if (callState.status !== "idle") {
        return { canCall: false, reason: "Already in a call" };
      }

      if (!unifiedZegoService.isReady()) {
        return { canCall: false, reason: "Call service not available" };
      }

      if (userType === "user") {
        const requiredCoins = CALL_PRICING[callType].costPerMinute;
        if (currentUser.coinBalance < requiredCoins) {
          return { canCall: false, reason: "Insufficient balance" };
        }
      }

      if (!socketService.isConnected()) {
        return { canCall: false, reason: "Not connected to server" };
      }

      return { canCall: true };
    },
    [callState.status, currentUser, userType]
  );

  return {
    // State
    callState,

    // Actions
    initiateCall,
    acceptCall,
    rejectCall,
    cancelCall,
    navigateToCall,
    clearError,

    // Utilities
    canMakeCall,
    performPreflightChecks,
    cleanup,
  };
};
