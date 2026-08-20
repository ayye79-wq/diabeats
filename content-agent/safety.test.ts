import assert from "node:assert/strict";
import test from "node:test";
import { CONTENT_DISCLAIMER, validateContent } from "./safety";
import type { ContentPackage } from "./types";

const safe: ContentPackage = { id: "x", createdAt: new Date().toISOString(), status: "draft", topic: "fiber", hook: "Try this ordering question", voiceover: "Restaurant nutrition varies. Compare fiber and total carbohydrate information, verify the portion, and use your own care plan.", scenes: [{ seconds: 5, onScreenText: "Check the portion", visual: "menu" }, { seconds: 5, onScreenText: "Compare nutrients", visual: "labels" }, { seconds: 5, onScreenText: "Verify", visual: "DiabEats app" }], caption: "Make a more informed food choice.", hashtags: ["#DiabEats", "#DiabetesEducation"], disclaimer: CONTENT_DISCLAIMER, callToAction: "Explore options in DiabEats" };

test("accepts cautious educational content", () => assert.deepEqual(validateContent(safe), []));
test("rejects cure claims", () => assert.ok(validateContent({ ...safe, caption: "This cures diabetes" }).length > 0));
test("rejects medication instructions", () => assert.ok(validateContent({ ...safe, voiceover: "Stop taking insulin before this meal" }).length > 0));
