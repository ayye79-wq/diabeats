import { canonicalizeRotationPackageIds } from "./rotation";

export type GenerationState = {
  recentTopics: string[];
  recentRotationPackageIds: string[];
};

export const EMPTY_GENERATION_STATE: GenerationState = {
  recentTopics: [],
  recentRotationPackageIds: [],
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

export function parseGenerationState(value: unknown): GenerationState {
  if (!value || typeof value !== "object") return { ...EMPTY_GENERATION_STATE };
  const source = value as { recentTopics?: unknown; recentRotationPackageIds?: unknown };
  return {
    recentTopics: stringArray(source.recentTopics).slice(0, 30),
    recentRotationPackageIds: canonicalizeRotationPackageIds(
      Array.isArray(source.recentRotationPackageIds) ? source.recentRotationPackageIds : [],
    ),
  };
}

export function serializeGenerationState(state: GenerationState): string {
  return JSON.stringify(parseGenerationState(state), null, 2);
}