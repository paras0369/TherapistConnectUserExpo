// src/services/unifiedZegoService.js
import { Alert } from "react-native";
import {
  ZEGO_APP_ID,
  ZEGO_APP_SIGN,
  CALL_TYPES,
  CALL_STATUS,
  CALL_PRICING,
  validateZegoConfig,
} from "../config/zegoConfig";

class UnifiedZegoService {
  constructor() {
    this.isInitialized = false;
    this.currentCall = null;
    this.callListeners = new Map();
    this.eventEmitter = null;
  }

  // Initialize service with validation
  async initialize() {
    try {
      const validation = validateZegoConfig();
      if (!validation.isValid) {
        throw new Error(
          `ZegoCloud configuration invalid: ${validation.errors.join(", ")}`
        );
      }

      this.isInitialized = true;
      console.log("✅ UnifiedZegoService initialized successfully");
      return true;
    } catch (error) {
      console.error("❌ ZegoService initialization failed:", error);
      throw error;
    }
  }

  // Generate standardized call parameters
  generateCallParams(userInfo, callData = {}) {
    if (!this.isInitialized) {
      throw new Error("ZegoService not initialized");
    }

    const userType =
      userInfo.userType || (userInfo.phoneNumber ? "user" : "therapist");
    const userId = userInfo.id || userInfo._id;
    const userName = userInfo.name || userInfo.phoneNumber || "Unknown";

    return {
      appID: parseInt(ZEGO_APP_ID, 10),
      appSign: String(ZEGO_APP_SIGN),
      userID: `${userType}_${userId}`,
      userName: String(userName),
      callID:
        callData.zegoCallId || callData.callId || this.generateCallId(userId),
      callType: callData.callType || CALL_TYPES.VOICE,
      isInitiator: Boolean(callData.isInitiator),
    };
  }

  // Generate unique call ID (legacy method name for compatibility)
  generateCallID(userId, targetId = null) {
    return this.generateCallId(userId, targetId);
  }

  // Generate unique call ID
  generateCallId(userId, targetId = null) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const target = targetId ? `_${targetId}` : "";
    return `call_${userId}${target}_${timestamp}_${random}`;
  }

  // Validate call parameters before use
  validateCallParams(params) {
    const required = ["appID", "appSign", "userID", "userName", "callID"];
    const missing = required.filter((key) => !params[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required parameters: ${missing.join(", ")}`);
    }

    // Validate format
    const validFormat = /^[a-zA-Z0-9_]+$/;
    if (!validFormat.test(params.userID) || !validFormat.test(params.callID)) {
      throw new Error(
        "Invalid userID or callID format. Only letters, numbers, and underscores allowed."
      );
    }

    return true;
  }

  // Create optimized call configuration
  createCallConfig(callType, userType, callbacks = {}) {
    const {
      onCallEnd = () => {},
      onUserJoin = () => {},
      onUserLeave = () => {},
      onCallStart = () => {},
      onError = () => {},
    } = callbacks;

    const baseConfig = {
      // Core event handlers
      onCallEnd: (callID, reason, duration) => {
        console.log("📞 Call ended:", { callID, reason, duration });
        this.handleCallEnd(callID, reason, duration);
        onCallEnd(callID, reason, duration);
      },

      onUserJoin: (users) => {
        console.log("👥 User joined:", users);
        if (!this.currentCall?.started) {
          this.markCallAsStarted();
          onCallStart();
        }
        onUserJoin(users);
      },

      onUserLeave: (users) => {
        console.log("👋 User left:", users);
        onUserLeave(users);

        // Auto-end call if no other users (for 1:1 calls)
        if (users.length === 0) {
          setTimeout(
            () =>
              onCallEnd(
                this.currentCall?.callID,
                "UserLeft",
                this.getCallDuration()
              ),
            1000
          );
        }
      },

      onError: (errorCode, message) => {
        console.error("🚨 ZegoCloud error:", { errorCode, message });
        this.handleCallError(errorCode, message);
        onError(errorCode, message);
      },

      // UI Configuration
      showCallDuration: true,
      showSwitchCameraButton: callType === CALL_TYPES.VIDEO,
      showHangUpButton: true,
      showMicrophoneButton: true,
      showSpeakerButton: true,

      // Audio settings
      enableSpeakerWhenJoining: callType === CALL_TYPES.VIDEO,
      turnOnMicrophoneWhenJoining: true,

      // Video settings
      ...(callType === CALL_TYPES.VIDEO && {
        turnOnCameraWhenJoining: true,
        useFrontFacingCamera: true,
        enableCameraWhenJoining: true,
        videoViewMode: 1, // Aspect fit
      }),

      // Quality and performance
      enableHardwareDecoder: true,
      enableHardwareEncoder: true,

      // Network optimization
      enableAEC: true, // Echo cancellation
      enableAGC: true, // Auto gain control
      enableANS: true, // Noise suppression
    };

    // Role-specific configurations
    if (userType === "therapist") {
      return {
        ...baseConfig,
        // Therapist can control more call aspects
        showSwitchCameraButton: callType === CALL_TYPES.VIDEO,
        enableCallInvitation: false, // Therapists join, don't invite
      };
    } else {
      return {
        ...baseConfig,
        // User (patient) configuration
        enableCallInvitation: true, // Users can invite therapists
      };
    }
  }

  // Start a new call session
  startCall(callData) {
    this.currentCall = {
      ...callData,
      startTime: Date.now(),
      started: false,
      participants: [],
    };

    console.log("🎬 Starting call session:", this.currentCall);
  }

  // Mark call as actually started (when participants join)
  markCallAsStarted() {
    if (this.currentCall && !this.currentCall.started) {
      this.currentCall.started = true;
      this.currentCall.actualStartTime = Date.now();
      console.log("✅ Call marked as started");
    }
  }

  // Get call duration in seconds
  getCallDuration() {
    if (!this.currentCall?.actualStartTime) return 0;
    return Math.floor((Date.now() - this.currentCall.actualStartTime) / 1000);
  }

  // Handle call end cleanup
  handleCallEnd(callID, reason, duration) {
    if (this.currentCall) {
      const actualDuration = duration || this.getCallDuration();
      console.log("🏁 Cleaning up call:", { callID, reason, actualDuration });

      // Store call result for potential API calls
      this.lastCallResult = {
        callID,
        reason: this.parseCallEndReason(reason),
        duration: actualDuration,
        cost: this.calculateCallCost(actualDuration, this.currentCall.callType),
      };

      this.currentCall = null;
    }
  }

  // Handle call errors
  handleCallError(errorCode, message) {
    const errorMap = {
      1000001: "Network connection failed",
      1000002: "Invalid app credentials",
      1000003: "Room connection failed",
      1000004: "Audio/Video permission denied",
      1000005: "Call timeout",
    };

    const userMessage = errorMap[errorCode] || `Call error: ${message}`;

    Alert.alert("Call Error", userMessage, [
      { text: "OK", onPress: () => this.handleCallEnd(null, "Error", 0) },
    ]);
  }

  // Parse ZegoCloud call end reasons to our app's status
  parseCallEndReason(reason) {
    const reasonMap = {
      Declined: CALL_STATUS.REJECTED,
      Timeout: CALL_STATUS.MISSED,
      Cancelled: CALL_STATUS.CANCELLED,
      Ended: CALL_STATUS.ENDED_BY_USER,
      UserLeft: CALL_STATUS.ENDED_BY_USER,
      Error: CALL_STATUS.CANCELLED,
      Busy: CALL_STATUS.BUSY,
      Offline: CALL_STATUS.OFFLINE,
    };

    return reasonMap[reason] || CALL_STATUS.CANCELLED;
  }

  // Calculate call cost
  calculateCallCost(durationSeconds, callType) {
    const durationMinutes = Math.max(1, Math.ceil(durationSeconds / 60));
    const pricing = CALL_PRICING[callType] || CALL_PRICING[CALL_TYPES.VOICE];

    return {
      durationMinutes,
      costInCoins: durationMinutes * pricing.costPerMinute,
      therapistEarningsCoins: Math.floor(
        durationMinutes * pricing.therapistEarningsPerMinute
      ),
    };
  }

  // Get last call result for API reporting
  getLastCallResult() {
    return this.lastCallResult;
  }

  // Check if service is ready
  isReady() {
    return this.isInitialized && validateZegoConfig().isValid;
  }

  // Legacy method for backward compatibility with existing therapist code
  async joinRoom(
    roomId,
    userId,
    userName,
    isTherapist = true,
    callType = "voice"
  ) {
    console.log("🏠 [Legacy] Joining ZegoCloud room:", {
      roomId,
      userId,
      userName,
      isTherapist,
      callType,
    });

    if (!this.isInitialized) {
      await this.initialize();
    }

    // Validate required parameters
    if (!roomId || !userId || !userName) {
      throw new Error(
        "Missing required parameters: roomId, userId, or userName"
      );
    }

    // Store current room info
    this.currentCall = {
      roomId,
      userId,
      userName,
      callType,
      isTherapist,
      joinedAt: new Date().toISOString(),
      startTime: Date.now(),
      started: false,
    };

    console.log("✅ Room joined successfully:", this.currentCall);
    return this.currentCall;
  }

  // Get current call info
  getCurrentCall() {
    return this.currentCall;
  }

  // Cleanup service
  cleanup() {
    this.currentCall = null;
    this.lastCallResult = null;
    this.callListeners.clear();
    console.log("🧹 ZegoService cleaned up");
  }

  // Get app credentials (legacy method for compatibility)
  getAppCredentials() {
    return {
      appID: parseInt(ZEGO_APP_ID, 10),
      appSign: String(ZEGO_APP_SIGN),
    };
  }

  // Generate ZegoCloud compatible user ID (legacy method for compatibility)
  generateUserID(user) {
    if (!user) return null;

    const userType = user.userType || (user.phoneNumber ? "user" : "therapist");
    const userId = user.id || user._id;

    return `${userType}_${userId}`;
  }

  // Check network quality (if supported)
  checkNetworkQuality() {
    // This would integrate with ZegoCloud's network quality API
    // Return quality indicator: 'excellent', 'good', 'fair', 'poor'
    return "good";
  }
}

// Export singleton instance
const unifiedZegoService = new UnifiedZegoService();
export default unifiedZegoService;
