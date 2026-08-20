import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Platform,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface Props {
  visible: boolean;
  onAgree: () => void;
  onDecline: () => void;
}

export function AiConsentModal({ visible, onAgree, onDecline }: Props) {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const c = isDark ? Colors.dark : Colors.light;
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDecline}
    >
      <View style={[styles.container, { backgroundColor: c.background, paddingTop: topPad, paddingBottom: bottomPad }]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.iconWrap, { backgroundColor: Colors.brand.primary + "15" }]}>
            <Ionicons name="shield-checkmark" size={36} color={Colors.brand.primary} />
          </View>

          <Text style={[styles.title, { color: c.textPrimary }]}>AI Data Sharing</Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            Before using AI features, please review how your data is used.
          </Text>

          <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]}>
            <View style={styles.row}>
              <Ionicons name="server-outline" size={18} color={Colors.brand.primary} style={styles.rowIcon} />
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: c.textPrimary }]}>Third-party AI service</Text>
                <Text style={[styles.rowDesc, { color: c.textSecondary }]}>
                  Your questions, menu photos, and the meal details used for comparisons are sent to OpenAI (openai.com) to generate educational food guidance.
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: c.border }]} />

            <View style={styles.row}>
              <Ionicons name="document-text-outline" size={18} color={Colors.brand.primary} style={styles.rowIcon} />
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: c.textPrimary }]}>What is shared</Text>
                <Text style={[styles.rowDesc, { color: c.textSecondary }]}>
                  Text questions you type, menu photos, restaurant or meal names, listed ingredients/nutrition, and dietary preferences (for example, low-carb goals).
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: c.border }]} />

            <View style={styles.row}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.brand.primary} style={styles.rowIcon} />
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: c.textPrimary }]}>Please do not include sensitive health details</Text>
                <Text style={[styles.rowDesc, { color: c.textSecondary }]}>
                  Avoid sharing your name, contact details, glucose readings, medication doses, medical records, or other identifying health information in AI questions or menu photos.
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: c.border }]} />

            <View style={styles.row}>
              <Ionicons name="information-circle-outline" size={18} color={Colors.brand.primary} style={styles.rowIcon} />
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: c.textPrimary }]}>Not medical advice</Text>
                <Text style={[styles.rowDesc, { color: c.textSecondary }]}>
                  AI responses are general education, not a diagnosis, glucose prediction, or treatment plan. For urgent symptoms, seek local emergency help; for personal decisions, consult your care team.
                </Text>
              </View>
            </View>
          </View>

          <Text style={[styles.policyNote, { color: c.textMuted }]}>
            By tapping “I Agree”, you consent to this processing. AI results may be incomplete or wrong—verify restaurant nutrition and ingredients before relying on them. You can stop using AI features at any time.
          </Text>

          <Pressable
            style={[styles.agreeBtn, { backgroundColor: Colors.brand.primary }]}
            onPress={onAgree}
          >
            <Ionicons name="checkmark-circle" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.agreeBtnText}>I Agree — Enable AI Features</Text>
          </Pressable>

          <Pressable style={styles.declineBtn} onPress={onDecline}>
            <Text style={[styles.declineBtnText, { color: c.textMuted }]}>No Thanks</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    alignItems: "center",
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  card: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
    alignItems: "flex-start",
  },
  rowIcon: {
    marginTop: 1,
  },
  rowText: { flex: 1 },
  rowLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  rowDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  divider: { height: 1, marginHorizontal: 16 },
  policyNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 17,
    marginBottom: 24,
  },
  agreeBtn: {
    width: "100%",
    borderRadius: 14,
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  agreeBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  declineBtn: { paddingVertical: 10 },
  declineBtnText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});
