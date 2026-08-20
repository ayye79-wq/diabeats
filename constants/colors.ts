const brand = {
  primary: "#166534",
  primaryLight: "#22C55E",
  primaryDark: "#0E2016",
  accent: "#F59E0B",
  accentLight: "#FEF3C7",

  good: "#16A34A",
  goodLight: "#DCFCE7",
  goodText: "#14532D",

  caution: "#D97706",
  cautionLight: "#FEF9C3",
  cautionText: "#78350F",

  avoid: "#DC2626",
  avoidLight: "#FEE2E2",
  avoidText: "#7F1D1D",

  background: "#F7FDF9",
  cardBg: "#FFFFFF",
  border: "#E2F0E8",

  textPrimary: "#0F2217",
  textSecondary: "#4B6957",
  textMuted: "#8BA898",

  tabBar: "#FFFFFF",
  tint: "#166534",
  tabIconDefault: "#8BA898",
  tabIconSelected: "#166534",
};

export default {
  light: brand,
  dark: {
    ...brand,
    background: "#0B1810",
    cardBg: "#111F16",
    border: "#1E3328",
    textPrimary: "#E8F5EC",
    textSecondary: "#7BBF90",
    textMuted: "#4A6B55",
    tabBar: "#0B1810",
    tabIconDefault: "#4A6B55",
  },
  brand,
};
