export type TextScreeningResult = { decision: "allowed" | "held"; reasons: string[] };
export type TextScreener = (text: string) => TextScreeningResult;
const riskyTerms = ["kill yourself", "how to poison", "buy stolen", "credit card dump"];
/** Deterministic baseline only; it is not a third-party safety integration. */
export const deterministicTextScreening: TextScreener = (text) => {
  const normalized = text.toLocaleLowerCase();
  const reasons = riskyTerms.filter((term) => normalized.includes(term)).map((term) => `matched:${term}`);
  return { decision: reasons.length ? "held" : "allowed", reasons };
};
export type MediaScreening = (input: { objectPath: string; contentType: string }) => Promise<TextScreeningResult>;
export function requireMediaScreening(screen: MediaScreening | undefined): "held" | "pending" { return screen ? "pending" : "held"; }