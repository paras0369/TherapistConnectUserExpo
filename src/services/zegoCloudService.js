// src/services/zegoCloudService.js
import { ZEGO_APP_ID, ZEGO_APP_SIGN } from "../config/zegoConfig";

export class ZegoCloudService {
  /**
   * Generate unique call ID for ZegoCloud
   * @param {string} userId - User ID
   * @param {string} therapistId - Therapist ID
   * @returns {string} - Unique call ID
   */
  static generateCallID(userId, therapistId) {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `call_${userId}_${therapistId}_${timestamp}_${randomSuffix}`;
  }

  /**
   * Generate ZegoCloud compatible user ID
   * @param {Object} user - User object
   * @returns {string} - ZegoCloud user ID
   */
  static generateUserID(user) {
    if (user.userType === "user") {
      return `user_${user.id}`;
    } else if (user.userType === "therapist") {
      return `therapist_${user.id}`;
    }
    return `unknown_${user.id}`;
  }

  /**
   * Get call configuration based on call type and role
   * @param {string} callType - 'voice' or 'video'
   * @param {boolean} isInitiator - Whether user is initiating the call
   * @param {Object} callbacks - Callback functions
   * @returns {Object} - ZegoCloud call configuration
   */
  static getCallConfig(callType, isInitiator, callbacks = {}) {
    const {
      onCallEnd = () => {},
      onOnlySelfInRoom = () => {},
      onUserJoin = () => {},
      onUserLeave = () => {},
    } = callbacks;

    const baseConfig = {
      onCallEnd: (callID, reason, duration) => {
        console.log("Call ended:", { callID, reason, duration });
        onCallEnd(callID, reason, duration);
      },
      onOnlySelfInRoom: () => {
        console.log("Only self in room");
        onOnlySelfInRoom();
      },
      onUserJoin: (users) => {
        console.log("User joined:", users);
        onUserJoin(users);
      },
      onUserLeave: (users) => {
        console.log("User left:", users);
        onUserLeave(users);
      },
      // Enable call invitation
      enableCallInvitation: true,
      // Show call duration
      showCallDuration: true,
      // Allow camera switching for video calls
      showCameraSwitchButton: callType === "video",
      // Show speaker button
      showSpeakerButton: true,
      // Show mute button
      showMicrophoneButton: true,
      // Show hang up button
      showHangUpButton: true,
    };

    if (callType === "video") {
      return {
        ...baseConfig,
        // Video call specific settings
        enableCamera: true,
        enableMicrophone: true,
        useVideoViewAspectFill: true,
        videoViewBackgroundColor: "#000000",
        // Layout for video calls
        layout: {
          showMyCameraToggleButton: true,
          showMyMicrophoneToggleButton: true,
          showCameraSwitchButton: true,
          showScreenSharingButton: false, // Can be enabled later
        },
      };
    } else {
      return {
        ...baseConfig,
        // Voice call specific settings
        enableCamera: false,
        enableMicrophone: true,
        // Audio-only layout
        layout: {
          showMyCameraToggleButton: false,
          showMyMicrophoneToggleButton: true,
          showCameraSwitchButton: false,
          showScreenSharingButton: false,
        },
      };
    }
  }

  /**
   * Validate call parameters
   * @param {Object} params - Call parameters
   * @returns {boolean} - Whether parameters are valid
   */
  static validateCallParams(params) {
    const { appID, appSign, userID, userName, callID } = params;

    if (!appID || !appSign) {
      console.error("ZegoCloud: Missing appID or appSign");
      return false;
    }

    if (!userID || !userName || !callID) {
      console.error("ZegoCloud: Missing required call parameters");
      return false;
    }

    // Validate userID and callID format (only letters, numbers, and underscores)
    const validFormat = /^[a-zA-Z0-9_]+$/;
    if (!validFormat.test(userID) || !validFormat.test(callID)) {
      console.error("ZegoCloud: Invalid userID or callID format");
      return false;
    }

    return true;
  }

  /**
   * Get app credentials
   * @returns {Object} - App credentials
   */
  static getAppCredentials() {
    return {
      appID: parseInt(ZEGO_APP_ID),
      appSign: ZEGO_APP_SIGN,
    };
  }

  /**
   * Create call invitation data
   * @param {Object} callData - Call data
   * @returns {Object} - Call invitation data
   */
  static createCallInvitationData(callData) {
    const { userID, userName, callType, therapistId, therapistName } = callData;

    return {
      type: "incoming_call",
      callType,
      userID,
      userName,
      therapistId,
      therapistName,
      timestamp: Date.now(),
    };
  }

  /**
   * Parse call end reason
   * @param {string} reason - ZegoCloud call end reason
   * @returns {string} - Parsed reason
   */
  static parseCallEndReason(reason) {
    switch (reason) {
      case "Declined":
        return "rejected";
      case "Timeout":
        return "missed";
      case "Cancelled":
        return "cancelled";
      case "Ended":
        return "ended";
      case "Busy":
        return "busy";
      case "Offline":
        return "offline";
      default:
        return "unknown";
    }
  }

  /**
   * Calculate call cost
   * @param {number} duration - Call duration in seconds
   * @param {string} callType - Call type
   * @returns {Object} - Cost calculation
   */
  static calculateCallCost(duration, callType) {
    const durationMinutes = Math.max(1, Math.ceil(duration / 60));

    // Cost per minute based on call type
    const costPerMinute = callType === "video" ? 8 : 5; // Video calls cost more
    const therapistEarningsPerMinute = callType === "video" ? 4 : 2.5;

    return {
      durationMinutes,
      costInCoins: durationMinutes * costPerMinute,
      therapistEarningsCoins: Math.floor(
        durationMinutes * therapistEarningsPerMinute
      ),
    };
  }

  /**
   * Check if ZegoCloud is properly configured
   * @returns {boolean} - Whether ZegoCloud is configured
   */
  static isConfigured() {
    const { appID, appSign } = this.getAppCredentials();
    return !!(appID && appSign && appID !== 0);
  }

  /**
   * Get error message for configuration issues
   * @returns {string} - Error message
   */
  static getConfigurationError() {
    const { appID, appSign } = this.getAppCredentials();

    if (!appID || appID === 0) {
      return "ZegoCloud App ID is not configured. Please check your environment configuration.";
    }

    if (!appSign) {
      return "ZegoCloud App Sign is not configured. Please check your environment configuration.";
    }

    return "ZegoCloud configuration is valid.";
  }
}

export default ZegoCloudService;
