import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  useColorScheme,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getApiUrl } from "@/lib/query-client";

const EVENT_LABELS: Record<string, string> = {
  restaurant_viewed: "Restaurant Views",
  meal_clicked: "Meal Clicks",
  meal_detail_viewed: "Meal Detail Views",
  meal_saved: "Meals Saved",
  meal_unsaved: "Meals Unsaved",
  search_query: "Searches",
  order_guide_opened: "Order Guides Opened",
  ai_question_asked: "AI Questions",
  best_meal_requested: "Best Meal Requests",
};

const EVENT_ICONS: Record<string, string> = {
  restaurant_viewed: "storefront-outline",
  meal_clicked: "fast-food-outline",
  meal_detail_viewed: "document-text-outline",
  meal_saved: "bookmark-outline",
  meal_unsaved: "bookmark",
  search_query: "search-outline",
  order_guide_opened: "list-outline",
  ai_question_asked: "chatbubble-outline",
  best_meal_requested: "star-outline",
};

interface AdminStats {
  total: number;
  byType: Record<string, number>;
  topRestaurants: { name: string; count: number }[];
  topItems: { name: string; restaurantName: string; count: number }[];
  recent: { id: number; event: string; restaurantName: string | null; itemName: string | null; createdAt: string | null }[];
}

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [storedPassword, setStoredPassword] = useState("");

  const bg = isDark ? "#0a1a0d" : "#f7fdf9";
  const card = isDark ? "#1a2e1f" : "#ffffff";
  const textPrimary = isDark ? "#f0fdf4" : "#0a1f12";
  const textMuted = isDark ? "#86efac" : "#4b7a5a";
  const border = isDark ? "#2d4a35" : "#e2f0e6";
  const primary = "#166534";
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  async function fetchStats(pwd: string) {
    const base = getApiUrl();
    const url = new URL("/api/admin/stats", base).toString();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${pwd}` },
    });
    if (res.status === 401) throw new Error("wrong_password");
    if (!res.ok) throw new Error("server_error");
    return res.json() as Promise<AdminStats>;
  }

  async function handleLogin() {
    if (!password.trim()) return;
    setLoading(true);
    setAuthError("");
    try {
      const data = await fetchStats(password.trim());
      setStoredPassword(password.trim());
      setStats(data);
      setAuthed(true);
    } catch (e: any) {
      if (e.message === "wrong_password") setAuthError("Incorrect password.");
      else setAuthError("Could not connect. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const data = await fetchStats(storedPassword);
      setStats(data);
    } catch {}
    setRefreshing(false);
  }

  if (!authed) {
    return (
      <View style={[styles.loginContainer, { backgroundColor: bg, paddingTop: topPad + 40, paddingBottom: botPad }]}>
        <View style={[styles.loginCard, { backgroundColor: card, borderColor: border }]}>
          <View style={[styles.loginIconWrap, { backgroundColor: "#dcfce7" }]}>
            <Ionicons name="lock-closed" size={28} color={primary} />
          </View>
          <Text style={[styles.loginTitle, { color: textPrimary }]}>Admin Dashboard</Text>
          <Text style={[styles.loginSubtitle, { color: textMuted }]}>DiabEats Interaction Analytics</Text>

          <TextInput
            style={[styles.passwordInput, { backgroundColor: isDark ? "#0f2014" : "#f0fdf4", borderColor: border, color: textPrimary }]}
            placeholder="Enter admin password"
            placeholderTextColor={textMuted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={handleLogin}
            autoCapitalize="none"
          />
          {authError ? <Text style={styles.errorText}>{authError}</Text> : null}

          <Pressable
            onPress={handleLogin}
            style={[styles.loginBtn, { backgroundColor: primary, opacity: loading ? 0.7 : 1 }]}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.loginBtnText}>Sign In</Text>
            }
          </Pressable>
        </View>
      </View>
    );
  }

  if (!stats) return null;

  const sortedTypes = Object.entries(stats.byType).sort((a, b) => b[1] - a[1]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: botPad + 24, paddingHorizontal: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primary} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.pageTitle, { color: textPrimary }]}>Interaction Log</Text>
          <Text style={[styles.pageSubtitle, { color: textMuted }]}>
            {stats.total.toLocaleString()} total events recorded
          </Text>
        </View>
        <Pressable
          onPress={() => { setAuthed(false); setStats(null); setPassword(""); }}
          style={[styles.logoutBtn, { borderColor: border }]}
        >
          <Ionicons name="log-out-outline" size={18} color={textMuted} />
        </Pressable>
      </View>

      <Text style={[styles.sectionTitle, { color: textMuted }]}>EVENTS BY TYPE</Text>
      <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
        {sortedTypes.map(([type, count], i) => (
          <View
            key={type}
            style={[styles.statRow, i < sortedTypes.length - 1 && { borderBottomWidth: 1, borderBottomColor: border }]}
          >
            <View style={styles.statLeft}>
              <Ionicons
                name={(EVENT_ICONS[type] ?? "ellipse-outline") as any}
                size={18}
                color={primary}
                style={{ marginRight: 10 }}
              />
              <Text style={[styles.statLabel, { color: textPrimary }]}>
                {EVENT_LABELS[type] ?? type}
              </Text>
            </View>
            <Text style={[styles.statCount, { color: primary }]}>{count.toLocaleString()}</Text>
          </View>
        ))}
        {sortedTypes.length === 0 && (
          <Text style={[styles.emptyText, { color: textMuted }]}>No events yet</Text>
        )}
      </View>

      <Text style={[styles.sectionTitle, { color: textMuted }]}>TOP RESTAURANTS</Text>
      <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
        {stats.topRestaurants.map((r, i) => (
          <View
            key={r.name}
            style={[styles.statRow, i < stats.topRestaurants.length - 1 && { borderBottomWidth: 1, borderBottomColor: border }]}
          >
            <View style={styles.statLeft}>
              <Text style={[styles.rankNum, { color: textMuted }]}>{i + 1}</Text>
              <Text style={[styles.statLabel, { color: textPrimary }]}>{r.name}</Text>
            </View>
            <Text style={[styles.statCount, { color: primary }]}>{r.count.toLocaleString()}</Text>
          </View>
        ))}
        {stats.topRestaurants.length === 0 && (
          <Text style={[styles.emptyText, { color: textMuted }]}>No restaurant data yet</Text>
        )}
      </View>

      <Text style={[styles.sectionTitle, { color: textMuted }]}>TOP MEALS</Text>
      <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
        {stats.topItems.map((item, i) => (
          <View
            key={`${item.name}-${i}`}
            style={[styles.statRow, i < stats.topItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: border }]}
          >
            <View style={[styles.statLeft, { flex: 1 }]}>
              <Text style={[styles.rankNum, { color: textMuted }]}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.statLabel, { color: textPrimary }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.statMeta, { color: textMuted }]}>{item.restaurantName}</Text>
              </View>
            </View>
            <Text style={[styles.statCount, { color: primary }]}>{item.count.toLocaleString()}</Text>
          </View>
        ))}
        {stats.topItems.length === 0 && (
          <Text style={[styles.emptyText, { color: textMuted }]}>No meal data yet</Text>
        )}
      </View>

      <Text style={[styles.sectionTitle, { color: textMuted }]}>RECENT ACTIVITY</Text>
      <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
        {stats.recent.slice(0, 50).map((e, i) => (
          <View
            key={e.id}
            style={[styles.recentRow, i < Math.min(stats.recent.length, 50) - 1 && { borderBottomWidth: 1, borderBottomColor: border }]}
          >
            <View style={[styles.eventDot, { backgroundColor: primary }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.recentEvent, { color: textPrimary }]}>
                {EVENT_LABELS[e.event] ?? e.event}
              </Text>
              {(e.restaurantName || e.itemName) && (
                <Text style={[styles.recentMeta, { color: textMuted }]} numberOfLines={1}>
                  {[e.restaurantName, e.itemName].filter(Boolean).join(" · ")}
                </Text>
              )}
            </View>
            {e.createdAt && (
              <Text style={[styles.recentTime, { color: textMuted }]}>
                {new Date(e.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            )}
          </View>
        ))}
        {stats.recent.length === 0 && (
          <Text style={[styles.emptyText, { color: textMuted }]}>No recent activity</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loginContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  loginCard: { width: "100%", maxWidth: 360, borderRadius: 20, borderWidth: 1, padding: 28, alignItems: "center", gap: 8 },
  loginIconWrap: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  loginTitle: { fontFamily: "Inter_700Bold", fontSize: 22 },
  loginSubtitle: { fontFamily: "Inter_400Regular", fontSize: 14, marginBottom: 12 },
  passwordInput: { width: "100%", borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontFamily: "Inter_400Regular", fontSize: 15, marginTop: 4 },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#dc2626", alignSelf: "flex-start" },
  loginBtn: { width: "100%", paddingVertical: 14, borderRadius: 14, alignItems: "center", marginTop: 4 },
  loginBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: "#fff" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  pageTitle: { fontFamily: "Inter_700Bold", fontSize: 26 },
  pageSubtitle: { fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 2 },
  logoutBtn: { padding: 10, borderRadius: 20, borderWidth: 1 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1, marginBottom: 8, marginTop: 8 },
  card: { borderRadius: 16, borderWidth: 1, marginBottom: 20, overflow: "hidden" },
  statRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  statLeft: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 12 },
  statLabel: { fontFamily: "Inter_500Medium", fontSize: 14 },
  statMeta: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 },
  statCount: { fontFamily: "Inter_700Bold", fontSize: 16 },
  rankNum: { fontFamily: "Inter_600SemiBold", fontSize: 13, width: 22 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", padding: 20 },
  recentRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  eventDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  recentEvent: { fontFamily: "Inter_500Medium", fontSize: 13 },
  recentMeta: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 },
  recentTime: { fontFamily: "Inter_400Regular", fontSize: 11, flexShrink: 0 },
});
