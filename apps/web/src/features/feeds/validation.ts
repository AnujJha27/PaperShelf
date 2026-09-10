import type { FeedInput } from "@paper-radar/shared";

export function normalizeKeywords(value = ""): string[] {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

export function validateFeedInput(input: Pick<FeedInput, "name" | "description">) {
  return {
    ...(input.name.trim() ? {} : { name: "Name is required" }),
    ...(input.description.trim() ? {} : { description: "Description is required" }),
  };
}
