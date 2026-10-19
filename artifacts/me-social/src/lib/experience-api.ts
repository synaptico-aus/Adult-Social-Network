import {
  getExperienceCatalogue, getExperiencePreferences, updateExperiencePreferences, getExperienceDraft, saveExperienceDraft, deleteExperienceDraft,
  getCountryResources, listTranslations, submitTranslation, reportTranslation, listStaffTranslations, reviewTranslation,
  type ExperienceInput, type ExperienceDraftInput, type TranslationInput,
} from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** Prefer the server's data.error over the (possibly generic) ApiError.message. */
export function errorText(e: unknown, fallback = "Please try again."): string {
  const x = e as { data?: { error?: unknown; message?: unknown }; message?: string } | null;
  if (x?.data && typeof x.data.error === "string" && x.data.error) return x.data.error;
  if (x?.data && typeof x.data.message === "string" && x.data.message) return x.data.message;
  return x?.message || fallback;
}
export const errorStatus = (e: unknown): number | undefined => (e as { status?: number } | null)?.status;

export type Direction = "auto" | "ltr" | "rtl";
export interface LocaleEntry { code: string; label: string; direction: "ltr" | "rtl"; enabled: boolean; reviewedAt?: string | null; reviewNote?: string | null; moderationCoverage?: string | null }
export interface CountryEntry { code: string; name: string }
export interface Catalogue { locales: LocaleEntry[]; countries: CountryEntry[] }
export interface ExperiencePrefs { locale: string; timeZone: string; direction: Direction; lowData: boolean; textFirst: boolean; offlineDrafts: boolean; country: string }
export type DraftAudience = "only_me" | "friends" | "my_circle" | "this_group" | "public";
export interface ServerDraft { body: string; audience: DraftAudience; circleId?: string | null; groupId?: string | null; updatedAt?: string }
export interface CountryResource { id: string; country: string; name: string; kind: "emergency" | "dementia" | "crisis"; phone?: string | null; url?: string | null; sourceUrl?: string | null; hours?: string | null; hoursTimeZone?: string | null; checkedAt?: string | null; notes?: string | null }
export interface CountryResources { country: string; disclaimer: string; items: CountryResource[] }
export type TranslationStatus = "pending" | "reviewed" | "published" | "removed";
export interface Translation { id: string; sourceType: "post" | "lesson"; sourceId: string; sourceHash?: string; locale: string; text: string; machineTranslated: boolean; status: TranslationStatus; createdAt: string; reviewedAt?: string | null; reviewedBy?: string | null; authorMemberId?: string; reviewNote?: string | null; reports?: { reason: string; createdAt: string }[] }
export interface TranslationList { items: Translation[]; providerEnabled: boolean }

export const DEFAULT_PREFS: ExperiencePrefs = { locale: "en-AU", timeZone: "Australia/Sydney", direction: "auto", lowData: true, textFirst: true, offlineDrafts: false, country: "AU" };

export const experienceKeys = {
  catalogue: ["experience", "catalogue"] as const,
  prefs: (uid: string | null | undefined) => ["experience", "preferences", uid ?? "none"] as const,
  countryResources: (c: string) => ["country-resources", c] as const,
  translations: (t: string, id: string) => ["translations", t, id] as const,
  staffTranslations: ["staff", "translations"] as const,
};

export const fetchPrefs = () => getExperiencePreferences() as unknown as Promise<ExperiencePrefs>;
export const patchPrefs = (p: Partial<ExperiencePrefs>) => updateExperiencePreferences(p as ExperienceInput) as unknown as Promise<ExperiencePrefs>;
export const getServerDraft = () => getExperienceDraft() as unknown as Promise<{ draft: ServerDraft | null }>;
export const putServerDraft = (d: ServerDraft) => saveExperienceDraft({ body: d.body, audience: d.audience, circleId: d.circleId ?? null, groupId: d.groupId ?? null } as ExperienceDraftInput) as unknown as Promise<{ draft: ServerDraft | null }>;
export const deleteServerDraft = () => deleteExperienceDraft();

export function useCatalogue(enabled = true) {
  return useQuery({ queryKey: experienceKeys.catalogue, queryFn: () => getExperienceCatalogue() as unknown as Promise<Catalogue>, enabled, staleTime: 300000 });
}

export function useCountryResources(country: string) {
  return useQuery({ queryKey: experienceKeys.countryResources(country), queryFn: () => getCountryResources({ country } as never) as unknown as Promise<CountryResources>, enabled: !!country });
}

export function useTranslations(sourceType: "post" | "lesson", sourceId: string, enabled: boolean) {
  return useQuery({
    queryKey: experienceKeys.translations(sourceType, sourceId),
    queryFn: () => listTranslations({ sourceType, sourceId } as never) as unknown as Promise<TranslationList>,
    enabled, refetchInterval: 5000, refetchOnWindowFocus: true, staleTime: 0, retry: false,
  });
}

export function useProposeTranslation(sourceType: "post" | "lesson", sourceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { locale: string; text: string; machineTranslated: boolean; rightsConfirmed: boolean; correctionOf?: string }) =>
      submitTranslation({ sourceType, sourceId, ...v } as TranslationInput),
    onSuccess: () => qc.invalidateQueries({ queryKey: experienceKeys.translations(sourceType, sourceId) }),
  });
}

export function useReportTranslation() {
  return useMutation({ mutationFn: (v: { id: string; reason: string }) => reportTranslation(v.id, { reason: v.reason }) });
}

export function useStaffTranslations() {
  return useQuery({ queryKey: experienceKeys.staffTranslations, queryFn: () => listStaffTranslations() as unknown as Promise<{ items: Translation[] }>, retry: false, refetchInterval: 5000, refetchOnWindowFocus: true });
}

export function useReviewTranslation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; action: "review" | "publish" | "remove"; note: string }) => reviewTranslation(v.id, { action: v.action, note: v.note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: experienceKeys.staffTranslations }),
  });
}
