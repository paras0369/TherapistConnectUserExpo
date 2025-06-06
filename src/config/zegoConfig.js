// src/config/zegoConfig.js
import { Platform } from "react-native";

// ZegoCloud Configuration
// Replace these with your actual ZegoCloud credentials from the console
export const ZEGO_APP_ID = "1226411060";

export const ZEGO_APP_SIGN =
  "b3b4353c9b8f988417b9b2c82525c753c2afd807b0414576ffe478fe9faff334";
// Call Types
export const CALL_TYPES = {
  VOICE: "voice",
  VIDEO: "video",
};

// Call Status
export const CALL_STATUS = {
  INITIATED: "initiated",
  ANSWERED: "answered",
  ENDED_BY_USER: "ended_by_user",
  ENDED_BY_THERAPIST: "ended_by_therapist",
  REJECTED: "rejected",
  MISSED: "missed",
  CANCELLED: "cancelled",
  BUSY: "busy",
  OFFLINE: "offline",
};

// Pricing Configuration
export const CALL_PRICING = {
  [CALL_TYPES.VOICE]: {
    costPerMinute: 5,
    therapistEarningsPerMinute: 2.5,
    minimumMinutes: 1,
  },
  [CALL_TYPES.VIDEO]: {
    costPerMinute: 8,
    therapistEarningsPerMinute: 4,
    minimumMinutes: 1,
  },
};

// Platform-specific configurations
export const PLATFORM_CONFIG = {
  android: {
    // Android specific ZegoCloud settings
    enableHardwareEchoCancel: true,
    enableHardwareNoiseSuppress: true,
    enableAgc: true,
    enableDtx: false,
  },
  ios: {
    // iOS specific ZegoCloud settings
    enableHardwareEchoCancel: true,
    enableHardwareNoiseSuppress: true,
    enableAgc: true,
    enableDtx: false,
  },
};

// Get platform-specific config
export const getPlatformConfig = () => {
  return PLATFORM_CONFIG[Platform.OS] || PLATFORM_CONFIG.android;
};

// Validate configuration
export const validateZegoConfig = () => {
  const errors = [];

  if (!ZEGO_APP_ID || ZEGO_APP_ID === 1234567890) {
    errors.push("ZEGO_APP_ID is not configured or using default value");
  }

  if (!ZEGO_APP_SIGN || ZEGO_APP_SIGN.includes("your_")) {
    errors.push("ZEGO_APP_SIGN is not configured or using default value");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Quality settings for different network conditions
export const QUALITY_SETTINGS = {
  HIGH: {
    video: {
      width: 720,
      height: 1280,
      fps: 30,
      bitrate: 1200,
    },
    audio: {
      bitrate: 64,
      codec: "OPUS",
    },
  },
  MEDIUM: {
    video: {
      width: 540,
      height: 960,
      fps: 24,
      bitrate: 800,
    },
    audio: {
      bitrate: 48,
      codec: "OPUS",
    },
  },
  LOW: {
    video: {
      width: 360,
      height: 640,
      fps: 15,
      bitrate: 400,
    },
    audio: {
      bitrate: 32,
      codec: "OPUS",
    },
  },
};

// Call timeout settings
export const CALL_TIMEOUTS = {
  INVITATION_TIMEOUT: 30000, // 30 seconds for call invitation
  CONNECTION_TIMEOUT: 15000, // 15 seconds for connection establishment
  RECONNECTION_TIMEOUT: 10000, // 10 seconds for reconnection attempts
  MAX_RECONNECTION_ATTEMPTS: 3, // Maximum reconnection attempts
};

// UI Configuration
export const UI_CONFIG = {
  colors: {
    primary: "#4A90E2",
    secondary: "#667eea",
    success: "#4CAF50",
    danger: "#f44336",
    warning: "#ff9800",
    dark: "#1e1e1e",
    light: "#ffffff",
  },
  callScreen: {
    backgroundColor: "#1e1e1e",
    showCallDuration: true,
    showNetworkQuality: true,
    enableBeautyFilter: false, // Can be enabled for video calls
    enableVirtualBackground: false, // Advanced feature
  },
};

// Feature flags
export const FEATURE_FLAGS = {
  ENABLE_CALL_RECORDING: false, // Call recording feature
  ENABLE_SCREEN_SHARING: false, // Screen sharing in video calls
  ENABLE_GROUP_CALLS: false, // Group therapy sessions
  ENABLE_CALL_QUALITY_FEEDBACK: true, // Post-call quality feedback
  ENABLE_NETWORK_QUALITY_INDICATOR: true, // Show network quality
  ENABLE_CALL_INVITATION_PUSH: true, // Push notifications for calls
};

// Development helpers
export const DEV_CONFIG = {
  enableDebugLogs: __DEV__,
  enableCallSimulation: __DEV__, // For testing without actual calls
  mockCallDuration: 60, // Mock call duration for testing
  enablePerformanceMonitoring: true,
};

export default {
  ZEGO_APP_ID,
  ZEGO_APP_SIGN,
  CALL_TYPES,
  CALL_STATUS,
  CALL_PRICING,
  PLATFORM_CONFIG,
  QUALITY_SETTINGS,
  CALL_TIMEOUTS,
  UI_CONFIG,
  FEATURE_FLAGS,
  DEV_CONFIG,
  getPlatformConfig,
  validateZegoConfig,
};
