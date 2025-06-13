import { Platform } from "react-native";
import Constants from "expo-constants";

// Get ZEGO credentials with better fallback handling
const getZegoCredentials = () => {
  // Try multiple sources for credentials
  let appId =
    Constants.expoConfig?.extra?.ZEGO_APP_ID ||
    Constants.manifest?.extra?.ZEGO_APP_ID ||
    process.env.ZEGO_APP_ID;

  let appSign =
    Constants.expoConfig?.extra?.ZEGO_APP_SIGN ||
    Constants.manifest?.extra?.ZEGO_APP_SIGN ||
    process.env.ZEGO_APP_SIGN;

  // Ensure appId is a number
  if (typeof appId === "string") {
    appId = parseInt(appId, 10);
  }

  return { appId, appSign };
};

const { appId, appSign } = getZegoCredentials();

export const ZEGO_APP_ID = appId || 1226411060; // Your actual app ID as fallback
export const ZEGO_APP_SIGN =
  appSign || "b3b4353c9b8f988417b9b2c82525c753c2afd807b0414576ffe478fe9faff334"; // Your actual app sign as fallback

console.log("ZEGO Configuration:", {
  appId: ZEGO_APP_ID,
  appSignPresent: !!ZEGO_APP_SIGN,
  platform: Platform.OS,
});

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

// Enhanced validation
export const validateZegoConfig = () => {
  const errors = [];

  if (!ZEGO_APP_ID || isNaN(ZEGO_APP_ID)) {
    errors.push("ZEGO_APP_ID is missing or invalid");
  }

  if (
    !ZEGO_APP_SIGN ||
    typeof ZEGO_APP_SIGN !== "string" ||
    ZEGO_APP_SIGN.length < 32
  ) {
    errors.push("ZEGO_APP_SIGN is missing or invalid");
  }

  const result = {
    isValid: errors.length === 0,
    errors,
    config: {
      appId: ZEGO_APP_ID,
      appSign: ZEGO_APP_SIGN ? "Present" : "Missing",
    },
  };

  if (!result.isValid) {
    console.error("❌ ZEGO Configuration Validation Failed:", result);
  } else {
    console.log("✅ ZEGO Configuration is valid");
  }

  return result;
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
};

export default {
  ZEGO_APP_ID,
  ZEGO_APP_SIGN,
  CALL_TYPES,
  CALL_STATUS,
  CALL_PRICING,
  UI_CONFIG,
  validateZegoConfig,
};
