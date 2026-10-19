import { getFormatConfig } from "./locale-format";

/**
 * Canonical reviewed English strings. Regional locales share this bundle.
 * Do not add another natural language through a fallback or machine-generated
 * dictionary: its full interface and moderation release gates must pass first.
 * Existing non-extracted interface copy remains canonical English.
 */
export const englishMessages = {
  Home: "Home", Explore: "Explore", Reels: "Reels", Memories: "Memories",
  "My Circle": "My Circle", Groups: "Groups", Messages: "Messages", Alerts: "Alerts", Me: "Me",
  "Language, data and drafts": "Language, data and drafts",
  "Country resources": "Country resources", "Save settings": "Save settings",
  "Try again": "Try again", "Original": "Original", "Machine translation": "Machine translation",
  "Load image": "Load image", "Play audio": "Play audio", "Play video": "Play video",
} as const;
export type InterfaceKey = keyof typeof englishMessages;
export function interfaceText(key: keyof typeof englishMessages): string {
  const locale = getFormatConfig().locale;
  if (!["en-AU", "en-GB", "en-US"].includes(locale)) return englishMessages[key];
  return englishMessages[key];
}
