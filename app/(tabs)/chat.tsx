import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  Platform,
  useColorScheme,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { fetch } from "expo/fetch";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { getApiSession } from "@/lib/api-session";
import { useSubscription } from "@/context/SubscriptionContext";
import { useAiConsent } from "@/context/AiConsentContext";
import { chatEventSchema } from "@/shared/ai-safety";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  urgent?: boolean;
}

let messageCounter = 0;
function generateUniqueId(): string {
  messageCounter++;
  return `msg-${Date.now()}-${messageCounter}-${Math.random().toString(36).substr(2, 9)}`;
}

function TypingIndicator({ c }: { c: typeof Colors.light }) {
  return (
    <View style={[styles.bubble, styles.assistantBubble, { backgroundColor: c.cardBg, borderColor: c.border }]}>
      <View style={styles.typingDots}>
        <View style={[styles.dot, { backgroundColor: c.textMuted }]} />
        <View style={[styles.dot, { backgroundColor: c.textMuted }]} />
        <View style={[styles.dot, { backgroundColor: c.textMuted }]} />
      </View>
    </View>
  );
}

function MessageBubble({ message, c }: { message: Message; c: typeof Colors.light }) {
  const isUser = message.role === "user";
  return (
    <View style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow]}>
      {!isUser && (
        <View style={[styles.avatar, { backgroundColor: c.primary }]}>
          <Ionicons name="leaf" size={14} color="#fff" />
        </View>
      )}
       <View
        style={[
          styles.bubble,
          isUser
            ? [styles.userBubble, { backgroundColor: c.primary }]
             : [styles.assistantBubble, message.urgent ? { backgroundColor: Colors.brand.avoidLight, borderColor: Colors.brand.avoid } : { backgroundColor: c.cardBg, borderColor: c.border }],
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            { color: isUser ? "#fff" : c.textPrimary },
          ]}
        >
          {message.content}
        </Text>
      </View>
    </View>
  );
}

const SUGGESTED_PROMPTS = [
  "What foods keep blood sugar stable?",
  "Best low-carb restaurant options?",
  "How does glycemic index work?",
  "Tips for eating out with diabetes?",
];

const FOLLOW_UP_PROMPTS = [
  "Tell me more",
  "What should I avoid?",
  "Any restaurant tips?",
  "What about snacks?",
];

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const c = isDark ? Colors.dark : Colors.light;
  const isWeb = Platform.OS === "web";

  const { isPremium, canAskAi, aiQuestionsToday, AI_QUESTION_LIMIT, showPaywall, incrementAiQuestion } = useSubscription();
  const { requestConsent } = useAiConsent();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
    };
  }, []);

  const topPadding = isWeb ? 67 : insets.top;
  const bottomPadding = isWeb ? 34 : insets.bottom;

  const questionsLeft = AI_QUESTION_LIMIT - aiQuestionsToday;
  const hasMessages = messages.length > 0;

  const lastMessage = messages[messages.length - 1];
  const showFollowUps = hasMessages && lastMessage?.role === "assistant" && !isStreaming;

  function handleNewChat() {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setMessages([]);
    setInput("");
    setShowTyping(false);
    setIsStreaming(false);
  }

  async function handleSend(text?: string) {
    const content = (text ?? input).trim();
    if (!content || isStreaming) return;

    if (!canAskAi) {
      showPaywall("ai-limit");
      return;
    }

    const agreed = await requestConsent();
    if (!agreed) return;

    setInput("");

    const currentMessages = [...messages];
    const userMessage: Message = {
      id: generateUniqueId(),
      role: "user",
      content,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);
    setShowTyping(true);
    const controller = new AbortController();
    requestControllerRef.current = controller;

    try {
      const baseUrl = getApiUrl();
      const session = await getApiSession(baseUrl);
      const chatHistory = [
        ...currentMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content },
      ];

      const response = await fetch(`${baseUrl}api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ messages: chatHistory }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("Failed to get response");
      incrementAiQuestion();

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";
      let assistantAdded = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = chatEventSchema.parse(JSON.parse(data));
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.content) {
              fullContent += parsed.content;

              if (!assistantAdded) {
                setShowTyping(false);
                setMessages((prev) => [
                  ...prev,
                  {
                    id: generateUniqueId(),
                    role: "assistant",
                    content: fullContent,
                    urgent: parsed.urgent,
                  },
                ]);
                assistantAdded = true;
              } else {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: fullContent,
                    urgent: parsed.urgent,
                  };
                  return updated;
                });
              }
            }
          } catch (parseErr) {
            throw parseErr;
          }
        }
      }
      if (!assistantAdded) throw new Error("The assistant returned an empty response");
    } catch {
      setShowTyping(false);
      if (!controller.signal.aborted) {
        setMessages((prev) => [
          ...prev,
          {
            id: generateUniqueId(),
            role: "assistant",
            content: "Sorry, I couldn't connect. Please try again.",
          },
        ]);
      }
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setIsStreaming(false);
        setShowTyping(false);
      }
    }
  }

  const reversedMessages = [...messages].reverse();
  const inputLocked = !canAskAi && !isStreaming;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.background }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <View
        style={[
          styles.header,
          { paddingTop: topPadding + 12, backgroundColor: c.background, borderBottomColor: c.border },
        ]}
      >
        <View style={styles.headerLeft}>
          <View style={[styles.headerIcon, { backgroundColor: c.primary + "18" }]}>
            <Ionicons name="leaf" size={18} color={c.primary} />
          </View>
          <Text style={[styles.headerTitle, { color: c.textPrimary }]}>AI Assistant</Text>
        </View>
        <View style={styles.headerRight}>
          {!isPremium && (
            <Pressable
              style={[styles.limitBadge, questionsLeft <= 1 ? { backgroundColor: Colors.brand.avoidLight } : { backgroundColor: c.cardBg, borderColor: c.border, borderWidth: 1 }]}
              onPress={() => showPaywall("ai-limit")}
            >
              <Text style={[styles.limitBadgeText, { color: questionsLeft <= 1 ? Colors.brand.avoidText : c.textMuted }]}>
                {questionsLeft > 0 ? `${questionsLeft} left` : "Limit reached"}
              </Text>
            </Pressable>
          )}
          {isPremium && (
            <View style={[styles.premiumBadge, { backgroundColor: Colors.brand.goodLight }]}>
              <Ionicons name="shield-checkmark" size={12} color={Colors.brand.primary} />
              <Text style={[styles.premiumBadgeText, { color: Colors.brand.primary }]}>Premium</Text>
            </View>
          )}
          {hasMessages && (
            <Pressable
              style={[styles.newChatBtn, { backgroundColor: c.cardBg, borderColor: c.border }]}
              onPress={handleNewChat}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={
                isStreaming
                  ? "Stop the response and start a new conversation"
                  : "Start a new conversation"
              }
              accessibilityHint={
                isStreaming
                  ? "Cancel the current Assistant response"
                  : undefined
              }
            >
              <Ionicons name="create-outline" size={18} color={c.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      {!hasMessages ? (
        <View style={[styles.emptyContainer, { paddingBottom: bottomPadding + 80 }]}>
          <View style={[styles.emptyIcon, { backgroundColor: c.primary + "14" }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={36} color={c.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>
            Ask me anything
          </Text>
          <Text style={[styles.emptySubtitle, { color: c.textSecondary }]}>
             Get educational guidance about dining out with diabetes
          </Text>
          {!isPremium && (
            <Pressable
              style={[styles.upgradeChip, { backgroundColor: Colors.brand.primary + "14", borderColor: Colors.brand.primary + "40", borderWidth: 1 }]}
              onPress={() => showPaywall("ai-limit")}
            >
              <Ionicons name="shield-checkmark-outline" size={14} color={Colors.brand.primary} />
              <Text style={[styles.upgradeChipText, { color: Colors.brand.primary }]}>
                {questionsLeft} of {AI_QUESTION_LIMIT} free questions · Upgrade for unlimited
              </Text>
            </Pressable>
          )}
          <Text style={[styles.suggestionsLabel, { color: c.textMuted }]}>Quick questions</Text>
          <View style={styles.suggestionsGrid}>
            {SUGGESTED_PROMPTS.map((prompt) => (
              <Pressable
                key={prompt}
                style={[styles.suggestionChip, { backgroundColor: c.cardBg, borderColor: c.border }]}
                onPress={() => handleSend(prompt)}
              >
                <Text style={[styles.suggestionText, { color: c.textSecondary }]}>{prompt}</Text>
                <Ionicons name="arrow-forward" size={14} color={c.textMuted} />
              </Pressable>
            ))}
          </View>
          {canAskAi ? (
            <Pressable
              onPress={() => inputRef.current?.focus()}
              style={styles.orLabelRow}
              hitSlop={12}
            >
              <Text style={[styles.orLabel, { color: c.textMuted }]}>or type your own question below</Text>
              <Ionicons name="arrow-down" size={13} color={c.textMuted} />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => showPaywall("ai-limit")}
              style={[styles.limitReachedRow, { backgroundColor: Colors.brand.avoidLight }]}
            >
              <Ionicons name="lock-closed" size={13} color={Colors.brand.avoidText} />
              <Text style={[styles.orLabel, { color: Colors.brand.avoidText, marginBottom: 0 }]}>Daily limit reached — tap to upgrade</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <FlatList
          data={reversedMessages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} c={c} />}
          inverted={hasMessages}
          ListHeaderComponent={
            <>
              {showTyping && <TypingIndicator c={c} />}
              {showFollowUps && (
                <View style={styles.followUpRow}>
                  {FOLLOW_UP_PROMPTS.map((p) => (
                    <Pressable
                      key={p}
                      style={[styles.followUpChip, { backgroundColor: c.cardBg, borderColor: c.border }]}
                      onPress={() => handleSend(p)}
                    >
                      <Text style={[styles.followUpText, { color: c.textSecondary }]}>{p}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          }
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
        />
      )}

      {inputLocked ? (
        <View style={[styles.lockedInputContainer, { backgroundColor: c.background, borderTopColor: c.border, paddingBottom: bottomPadding + 8 }]}>
          {hasMessages && (
            <Pressable
              style={[styles.newChatRow, { backgroundColor: c.cardBg, borderColor: c.border }]}
              onPress={handleNewChat}
            >
              <Ionicons name="create-outline" size={16} color={c.textSecondary} />
              <Text style={[styles.newChatRowText, { color: c.textSecondary }]}>New conversation</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.unlockRow, { backgroundColor: Colors.brand.primary }]}
            onPress={() => showPaywall("ai-limit")}
          >
            <Ionicons name="shield-checkmark" size={18} color="#fff" />
            <Text style={styles.unlockText}>Upgrade to ask more questions</Text>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>
      ) : (
        <View
          style={[
            styles.inputContainer,
            {
              backgroundColor: c.background,
              borderTopColor: c.border,
              paddingBottom: bottomPadding + 8,
            },
          ]}
        >
          <Text style={[styles.aiDisclaimer, { color: c.textMuted }]}>
            {isStreaming
              ? "Getting your answer…"
              : "General education only · Not medical advice or urgent care"}
          </Text>
          <View style={[styles.inputRow, { backgroundColor: c.cardBg, borderColor: c.border }]}>
            <TextInput
              ref={inputRef}
              style={[styles.textInput, { color: c.textPrimary }]}
              placeholder="Type your question..."
              placeholderTextColor={c.textMuted}
              accessibilityLabel="Message the AI Assistant"
              accessibilityHint="Type a question about dining out with diabetes"
              value={input}
              onChangeText={setInput}
              multiline
              blurOnSubmit={false}
              onSubmitEditing={() => {
                handleSend();
                inputRef.current?.focus();
              }}
              editable={!isStreaming}
            />
            <Pressable
              style={[
                styles.sendButton,
                {
                  backgroundColor:
                    input.trim() && !isStreaming ? c.primary : c.border,
                },
              ]}
              onPress={() => {
                handleSend();
                inputRef.current?.focus();
              }}
              disabled={!input.trim() || isStreaming}
              testID="send-button"
              accessibilityRole="button"
              accessibilityLabel={isStreaming ? "Assistant is responding" : "Send message"}
              accessibilityState={{ disabled: !input.trim() || isStreaming, busy: isStreaming }}
            >
              {isStreaming ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="arrow-up" size={18} color="#fff" />
              )}
            </Pressable>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  limitBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  limitBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  premiumBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  newChatBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  upgradeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 20,
  },
  upgradeChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  suggestionsLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  suggestionsGrid: {
    width: "100%",
    gap: 8,
    marginBottom: 14,
  },
  suggestionChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  suggestionText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  orLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginBottom: 4,
  },
  orLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  limitReachedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  followUpRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  followUpChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  followUpText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  messageList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageRow: {
    flexDirection: "row",
    marginVertical: 4,
    alignItems: "flex-end",
  },
  userRow: {
    justifyContent: "flex-end",
  },
  assistantRow: {
    justifyContent: "flex-start",
    gap: 8,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    borderWidth: 1,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  typingDots: {
    flexDirection: "row",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    opacity: 0.6,
  },
  lockedInputContainer: {
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  newChatRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  newChatRowText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  unlockRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  unlockText: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  aiDisclaimer: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    textAlign: "center",
    marginBottom: 6,
    letterSpacing: 0.1,
  },
  inputContainer: {
    borderTopWidth: 1,
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderWidth: 1,
    borderRadius: 14,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    maxHeight: 100,
    lineHeight: 20,
    paddingTop: 4,
    paddingBottom: 4,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
