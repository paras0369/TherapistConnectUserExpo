// Fixed src/screens/UserDashboard.js - Proper socket connection
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
import LinearGradient from "react-native-linear-gradient";

const { width } = Dimensions.get("window");

export default function UserDashboard({ navigation }) {
  const [therapists, setTherapists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calling, setCalling] = useState(false);
  const [currentCall, setCurrentCall] = useState(null);
  const [showCallModal, setShowCallModal] = useState(false);
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
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log("User dashboard focused, refreshing data...");
      fetchAllData();
    }, [])
  );

  // Auto-refresh balance every 30 seconds when on dashboard
  useEffect(() => {
    const balanceRefreshInterval = setInterval(() => {
      if (activeTab === "therapists") {
        fetchUserBalance();
      }
    }, 30000);

    return () => clearInterval(balanceRefreshInterval);
  }, [activeTab]);

  useEffect(() => {
    if (user) {
      fetchTherapists();
      fetchCallHistory();
      fetchUserStats();

      // FIXED: Connect socket with proper user data
      const socket = socketService.connect();

      console.log("🔗 Connecting user to socket:", user.id);
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
      });

      // Listen for call events
      socketService.on("call-accepted", (data) => {
        console.log("✅ Call accepted by therapist:", data);
        setCalling(false);
        setShowCallModal(false);
        setCurrentCall(null);
        if (callTimeout) {
          clearTimeout(callTimeout);
          setCallTimeout(null);
        }

        navigation.navigate("Call", {
          roomId: data.roomId,
          therapistId: data.therapistId,
          isInitiator: true,
        });
      });

      socketService.on("call-rejected", (data) => {
        console.log("❌ Call rejected by therapist:", data);
        setCalling(false);
        setShowCallModal(false);
        setCurrentCall(null);
        if (callTimeout) {
          clearTimeout(callTimeout);
          setCallTimeout(null);
        }
        Alert.alert(
          "Call Rejected",
          "The therapist is not available right now"
        );
      });

      socketService.on("call-timeout", (data) => {
        console.log("⏰ Call timeout:", data);
        setCalling(false);
        setShowCallModal(false);
        setCurrentCall(null);
        if (callTimeout) {
          clearTimeout(callTimeout);
          setCallTimeout(null);
        }
        Alert.alert("Call Timeout", "The therapist didn't respond in time");
      });

      // Listen for call end to refresh balance
      socketService.on("call-ended", () => {
        console.log("📞 Call ended, refreshing balance...");
        setTimeout(() => {
          fetchUserBalance();
          fetchCallHistory();
          fetchUserStats();
        }, 1000);
      });

      // Debug connection status
      socketService.emit("debug-connections");
      socketService.on("debug-info", (data) => {
        console.log("🔍 User debug info:", data);
      });

      return () => {
        socketService.off("connection-confirmed");
        socketService.off("call-accepted");
        socketService.off("call-rejected");
        socketService.off("call-timeout");
        socketService.off("call-ended");
        socketService.off("debug-info");
        socketService.disconnect();
        if (callTimeout) {
          clearTimeout(callTimeout);
        }
      };
    }
  }, [user]);

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
      setTherapists(response.data.therapists);
    } catch (error) {
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

      // Update user stats from profile
      setUserStats({
        totalCalls: updatedUser.totalCalls || 0,
        totalSpent: updatedUser.totalSpent || 0,
        totalMinutes: 0, // Will be updated by fetchUserStats
      });
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

      // Also update balance in Redux if different
      if (response.data.currentBalance !== user.coinBalance) {
        dispatch(updateUserBalance(response.data.currentBalance));
      }
    } catch (error) {
      console.error("Error fetching user stats:", error);
    }
  };

  const initiateCall = async (therapist) => {
    if (calling) return;

    // Check balance before call
    await fetchUserBalance();

    if (user.coinBalance < 5) {
      Alert.alert(
        "Insufficient Balance",
        "You need at least 5 coins to make a call. Each minute costs 5 coins."
      );
      return;
    }

    try {
      setCalling(true);
      setCurrentCall({ therapist, roomId: null });

      console.log("🔥 Initiating call to therapist:", therapist._id);

      const response = await api.post("/call/initiate", {
        therapistId: therapist._id,
      });

      console.log("✅ Call initiated, room ID:", response.data.roomId);

      setCurrentCall({
        therapist,
        roomId: response.data.roomId,
        callId: response.data.callId,
      });
      setShowCallModal(true);

      // Join the room first
      console.log("🏠 Joining room:", response.data.roomId);
      socketService.emit("join-room", response.data.roomId);

      // Then emit call request to therapist
      console.log("📤 Sending call-therapist event");
      socketService.emit("call-therapist", {
        therapistId: therapist._id,
        userId: user.id,
        userName: user.name || "User",
        roomId: response.data.roomId,
        callId: response.data.callId,
      });

      // Set timeout for call (30 seconds)
      const timeout = setTimeout(() => {
        console.log("⏰ Call timeout - no response from therapist");
        setCalling(false);
        setShowCallModal(false);
        setCurrentCall(null);
        Alert.alert(
          "Call Timeout",
          "The therapist didn't respond. Please try again later."
        );
      }, 30000);

      setCallTimeout(timeout);
    } catch (error) {
      console.error("❌ Call initiation error:", error);
      setCalling(false);
      setCurrentCall(null);
      setShowCallModal(false);
      Alert.alert("Error", "Failed to initiate call. Please try again.");
    }
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
      socketService.emit("cancel-call", {
        callId: currentCall.callId,
        userId: user.id,
        therapistId: currentCall.therapist._id,
        roomId: currentCall.roomId,
      });
    }

    setCurrentCall(null);
  };

  const onRefresh = useCallback(() => {
    fetchAllData();
  }, []);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === "history") {
      fetchCallHistory(false);
    } else if (tab === "therapists") {
      fetchTherapists(false);
      fetchUserBalance(); // Refresh balance when switching to therapists tab
    }
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: () => {
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
        </View>
        <Text style={styles.therapistMeta}>💰 5 coins/min</Text>
      </View>
      <TouchableOpacity
        style={[
          styles.callButton,
          (calling || !user.coinBalance || user.coinBalance < 5) &&
            styles.disabledButton,
        ]}
        onPress={() => initiateCall(item)}
        disabled={calling || !user.coinBalance || user.coinBalance < 5}
      >
        <LinearGradient
          colors={
            calling || !user.coinBalance || user.coinBalance < 5
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
        return "Completed";
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
            <Text style={styles.callingTitle}>Calling...</Text>
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

      <CallingModal />
      <ProfileModal />
    </View>
  );
}

// Styles remain the same as your original file
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
  balanceText: {
    color: "#4CAF50",
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
