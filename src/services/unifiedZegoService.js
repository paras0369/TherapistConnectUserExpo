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
    this.lastCallResult = null;
  }

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

  // Generate call parameters for ZegoCloud
  generateCallParams(userInfo, callData = {}) {
    if (!this.isInitialized) {
      throw new Error("ZegoService not initialized");
    }

    const userType =
      userInfo.userType || (userInfo.phoneNumber ? "user" : "therapist");
    const userId = userInfo.id || userInfo._id;
    const userName = userInfo.name || userInfo.phoneNumber || "Unknown";

    // Generate clean user ID for ZegoCloud
    const cleanUserId = `${userType}_${userId}`.replace(/[^a-zA-Z0-9_]/g, "");

    // Generate call ID if not provided
    const callId =
      callData.zegoCallId ||
      callData.callId ||
      this.generateCallId(userId, callData.targetUserId);

    return {
      appID: ZEGO_APP_ID,
      appSign: ZEGO_APP_SIGN,
      userID: cleanUserId,
      userName: String(userName),
      callID: callId,
      callType: callData.callType || CALL_TYPES.VOICE,
      isInitiator: Boolean(callData.isInitiator),
    };
  }

  generateCallId(userId, targetId = null) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const target = targetId ? `_${targetId}` : "";
    return `call_${userId}${target}_${timestamp}_${random}`.replace(
      /[^a-zA-Z0-9_]/g,
      ""
    );
  }

  validateCallParams(params) {
    const required = ["appID", "appSign", "userID", "userName", "callID"];
    const missing = required.filter((key) => !params[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required parameters: ${missing.join(", ")}`);
    }

    // Validate format for ZegoCloud compatibility
    const validFormat = /^[a-zA-Z0-9_]+$/;
    if (!validFormat.test(params.userID)) {
      throw new Error(
        "Invalid userID format. Only letters, numbers, and underscores allowed."
      );
    }
    if (!validFormat.test(params.callID)) {
      throw new Error(
        "Invalid callID format. Only letters, numbers, and underscores allowed."
      );
    }

    return true;
  }

  createCallConfig(callType, userType, callbacks = {}) {
    const {
      onCallEnd = () => {},
      onUserJoin = () => {},
      onUserLeave = () => {},
      onCallStart = () => {},
      onError = () => {},
    } = callbacks;

    const baseConfig = {
      // Event handlers
      onCallEnd: (callID, reason, duration) => {
        console.log("📞 ZegoCloud call ended:", { callID, reason, duration });
        this.handleCallEnd(callID, reason, duration);
        onCallEnd(reason, duration);
      },

      onUserJoin: (users) => {
        console.log("👥 User joined call:", users);
        if (!this.currentCall?.started && users.length > 0) {
          this.markCallAsStarted();
          onCallStart();
        }
        onUserJoin(users);
      },

      onUserLeave: (users) => {
        console.log("👋 User left call:", users);
        onUserLeave(users);

        // End call if no other users
        if (users.length <= 1) {
          setTimeout(() => {
            onCallEnd("UserLeft", this.getCallDuration());
          }, 1000);
        }
      },

      onError: (errorCode, message) => {
        console.error("🚨 ZegoCloud error:", { errorCode, message });
        this.handleCallError(errorCode, message);
        onError(errorCode, message);
      },

      // UI Configuration
      showCallDuration: true,
      showHangUpButton: true,
      showMicrophoneButton: true,
      showSpeakerButton: true,
      showSwitchCameraButton: callType === CALL_TYPES.VIDEO,

      // Audio settings
      enableSpeakerWhenJoining: callType === CALL_TYPES.VIDEO,
      turnOnMicrophoneWhenJoining: true,

      // Video settings (only for video calls)
      ...(callType === CALL_TYPES.VIDEO && {
        turnOnCameraWhenJoining: true,
        useFrontFacingCamera: true,
        enableCameraWhenJoining: true,
      }),

      // Layout and UI
      layout: {
        mode: "pictureInPicture",
        isSmallViewDraggable: true,
        switchLargeOrSmallViewByClick: true,
      },

      // Call invitation (for initiators)
      enableCallInvitation: userType === "user",
    };

    return baseConfig;
  }

  startCall(callData) {
    this.currentCall = {
      ...callData,
      startTime: Date.now(),
      started: false,
    };
    console.log("🎬 Starting call session:", this.currentCall);
  }

  markCallAsStarted() {
    if (this.currentCall && !this.currentCall.started) {
      this.currentCall.started = true;
      this.currentCall.actualStartTime = Date.now();
      console.log("✅ Call marked as started");
    }
  }

  getCallDuration() {
    if (!this.currentCall?.actualStartTime) return 0;
    return Math.floor((Date.now() - this.currentCall.actualStartTime) / 1000);
  }

  handleCallEnd(callID, reason, duration) {
    if (this.currentCall) {
      const actualDuration = duration || this.getCallDuration();
      console.log("🏁 Handling call end:", { callID, reason, actualDuration });

      this.lastCallResult = {
        callID,
        reason: this.parseCallEndReason(reason),
        duration: actualDuration,
        cost: this.calculateCallCost(actualDuration, this.currentCall.callType),
      };

      this.currentCall = null;
    }
  }

  handleCallError(errorCode, message) {
    const errorMap = {
      1000001: "Network connection failed",
      1000002: "Invalid app credentials",
      1000003: "Room connection failed",
      1000004: "Audio/Video permission denied",
      1000005: "Call timeout",
    };

    const userMessage = errorMap[errorCode] || `Call error: ${message}`;
    console.error("Call error:", userMessage);
  }

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

  getLastCallResult() {
    return this.lastCallResult;
  }

  getCurrentCall() {
    return this.currentCall;
  }

  isReady() {
    return this.isInitialized && validateZegoConfig().isValid;
  }

  cleanup() {
    this.currentCall = null;
    this.lastCallResult = null;
    console.log("🧹 ZegoService cleaned up");
  }

  // Legacy methods for backward compatibility
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

    this.currentCall = {
      roomId,
      userId,
      userName,
      callType,
      isTherapist,
      startTime: Date.now(),
      started: false,
    };

    return this.currentCall;
  }

  getAppCredentials() {
    return {
      appID: ZEGO_APP_ID,
      appSign: ZEGO_APP_SIGN,
    };
  }

  generateUserID(user) {
    if (!user) return null;
    const userType = user.userType || (user.phoneNumber ? "user" : "therapist");
    const userId = user.id || user._id;
    return `${userType}_${userId}`.replace(/[^a-zA-Z0-9_]/g, "");
  }
}

export default new UnifiedZegoService();
