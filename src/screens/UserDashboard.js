// src/screens/UserDashboard.js - Fixed implementation with proper error handling
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  Modal,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useSelector, useDispatch } from "react-redux";
import { useFocusEffect } from "@react-navigation/native";
import { logout, updateUserBalance } from "../store/authSlice";
import api from "../services/api";
import socketService from "../services/socket";
import ZegoCloudService from "../services/zegoCloudService";
import {
  CALL_TYPES,
  CALL_PRICING,
  validateZegoConfig,
} from "../config/zegoConfig";
import LinearGradient from "react-native-linear-gradient";

const { width } = Dimensions.get("window");

export default function UserDashboard({ navigation }) {
  const [therapists, setTherapists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calling, setCalling] = useState(false);
  const [currentCall, setCurrentCall] = useState(null);
  const [showCallModal, setShowCallModal] = useState(false);
  const [showCallTypeModal, setShowCallTypeModal] = useState(false);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [activeTab, setActiveTab] = useState("therapists");
  const [callHistory, setCallHistory] = useState([]);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [callTimeout, setCallTimeout] = useState(null);
  const [userStats, setUserStats] = useState({
    totalCalls: 0,
    totalSpent: 0,
    totalMinutes: 0,
  });
  const [zegoConfigValid, setZegoConfigValid] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);

  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();

  // Check ZegoCloud configuration on mount
  useEffect(() => {
    const config = validateZegoConfig();
    setZegoConfigValid(config.isValid);

    if (!config.isValid) {
      console.warn("ZegoCloud configuration issues:", config.errors);
      Alert.alert(
        "Configuration Error",
        "Call functionality requires proper ZegoCloud setup. Please contact support.",
        [{ text: "OK" }]
      );
    }
  }, []);

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log("User dashboard focused, refreshing data...");
      fetchAllData().catch((error) => {
        console.error("Error refreshing data on focus:", error);
      });
    }, [])
  );

  // Auto-refresh balance every 30 seconds when on dashboard
  useEffect(() => {
    const balanceRefreshInterval = setInterval(() => {
      if (activeTab === "therapists") {
        fetchUserBalance().catch((error) => {
          console.error("Error during auto-refresh balance:", error);
        });
      }
    }, 30000);

    return () => clearInterval(balanceRefreshInterval);
  }, [activeTab]);

  // FIXED: Socket connection with proper error handling
  useEffect(() => {
    if (user) {
      initializeData().catch((error) => {
        console.error("Error initializing user data:", error);
      });

      // Connect socket with proper user data
      try {
        const socket = socketService.connect();

        if (!socket) {
          console.error("Failed to get socket instance");
          return;
        }

        console.log("🔗 Connecting user to socket:", user.id);

        // Setup socket listeners first
        setupSocketListeners(socket);

        // Then emit user connection
        socketService.emit("user-connect", {
          userId: user.id,
          userInfo: {
            phoneNumber: user.phoneNumber,
            coinBalance: user.coinBalance,
          },
        });

        // Listen for connection confirmation
        socketService.on("connection-confirmed", (data) => {
          console.log("✅ User socket connection confirmed:", data);
          setSocketConnected(true);
        });

        socketService.on("connect", () => {
          console.log("Socket connected successfully");
          setSocketConnected(true);
        });

        socketService.on("disconnect", () => {
          console.log("Socket disconnected");
          setSocketConnected(false);
        });

        socketService.on("connect_error", (error) => {
          console.error("Socket connection error:", error);
          setSocketConnected(false);
        });
      } catch (error) {
        console.error("Error setting up socket connection:", error);
      }

      return () => {
        cleanupSocket();
        if (callTimeout) {
          clearTimeout(callTimeout);
        }
      };
    }
  }, [user]);

  const initializeData = async () => {
    try {
      await Promise.all([
        fetchTherapists(),
        fetchCallHistory(),
        fetchUserStats(),
      ]);
    } catch (error) {
      console.error("Error initializing data:", error);
    }
  };

  const setupSocketListeners = (socket) => {
    // Listen for call events with proper error handling
    socketService.on("call-accepted", (data) => {
      console.log("✅ Call accepted by therapist:", data);
      try {
        handleCallAccepted(data);
      } catch (error) {
        console.error("Error handling call accepted:", error);
      }
    });

    socketService.on("call-rejected", (data) => {
      console.log("❌ Call rejected by therapist:", data);
      try {
        handleCallRejected(data);
      } catch (error) {
        console.error("Error handling call rejected:", error);
      }
    });

    socketService.on("call-timeout", (data) => {
      console.log("⏰ Call timeout:", data);
      try {
        handleCallTimeout(data);
      } catch (error) {
        console.error("Error handling call timeout:", error);
      }
    });

    // Listen for call end to refresh balance
    socketService.on("call-ended", () => {
      console.log("📞 Call ended, refreshing balance...");
      setTimeout(() => {
        Promise.all([
          fetchUserBalance(),
          fetchCallHistory(),
          fetchUserStats(),
        ]).catch((error) => {
          console.error("Error refreshing data after call end:", error);
        });
      }, 1000);
    });
  };

  const cleanupSocket = () => {
    try {
      socketService.off("connection-confirmed");
      socketService.off("call-accepted");
      socketService.off("call-rejected");
      socketService.off("call-timeout");
      socketService.off("call-ended");
      socketService.off("connect");
      socketService.off("disconnect");
      socketService.off("connect_error");
      socketService.disconnect();
    } catch (error) {
      console.error("Error during socket cleanup:", error);
    }
  };

  const fetchAllData = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchTherapists(false),
        fetchCallHistory(false),
        fetchUserProfile(),
        fetchUserStats(),
      ]);
    } catch (error) {
      console.error("Error refreshing data:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const fetchTherapists = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const response = await api.get("/user/therapists");
      setTherapists(response.data.therapists || []);
    } catch (error) {
      console.error("Error fetching therapists:", error);
      if (showLoading) {
        Alert.alert("Error", "Failed to fetch therapists");
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchCallHistory = async (showLoading = true) => {
    try {
      const response = await api.get("/user/call-history");
      setCallHistory(response.data.calls || []);
    } catch (error) {
      console.error("Error fetching call history:", error);
    }
  };

  const fetchUserProfile = async () => {
    try {
      const response = await api.get("/user/profile");
      const updatedUser = response.data.user;
      dispatch(updateUserBalance(updatedUser.coinBalance));

      setUserStats((prev) => ({
        ...prev,
        totalCalls: updatedUser.totalCalls || 0,
        totalSpent: updatedUser.totalSpent || 0,
      }));
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  };

  const fetchUserBalance = async () => {
    try {
      const response = await api.get("/user/balance");
      if (response.data.success) {
        dispatch(updateUserBalance(response.data.coinBalance));
        console.log("Balance updated:", response.data.coinBalance);
      }
    } catch (error) {
      console.error("Error fetching user balance:", error);
    }
  };

  const fetchUserStats = async () => {
    try {
      const response = await api.get("/user/stats");
      setUserStats({
        totalCalls: response.data.totalCalls || 0,
        totalSpent: response.data.totalCoinsSpent || 0,
        totalMinutes: response.data.totalMinutes || 0,
        currentBalance: response.data.currentBalance || 0,
      });

      if (response.data.currentBalance !== user.coinBalance) {
        dispatch(updateUserBalance(response.data.currentBalance));
      }
    } catch (error) {
      console.error("Error fetching user stats:", error);
    }
  };

  const showCallTypeSelection = (therapist) => {
    if (!zegoConfigValid) {
      Alert.alert(
        "Service Unavailable",
        "Call functionality is temporarily unavailable. Please try again later.",
        [{ text: "OK" }]
      );
      return;
    }

    if (!socketConnected) {
      Alert.alert(
        "Connection Error",
        "Not connected to server. Please check your internet connection and try again.",
        [{ text: "OK" }]
      );
      return;
    }

    setSelectedTherapist(therapist);
    setShowCallTypeModal(true);
  };

  const initiateCall = async (therapist, callType = CALL_TYPES.VOICE) => {
    if (calling) {
      console.log("Call already in progress, ignoring");
      return;
    }

    // Check ZegoCloud configuration
    if (!zegoConfigValid) {
      Alert.alert(
        "Service Error",
        "Call service is not properly configured. Please contact support.",
        [{ text: "OK" }]
      );
      return;
    }

    // Check socket connection
    if (!socketConnected) {
      Alert.alert(
        "Connection Error",
        "Not connected to server. Please check your internet connection.",
        [{ text: "OK" }]
      );
      return;
    }

    // Check balance before call
    try {
      await fetchUserBalance();
    } catch (error) {
      console.error("Error fetching balance before call:", error);
    }

    const requiredCoins = CALL_PRICING[callType].costPerMinute;
    if (user.coinBalance < requiredCoins) {
      Alert.alert(
        "Insufficient Balance",
        `You need at least ${requiredCoins} coins to make a ${callType} call. Each minute costs ${requiredCoins} coins.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Top Up",
            onPress: () => {
              /* Navigate to top-up screen */
            },
          },
        ]
      );
      return;
    }

    try {
      setCalling(true);
      setShowCallTypeModal(false);

      // Generate ZegoCloud call ID
      const zegoCallId = ZegoCloudService.generateCallID(
        user.id,
        therapist._id
      );

      console.log(
        "🔥 Initiating call to therapist:",
        therapist._id,
        "Type:",
        callType,
        "ZegoCallId:",
        zegoCallId
      );

      const response = await api.post("/call/initiate", {
        therapistId: therapist._id,
        callType,
        zegoCallId,
      });

      console.log("✅ Call initiated, response:", response.data);

      const callData = {
        therapist,
        roomId: response.data.roomId,
        callId: response.data.callId,
        zegoCallId: response.data.zegoCallId || zegoCallId,
        callType,
      };

      setCurrentCall(callData);
      setShowCallModal(true);

      // Join the room first
      console.log("🏠 Joining room:", response.data.roomId);
      socketService.emit("join-room", response.data.roomId);

      // Send call request to therapist
      console.log("📤 Sending call-therapist event");
      socketService.emit("call-therapist", {
        therapistId: therapist._id,
        userId: user.id,
        userName: user.name || user.phoneNumber,
        roomId: response.data.roomId,
        callId: response.data.callId,
        zegoCallId: callData.zegoCallId,
        callType,
      });

      // Set timeout for call (30 seconds)
      const timeout = setTimeout(() => {
        console.log("⏰ Call timeout - no response from therapist");
        handleCallTimeout();
      }, 10000);

      setCallTimeout(timeout);
    } catch (error) {
      console.error("❌ Call initiation error:", error);
      setCalling(false);
      setCurrentCall(null);
      setShowCallModal(false);

      // Show specific error message
      const errorMessage =
        error.response?.data?.error ||
        "Failed to initiate call. Please try again.";
      Alert.alert("Error", errorMessage);
    }
  };

  const handleCallAccepted = (data) => {
    console.log("✅ Call accepted:", data);
    setCalling(false);
    setShowCallModal(false);

    if (callTimeout) {
      clearTimeout(callTimeout);
      setCallTimeout(null);
    }

    if (!currentCall) {
      console.error("No current call data available");
      Alert.alert("Error", "Call data not available");
      return;
    }

    try {
      // Ensure we have a valid zegoCallId
      const finalZegoCallId =
        currentCall.zegoCallId ||
        data.zegoCallId ||
        `zego_${currentCall.callId}_${Date.now()}`;

      console.log("Using zegoCallId for user:", finalZegoCallId);

      // Validate ZegoCloud credentials
      const appCredentials = ZegoCloudService.getAppCredentials();
      if (!appCredentials.appID || !appCredentials.appSign) {
        throw new Error("ZegoCloud credentials not properly configured");
      }

      const userID = ZegoCloudService.generateUserID(user);
      if (!userID) {
        throw new Error("Failed to generate user ID");
      }

      // Navigate to ZegoCloud call screen
      navigation.navigate("ZegoCallScreen", {
        appID: appCredentials.appID,
        appSign: appCredentials.appSign,
        userID: userID,
        userName: user.phoneNumber || user.name || "User",
        callID: finalZegoCallId,
        callType: currentCall.callType,
        isInitiator: true,
        internalCallId: currentCall.callId,
        therapistName: currentCall.therapist.name,
      });

      setCurrentCall(null);
    } catch (error) {
      console.error("Error navigating to call screen:", error);
      Alert.alert("Error", `Failed to join call: ${error.message}`);
      setCurrentCall(null);
    }
  };

  const handleCallRejected = (data) => {
    console.log("❌ Call rejected:", data);
    setCalling(false);
    setShowCallModal(false);
    setCurrentCall(null);

    if (callTimeout) {
      clearTimeout(callTimeout);
      setCallTimeout(null);
    }

    Alert.alert(
      "Call Rejected",
      "The therapist is not available right now. Please try again later."
    );
  };

  const handleCallTimeout = (data = null) => {
    console.log("⏰ Call timeout", data);
    setCalling(false);
    setShowCallModal(false);
    setCurrentCall(null);

    if (callTimeout) {
      clearTimeout(callTimeout);
      setCallTimeout(null);
    }

    Alert.alert(
      "Call Timeout",
      "The therapist didn't respond in time. Please try again later."
    );
  };

  const cancelCall = () => {
    console.log("❌ User cancelled call");
    setCalling(false);
    setShowCallModal(false);

    if (callTimeout) {
      clearTimeout(callTimeout);
      setCallTimeout(null);
    }

    if (currentCall && currentCall.roomId) {
      try {
        socketService.emit("cancel-call", {
          callId: currentCall.callId,
          userId: user.id,
          therapistId: currentCall.therapist._id,
          roomId: currentCall.roomId,
        });
      } catch (error) {
        console.error("Error cancelling call:", error);
      }
    }

    setCurrentCall(null);
  };

  const onRefresh = useCallback(() => {
    fetchAllData().catch((error) => {
      console.error("Error during refresh:", error);
    });
  }, []);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === "history") {
      fetchCallHistory(false).catch((error) => {
        console.error("Error fetching call history:", error);
      });
    } else if (tab === "therapists") {
      fetchTherapists(false).catch((error) => {
        console.error("Error fetching therapists:", error);
      });
      fetchUserBalance().catch((error) => {
        console.error("Error fetching balance:", error);
      });
    }
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: () => {
          cleanupSocket();
          dispatch(logout());
          navigation.reset({
            index: 0,
            routes: [{ name: "Login" }],
          });
        },
      },
    ]);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return (
      date.toLocaleDateString() +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  };

  const formatDuration = (minutes) => {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  };

  const renderTherapist = ({ item }) => (
    <View style={styles.therapistCard}>
      <View style={styles.therapistAvatar}>
        <Text style={styles.therapistAvatarText}>{item.name.charAt(0)}</Text>
      </View>
      <View style={styles.therapistInfo}>
        <Text style={styles.therapistName}>{item.name}</Text>
        <View style={styles.statusContainer}>
          <View style={styles.statusDot} />
          <Text style={styles.therapistStatus}>Available</Text>
          {!socketConnected && (
            <Text style={styles.connectionStatus}> (Offline)</Text>
          )}
        </View>
        <Text style={styles.therapistMeta}>
          💰 Voice: {CALL_PRICING[CALL_TYPES.VOICE].costPerMinute} coins/min |
          Video: {CALL_PRICING[CALL_TYPES.VIDEO].costPerMinute} coins/min
        </Text>
      </View>
      <TouchableOpacity
        style={[
          styles.callButton,
          (calling ||
            !user.coinBalance ||
            user.coinBalance < CALL_PRICING[CALL_TYPES.VOICE].costPerMinute ||
            !socketConnected) &&
            styles.disabledButton,
        ]}
        onPress={() => showCallTypeSelection(item)}
        disabled={
          calling ||
          !user.coinBalance ||
          user.coinBalance < CALL_PRICING[CALL_TYPES.VOICE].costPerMinute ||
          !socketConnected
        }
      >
        <LinearGradient
          colors={
            calling ||
            !user.coinBalance ||
            user.coinBalance < CALL_PRICING[CALL_TYPES.VOICE].costPerMinute ||
            !socketConnected
              ? ["#ccc", "#ccc"]
              : ["#4CAF50", "#45a049"]
          }
          style={styles.callButtonGradient}
        >
          {calling ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.callButtonIcon}>📞</Text>
              <Text style={styles.callButtonText}>Call</Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderCallHistoryItem = ({ item }) => (
    <View style={styles.historyCard}>
      <View style={styles.historyHeader}>
        <View style={styles.historyAvatar}>
          <Text style={styles.historyAvatarText}>
            {item.therapistId?.name?.charAt(0) || "T"}
          </Text>
        </View>
        <View style={styles.historyInfo}>
          <Text style={styles.historyTherapistName}>
            {item.therapistId?.name || "Unknown Therapist"}
          </Text>
          <Text style={styles.historyDate}>{formatDate(item.startTime)}</Text>
          <Text style={styles.historyCallType}>
            {item.callType === CALL_TYPES.VIDEO ? "📹 Video" : "🎤 Voice"} Call
          </Text>
        </View>
        <View style={styles.historyMeta}>
          <Text style={styles.historyDuration}>
            {formatDuration(item.durationMinutes)}
          </Text>
          <Text style={styles.historyCost}>-{item.costInCoins} coins</Text>
        </View>
      </View>
      <View style={styles.historyStatus}>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(item.status) },
          ]}
        >
          <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
        </View>
      </View>
    </View>
  );

  const getStatusColor = (status) => {
    switch (status) {
      case "ended_by_user":
      case "ended_by_therapist":
        return "#4CAF50";
      case "missed":
        return "#f44336";
      case "rejected":
        return "#ff9800";
      default:
        return "#9e9e9e";
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case "ended_by_user":
      case "ended_by_therapist":
        return "Completed";
      case "missed":
        return "Missed";
      case "rejected":
        return "Rejected";
      default:
        return "Unknown";
    }
  };

  // Call Type Selection Modal
  const CallTypeSelectionModal = () => (
    <Modal
      visible={showCallTypeModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowCallTypeModal(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.callTypeModalContent}>
          <Text style={styles.callTypeTitle}>Choose Call Type</Text>
          <Text style={styles.callTypeSubtitle}>
            with {selectedTherapist?.name}
          </Text>

          <View style={styles.callTypeOptions}>
            <TouchableOpacity
              style={styles.callTypeOption}
              onPress={() => initiateCall(selectedTherapist, CALL_TYPES.VOICE)}
              disabled={
                user.coinBalance <
                  CALL_PRICING[CALL_TYPES.VOICE].costPerMinute ||
                !socketConnected
              }
            >
              <LinearGradient
                colors={
                  user.coinBalance >=
                    CALL_PRICING[CALL_TYPES.VOICE].costPerMinute &&
                  socketConnected
                    ? ["#4CAF50", "#45a049"]
                    : ["#ccc", "#ccc"]
                }
                style={styles.callTypeOptionGradient}
              >
                <Text style={styles.callTypeIcon}>🎤</Text>
                <Text style={styles.callTypeOptionTitle}>Voice Call</Text>
                <Text style={styles.callTypePrice}>
                  {CALL_PRICING[CALL_TYPES.VOICE].costPerMinute} coins/min
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.callTypeOption}
              onPress={() => initiateCall(selectedTherapist, CALL_TYPES.VIDEO)}
              disabled={
                user.coinBalance <
                  CALL_PRICING[CALL_TYPES.VIDEO].costPerMinute ||
                !socketConnected
              }
            >
              <LinearGradient
                colors={
                  user.coinBalance >=
                    CALL_PRICING[CALL_TYPES.VIDEO].costPerMinute &&
                  socketConnected
                    ? ["#2196F3", "#1976D2"]
                    : ["#ccc", "#ccc"]
                }
                style={styles.callTypeOptionGradient}
              >
                <Text style={styles.callTypeIcon}>📹</Text>
                <Text style={styles.callTypeOptionTitle}>Video Call</Text>
                <Text style={styles.callTypePrice}>
                  {CALL_PRICING[CALL_TYPES.VIDEO].costPerMinute} coins/min
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {!socketConnected && (
            <Text style={styles.connectionWarning}>
              ⚠️ Not connected to server
            </Text>
          )}

          <TouchableOpacity
            style={styles.cancelCallTypeButton}
            onPress={() => setShowCallTypeModal(false)}
          >
            <Text style={styles.cancelCallTypeText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // Calling Modal (existing modal with slight updates)
  const CallingModal = () => (
    <Modal
      visible={showCallModal}
      transparent
      animationType="fade"
      onRequestClose={cancelCall}
    >
      <View style={styles.callingModalContainer}>
        <LinearGradient
          colors={["rgba(102, 126, 234, 0.95)", "rgba(118, 75, 162, 0.95)"]}
          style={styles.callingModalContent}
        >
          <View style={styles.callingHeader}>
            <Text style={styles.callingTitle}>
              {currentCall?.callType === CALL_TYPES.VIDEO
                ? "📹 Video"
                : "🎤 Voice"}{" "}
              Calling...
            </Text>
            <Text style={styles.callingSubtitle}>
              Connecting you with your therapist
            </Text>
          </View>

          <View style={styles.therapistInfoModal}>
            <View style={styles.therapistAvatarLarge}>
              <Text style={styles.therapistAvatarTextLarge}>
                {currentCall?.therapist?.name?.charAt(0) || "T"}
              </Text>
            </View>
            <Text style={styles.therapistNameLarge}>
              {currentCall?.therapist?.name || "Therapist"}
            </Text>
            <Text style={styles.callingStatus}>Waiting for response...</Text>
            <Text style={styles.callingCost}>
              Cost:{" "}
              {
                CALL_PRICING[currentCall?.callType || CALL_TYPES.VOICE]
                  .costPerMinute
              }{" "}
              coins/min
            </Text>

            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          </View>

          <TouchableOpacity
            style={styles.cancelCallButton}
            onPress={cancelCall}
          >
            <View style={styles.cancelCallIcon}>
              <Text style={styles.cancelCallText}>✕</Text>
            </View>
            <Text style={styles.cancelCallLabel}>Cancel Call</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </Modal>
  );

  const ProfileModal = () => (
    <Modal
      visible={showProfileModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowProfileModal(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Your Profile</Text>

          <View style={styles.profileInfo}>
            <Text style={styles.profileLabel}>Total Coins Spent</Text>
            <Text style={styles.profileValue}>
              {userStats.totalSpent} coins
            </Text>
          </View>

          <View style={styles.profileInfo}>
            <Text style={styles.profileLabel}>Total Talk Time</Text>
            <Text style={styles.profileValue}>
              {formatDuration(userStats.totalMinutes)}
            </Text>
          </View>

          <View style={styles.profileInfo}>
            <Text style={styles.profileLabel}>Voice Calls Made</Text>
            <Text style={styles.profileValue}>
              {
                callHistory.filter((call) => call.callType === CALL_TYPES.VOICE)
                  .length
              }
            </Text>
          </View>

          <View style={styles.profileInfo}>
            <Text style={styles.profileLabel}>Video Calls Made</Text>
            <Text style={styles.profileValue}>
              {
                callHistory.filter((call) => call.callType === CALL_TYPES.VIDEO)
                  .length
              }
            </Text>
          </View>

          <TouchableOpacity
            style={styles.modalCloseButton}
            onPress={() => setShowProfileModal(false)}
          >
            <Text style={styles.modalCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // Show loading screen if no user
  if (!user) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loaderText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />

      {/* Header with balance indicator */}
      <LinearGradient colors={["#667eea", "#764ba2"]} style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => setShowProfileModal(true)}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>
                {user?.phoneNumber?.slice(-2) || "U"}
              </Text>
            </View>
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.welcomeText}>Welcome back!</Text>
            <View style={styles.coinContainer}>
              <Text style={styles.coinIcon}>💰</Text>
              <Text style={styles.coinBalance}>
                {user?.coinBalance || 0} coins
              </Text>
              {user?.coinBalance < 20 && (
                <View style={styles.lowBalanceIndicator}>
                  <Text style={styles.lowBalanceText}>Low</Text>
                </View>
              )}
            </View>
            <View style={styles.statusIndicators}>
              {!zegoConfigValid && (
                <Text style={styles.serviceWarningText}>
                  ⚠️ Call service unavailable
                </Text>
              )}
              {!socketConnected && (
                <Text style={styles.connectionWarningText}>
                  🔴 Connection lost
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutIcon}>🚪</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Stats Summary */}
      {activeTab === "therapists" && (
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{userStats.totalCalls}</Text>
            <Text style={styles.statLabel}>Total Calls</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{userStats.totalSpent}</Text>
            <Text style={styles.statLabel}>Coins Spent</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>
              {formatDuration(userStats.totalMinutes)}
            </Text>
            <Text style={styles.statLabel}>Talk Time</Text>
          </View>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "therapists" && styles.activeTab]}
          onPress={() => handleTabChange("therapists")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "therapists" && styles.activeTabText,
            ]}
          >
            👨‍⚕️ Therapists
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "history" && styles.activeTab]}
          onPress={() => handleTabChange("history")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "history" && styles.activeTabText,
            ]}
          >
            📋 Call History
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {activeTab === "therapists" ? (
          loading ? (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color="#667eea" />
              <Text style={styles.loaderText}>Loading therapists...</Text>
            </View>
          ) : (
            <FlatList
              data={therapists}
              renderItem={renderTherapist}
              keyExtractor={(item) => item._id}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={["#667eea"]}
                  tintColor={"#667eea"}
                />
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyIcon}>😔</Text>
                  <Text style={styles.emptyText}>No therapists available</Text>
                  <Text style={styles.emptySubtext}>Pull down to refresh</Text>
                </View>
              }
            />
          )
        ) : (
          <FlatList
            data={callHistory}
            renderItem={renderCallHistoryItem}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={["#667eea"]}
                tintColor={"#667eea"}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>📞</Text>
                <Text style={styles.emptyText}>No call history</Text>
                <Text style={styles.emptySubtext}>
                  Start your first session
                </Text>
              </View>
            }
          />
        )}
      </View>

      <CallTypeSelectionModal />
      <CallingModal />
      <ProfileModal />
    </View>
  );
}

// Enhanced styles with connection status indicators
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  header: {
    paddingTop: StatusBar.currentHeight + 10,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  userAvatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  headerInfo: {
    flex: 1,
    marginLeft: 15,
  },
  welcomeText: {
    color: "#fff",
    fontSize: 16,
    marginBottom: 4,
  },
  coinContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  coinIcon: {
    fontSize: 16,
    marginRight: 5,
  },
  coinBalance: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  lowBalanceIndicator: {
    backgroundColor: "#ff6b6b",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  lowBalanceText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  statusIndicators: {
    flexDirection: "column",
  },
  serviceWarningText: {
    color: "#ffeb3b",
    fontSize: 12,
    fontWeight: "500",
  },
  connectionWarningText: {
    color: "#ff6b6b",
    fontSize: 12,
    fontWeight: "500",
  },
  logoutButton: {
    padding: 10,
  },
  logoutIcon: {
    fontSize: 20,
  },
  statsContainer: {
    flexDirection: "row",
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginTop: -10,
    borderRadius: 15,
    padding: 15,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    marginBottom: 10,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
  },
  statDivider: {
    width: 1,
    backgroundColor: "#e9ecef",
    marginHorizontal: 15,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 15,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: "center",
    borderRadius: 15,
  },
  activeTab: {
    backgroundColor: "#667eea",
  },
  tabText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },
  activeTabText: {
    color: "#fff",
  },
  content: {
    flex: 1,
    marginTop: 20,
  },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loaderText: {
    marginTop: 10,
    color: "#666",
    fontSize: 16,
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  therapistCard: {
    backgroundColor: "#fff",
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    flexDirection: "row",
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  therapistAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#667eea",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  therapistAvatarText: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
  },
  therapistInfo: {
    flex: 1,
  },
  therapistName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 5,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 5,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4CAF50",
    marginRight: 6,
  },
  therapistStatus: {
    fontSize: 14,
    color: "#4CAF50",
    fontWeight: "500",
  },
  connectionStatus: {
    fontSize: 12,
    color: "#ff6b6b",
    fontWeight: "500",
  },
  therapistMeta: {
    fontSize: 12,
    color: "#666",
  },
  callButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  callButtonGradient: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  disabledButton: {
    opacity: 0.6,
  },
  callButtonIcon: {
    fontSize: 16,
    marginRight: 5,
  },
  callButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  historyCard: {
    backgroundColor: "#fff",
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  historyAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#667eea",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  historyAvatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  historyInfo: {
    flex: 1,
  },
  historyTherapistName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  historyDate: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  historyCallType: {
    fontSize: 12,
    color: "#888",
    fontWeight: "500",
  },
  historyMeta: {
    alignItems: "flex-end",
  },
  historyDuration: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  historyCost: {
    fontSize: 12,
    color: "#f44336",
    fontWeight: "500",
  },
  historyStatus: {
    alignItems: "flex-start",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 15,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#666",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: "#fff",
    padding: 30,
    borderRadius: 20,
    width: width * 0.85,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
    color: "#333",
  },
  profileInfo: {
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  profileLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 5,
  },
  profileValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  modalCloseButton: {
    backgroundColor: "#667eea",
    paddingVertical: 15,
    borderRadius: 12,
    marginTop: 20,
  },
  modalCloseText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  // Call Type Selection Modal Styles
  callTypeModalContent: {
    backgroundColor: "#fff",
    padding: 30,
    borderRadius: 25,
    width: width * 0.9,
    elevation: 15,
  },
  callTypeTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
    color: "#333",
  },
  callTypeSubtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 30,
  },
  callTypeOptions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 25,
  },
  callTypeOption: {
    flex: 1,
    marginHorizontal: 8,
    borderRadius: 15,
    overflow: "hidden",
  },
  callTypeOptionGradient: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  callTypeIcon: {
    fontSize: 32,
    marginBottom: 10,
  },
  callTypeOptionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 5,
  },
  callTypePrice: {
    fontSize: 12,
    color: "#fff",
    opacity: 0.9,
  },
  connectionWarning: {
    color: "#ff6b6b",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 15,
    fontWeight: "500",
  },
  cancelCallTypeButton: {
    backgroundColor: "#f5f5f5",
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelCallTypeText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
  // Calling Modal Styles
  callingModalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  callingModalContent: {
    width: width * 0.9,
    height: "70%",
    borderRadius: 25,
    padding: 30,
    alignItems: "center",
    justifyContent: "space-between",
  },
  callingHeader: {
    alignItems: "center",
    marginTop: 20,
  },
  callingTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  callingSubtitle: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.8)",
    textAlign: "center",
  },
  therapistInfoModal: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  therapistAvatarLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 3,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  therapistAvatarTextLarge: {
    color: "#fff",
    fontSize: 48,
    fontWeight: "bold",
  },
  therapistNameLarge: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 10,
    textAlign: "center",
  },
  callingStatus: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.8)",
    textAlign: "center",
    marginBottom: 8,
  },
  callingCost: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "center",
    marginBottom: 20,
  },
  loadingContainer: {
    marginTop: 20,
  },
  cancelCallButton: {
    alignItems: "center",
    marginBottom: 20,
  },
  cancelCallIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#ff4444",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  cancelCallText: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
  },
  cancelCallLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
