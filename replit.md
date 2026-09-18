# DiabEats

A mobile decision engine helping people with diabetes make smarter restaurant meal choices. Positioned as "Food GPS for Diabetes."

**Version**: 1.3.4 — iOS build 38, with the RevenueCat paywall update and required version bump, is uploaded to App Store Connect and processing for TestFlight; Android version code 8 is on Google Play Closed testing, and code 9 is the Photo Picker-compliant AAB submitted to the Alpha/closed-testing track.

## App Overview

DiabEats helps users with diabetes make smarter eating choices by:
- Onboarding: 4-step setup with optional diabetes type, insulin use, and care-plan carbohydrate target
- Finding nearby restaurants with GPS or manual search
- Health-intent search: "Low carb dinner near me", "Under 30g carbs", etc.
- Menu items rated for diabetic friendliness (Good / Caution / Avoid)
- AI-powered meal analysis explaining glycemic impact
- Educational meal-impact comparisons based on listed nutrition; DiabEats does not predict an individual glucose response
- "How to Order This" guide (order steps / what to ask / what to avoid)
- Saving favorite restaurants and meals
- Meal logging with blood glucose tracking (before/after)
- AI chat assistant with diabetes dining expertise (streaming SSE)
- Menu scanner (camera/gallery → OpenAI Vision → per-item scores)
- "Best Meal Pick" AI recommendation per restaurant (Premium)
- Meal simulator and comparison tools
- Weekly health summary on Profile tab
- Referral system (share referral code for 7 days free Premium)
- Push notifications (daily meal reminders)
- Freemium subscription model via RevenueCat
- Admin dashboard at /admin

## Subscription / Freemium Model

Free tier limits (tracked daily in AsyncStorage):
- 5 AI assistant questions/day
- 3 menu scans/day
- Basic meal scores visible; full AI analysis locked (paywall on meal detail)
- "Best Meal Pick" locked (paywall on restaurant detail)

Premium tier (store-localized monthly and annual prices delivered by RevenueCat):
- Unlimited AI assistant, unlimited scans
- Full AI meal analysis
- Best Meal AI pick on every restaurant page
- Personalized recommendations

Context: `context/SubscriptionContext.tsx` — initializes RevenueCat (EXPO_PUBLIC_RC_IOS_KEY / EXPO_PUBLIC_RC_ANDROID_KEY env vars)
PaywallModal: `components/PaywallModal.tsx` — mounted at root layout level
Demo premium: `enableDemoPremium()` stores `@diabeats_demo_premium=true` in AsyncStorage

## Database

- Static `RESTAURANTS` array in `data/restaurants.ts` is the source of truth
- 20 restaurants: 5 local/ethnic + 15 major chains (Chipotle, Panera, Cava, etc.)
- 70 menu items — each with good/caution/avoid score, carb range, nutrients, order steps
- PostgreSQL (Drizzle ORM) stores: restaurants, menu_items, orders, referral_clicks, user_events, user_feedback

## Tech Stack

- **Frontend**: Expo Router (React Native) — file-based routing on Expo SDK 57
- **Backend**: Express + TypeScript on port 5000
- **Database**: PostgreSQL via Drizzle ORM
- **AI**: OpenAI via Replit AI Integrations (gpt-4o-mini, gpt-4o for vision)
- **State**: React Context + AsyncStorage for persistence, React Query for server state
- **Location**: expo-location for GPS
- **Notifications**: expo-notifications (configured in app.json plugins)
- **Payments**: RevenueCat (react-native-purchases)
- **Tabs**: Stable Expo Router tabs

## File Structure

```
app/
  _layout.tsx              # Root layout — fonts, providers, onboarding gate
  onboarding.tsx           # 4-step onboarding (optional profile and care-plan target)
  (tabs)/
    _layout.tsx            # NativeTabs / Classic tab layout
    index.tsx              # Discover — health search + restaurant browse
    scan.tsx               # Menu scanner (camera/gallery + AI vision)
    saved.tsx              # Saved restaurants/meals + meal logs
    chat.tsx               # AI diabetes dining assistant (streaming)
    profile.tsx            # Health profile, weekly summary, settings
  restaurant/[id].tsx      # Restaurant detail with menu items
  meal/[restaurantId]/[itemId].tsx  # Meal detail with AI analysis
  meal-simulator.tsx       # Blood sugar impact simulator
  compare.tsx              # Side-by-side meal comparison
  safe-nearby.tsx          # GPS-based nearby safe meals
  log-outcome.tsx          # Log blood glucose outcome after eating
  report.tsx               # Weekly dining health report
  admin.tsx                # Admin dashboard (feedback, events)

context/
  AppContext.tsx            # Saved items, meal log, onboarding, referral code
  SubscriptionContext.tsx   # RevenueCat, usage limits, paywall state

components/
  RestaurantCard.tsx        # Restaurant listing card
  ScoreTag.tsx              # Diabetic score badge (Good/Caution/Avoid)
  PaywallModal.tsx          # Subscription paywall
  SimulatorModal.tsx        # Meal simulator modal
  ShareOrderCard.tsx        # Shareable order card
  ErrorBoundary.tsx         # App crash recovery
  ErrorFallback.tsx         # Crash UI
  KeyboardAwareScrollViewCompat.tsx

lib/
  query-client.ts           # React Query client + API request helper
  notifications.ts          # Daily reminder scheduling (expo-notifications)
  mealInsights.ts           # Blood sugar impact helpers
  trackEvent.ts             # Event tracking

server/
  index.ts                  # Express server (port 5000)
  routes.ts                 # All API routes
  db.ts                     # Drizzle + pg connection
  schema.ts                 # DB schema
  openai.ts                 # OpenAI client
  seed.ts                   # Data seeder

constants/
  colors.ts                 # Color palette (forest green theme)
```

## API Endpoints

- `GET /api/restaurants` — all restaurants with menu items
- `GET /api/restaurants/:id` — single restaurant
- `POST /api/search` — health-intent AI search
- `POST /api/meal-analysis` — AI meal analysis (Premium)
- `POST /api/scan-menu` — AI menu vision scan
- `POST /api/best-meal` — AI best meal recommendation (Premium)
- `GET /api/confidence/:itemId` — community confidence count
- `POST /api/log-event` — user event tracking
- `POST /api/user-feedback` — feedback submission
- `POST /api/request-restaurant` — restaurant request
- `GET/POST /api/admin/*` — admin dashboard

## Design

- **Theme**: Deep forest green primary (#166534), bright green accent (#22C55E), warm amber (#F59E0B)
- **BioTrace labels**: Better choice, Moderate impact, Higher impact, Not enough information
- **Meal guidance**: Educational comparisons based on available nutrition and ingredients; DiabEats does not predict an individual glucose response.

### USDA FoodData Central fallback

- Configuration: `USDA_API_KEY`
- Adapter: `server/services/usda-food-data.ts`
- Coverage: USDA normalization and fallback tests in `tests/biotrace-universal.test.ts`
- Cache freshness values: `fresh-cache` and `stale-cache`
- **Font**: Inter (400, 500, 600, 700)
- **Background**: Warm light (#F7FDF9) / Dark (#0B1810)
- **Dark mode**: Fully supported via useColorScheme()

## App Store Configuration (app.json)

- Bundle ID: `com.diabeats.app`
- Version: `1.3.4`, Build: `38`
- Plugins: expo-router, expo-font, expo-web-browser, expo-location, expo-notifications
- iOS permissions: Camera, Photo Library, Location, Notifications
- Privacy: `ITSAppUsesNonExemptEncryption: false`

## Known Warnings (Non-Critical)

- `[expo-notifications] Listening to push token changes is not yet fully supported on web` — expected on web
- `props.pointerEvents is deprecated` — from third-party library, not our code
- `The Geocoding API has been removed in SDK 49` — web-only; device geocoding works on iOS; safely caught in try-catch

---

## Recent Changes & Pending Actions

### Landing Page (server/templates/landing-page.html) — completed, deploy Replit to push live

Changes made to diabeatsapp.com:
- Fixed `APP_NAME_PLACEHOLDER` in nav → now shows "DiabEats"
- Nav CTA "Get the App" → "Download Free" (links directly to App Store)
- Hero primary button "Scan QR to Open App" → "Download on the App Store" (links to App Store)
- Hero secondary button "Try Web Demo" → "Android Coming Soon"
- Added social proof row below hero buttons: ★★★★★ 5.0 · 83+ users eating smarter · 🎁 7-day free trial on Premium
- Added 3-card testimonials section (before the Feedback form)
- Download section subtext updated to mention free trial

### In-App Paywall (components/PaywallModal.tsx) — completed, needs new app build

Changes made to the premium upgrade screen:
- Store prices, annual savings, and intro-offer language come from the current RevenueCat package on iOS and Android instead of hardcoded copy.
- Web and Expo Go do not show invented store prices or allow a purchase attempt; a signed native build supplies the live store package.
- Purchase actions use the selected RevenueCat package, keeping the iOS and Android store product identifiers platform-specific.

### Store trial configuration

RevenueCat currently reports a one-week introductory trial for the App Store monthly product. It does not report a trial for the App Store annual product or either Google Play product, so the app only shows an intro offer when the active store package supplies one.

**App Store Connect (iOS):**
1. App Store Connect → Your App → Subscriptions
2. Select the monthly or annual subscription product → Add Introductory Offer → Free Trial → choose the desired duration → Save
4. No new build needed — goes live within minutes

**Google Play Console (Android):**
1. Subscriptions → select the monthly or annual product → Add free trial → choose the desired duration → Save
3. No new build needed

RevenueCat picks up the trial automatically once it's set in the stores.

### Closed Testing Requirement (Android)

Before Google Play production launch: need 12 testers on the Internal/Closed track for 14 days.
- User posted TikTok asking for testers at `partners@diabeatsapp.com`
- Current status: version 1.3.4 / code 8 remains documented as the prior Closed/alpha testing release, with 12 or more testers opted in for the required 14-day period. Version code 9 is the verified Photo Picker-compliant AAB submitted to Alpha; the older code 2 releases on other tracks still need Play Console cleanup.
- Android package name: `com.diabeats.android`

### Current RevenueCat snapshot (2026-08-22)
- 1 active subscription and 0 active trials
- $6 MRR, and $6.99 revenue over the last 28 days
- 17 new customers and 19 active users over the last 28 days
- The current offering has monthly and annual packages mapped for the App Store, Google Play, and RevenueCat Test Store
- App Store ID: `6760898764`
