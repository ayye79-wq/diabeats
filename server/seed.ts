import { db } from "./db";
import { restaurants, menuItems } from "./schema";
import { RESTAURANTS } from "../data/restaurants";

export async function seedIfEmpty(): Promise<void> {
  const existing = await db.select().from(restaurants).limit(1);
  if (existing.length > 0) return;

  console.log("Database empty — seeding restaurants and menu items...");

  for (const r of RESTAURANTS) {
    await db.insert(restaurants).values({
      id: r.id,
      name: r.name,
      cuisine: r.cuisine,
      address: r.address,
      distance: r.distance,
      rating: r.rating,
      reviewCount: r.reviewCount,
      priceLevel: r.priceLevel,
      phone: r.phone,
      lat: r.lat,
      lng: r.lng,
      tags: r.tags,
    });

    for (const m of r.menuItems) {
      await db.insert(menuItems).values({
        id: m.id,
        restaurantId: r.id,
        name: m.name,
        description: m.description,
        category: m.category,
        price: m.price,
        diabeticScore: m.diabeticScore,
        carbRange: m.carbRange,
        nutrients: m.nutrients as any,
        quickTip: m.quickTip,
      });
    }
  }

  console.log(`Seeded ${RESTAURANTS.length} restaurants with ${RESTAURANTS.reduce((n, r) => n + r.menuItems.length, 0)} menu items.`);
}
