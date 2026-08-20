import { apiRequest } from "@/lib/query-client";

export type EventType =
  | "restaurant_viewed"
  | "meal_clicked"
  | "meal_detail_viewed"
  | "meal_saved"
  | "meal_unsaved"
  | "search_query"
  | "order_guide_opened"
  | "ai_question_asked"
  | "best_meal_requested";

export function trackEvent(
  event: EventType,
  data?: {
    restaurantId?: string;
    restaurantName?: string;
    itemId?: string;
    itemName?: string;
    metadata?: Record<string, unknown>;
  }
) {
  apiRequest("POST", "/api/events", { event, ...data }).catch(() => {});
}
