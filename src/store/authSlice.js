// Updated src/store/authSlice.js - Add FCM token support
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../services/api";

export const sendOTP = createAsyncThunk("auth/sendOTP", async (phoneNumber) => {
  const response = await api.post("/auth/send-otp", { phoneNumber });
  return response.data;
});

export const verifyOTP = createAsyncThunk(
  "auth/verifyOTP",
  async ({ phoneNumber, otp, fcmToken }) => {
    const response = await api.post("/auth/verify-otp", {
      phoneNumber,
      otp,
      fcmToken,
    });
    await AsyncStorage.setItem("token", response.data.token);
    await AsyncStorage.setItem("userType", "user");
    return response.data;
  }
);

export const therapistLogin = createAsyncThunk(
  "auth/therapistLogin",
  async ({ email, password, fcmToken }) => {
    const response = await api.post("/auth/therapist-login", {
      email,
      password,
      fcmToken,
    });
    await AsyncStorage.setItem("token", response.data.token);
    await AsyncStorage.setItem("userType", "therapist");
    return response.data;
  }
);

export const adminLogin = createAsyncThunk(
  "auth/adminLogin",
  async ({ email, password }) => {
    // For admin login, we'll use a special endpoint or validate against admin credentials
    // This is a simple implementation - you should enhance this for production
    if (email === "admin@therapyconnect.com" && password === "admin123") {
      const adminToken = "admin-token-" + Date.now();
      await AsyncStorage.setItem("token", adminToken);
      await AsyncStorage.setItem("userType", "admin");
      return {
        token: adminToken,
        admin: {
          id: "admin",
          email: email,
          role: "super_admin",
        },
      };
    } else {
      throw new Error("Invalid admin credentials");
    }
  }
);

export const updateFCMToken = createAsyncThunk(
  "auth/updateFCMToken",
  async ({ fcmToken, userType, userId }) => {
    const response = await api.post("/auth/update-fcm-token", {
      fcmToken,
      userType,
      userId,
    });
    return response.data;
  }
);

const authSlice = createSlice({
  name: "auth",
  initialState: {
    user: null,
    therapist: null,
    userType: null,
    token: null,
    fcmToken: null,
    loading: false,
    error: null,
  },
  reducers: {
    logout: (state) => {
      state.user = null;
      state.therapist = null;
      state.userType = null;
      state.token = null;
      state.fcmToken = null;
      AsyncStorage.removeItem("token");
      AsyncStorage.removeItem("userType");
    },
    setAuth: (state, action) => {
      state.token = action.payload.token;
      state.userType = action.payload.userType;
      if (action.payload.userType === "user") {
        state.user = action.payload.user;
      } else if (action.payload.userType === "therapist") {
        state.therapist = action.payload.therapist;
      }
    },
    setFCMToken: (state, action) => {
      state.fcmToken = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    updateUserBalance: (state, action) => {
      if (state.user) {
        state.user.coinBalance = action.payload;
      }
    },
    updateTherapistEarnings: (state, action) => {
      if (state.therapist) {
        state.therapist.totalEarningsCoins = action.payload;
      }
    },
    updateTherapistAvailability: (state, action) => {
      if (state.therapist) {
        state.therapist.isAvailable = action.payload;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Send OTP
      .addCase(sendOTP.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(sendOTP.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(sendOTP.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      // Verify OTP
      .addCase(verifyOTP.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(verifyOTP.fulfilled, (state, action) => {
        state.loading = false;
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.userType = "user";
      })
      .addCase(verifyOTP.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      // Therapist Login
      .addCase(therapistLogin.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(therapistLogin.fulfilled, (state, action) => {
        state.loading = false;
        state.token = action.payload.token;
        state.therapist = action.payload.therapist;
        state.userType = "therapist";
      })
      .addCase(therapistLogin.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      // Update FCM Token
      .addCase(updateFCMToken.pending, (state) => {
        // Don't show loading for FCM token updates
      })
      .addCase(updateFCMToken.fulfilled, (state, action) => {
        // FCM token updated successfully
        console.log("FCM token updated on server");
      })
      .addCase(updateFCMToken.rejected, (state, action) => {
        console.error("Failed to update FCM token:", action.error.message);
      });
  },
});

export const {
  logout,
  setAuth,
  setFCMToken,
  clearError,
  updateUserBalance,
  updateTherapistEarnings,
  updateTherapistAvailability,
} = authSlice.actions;

export default authSlice.reducer;
