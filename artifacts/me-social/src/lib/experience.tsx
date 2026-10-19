import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useAuth } from "@clerk/react";
import { getGetAccountSummaryQueryKey } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_PREFS, experienceKeys, fetchPrefs, patchPrefs, useCatalogue, type Catalogue, type ExperiencePrefs } from "@/lib/experience-api";
import { setFormatConfig } from "@/lib/locale-format";
import { endAccountSession, hasEncryptedDraft, hasKey, listenForCleanup, setActiveUser, wipeDrafts, wipeEncryptedOnly } from "@/lib/draft-store";

interface Ctx {
  prefs: ExperiencePrefs;
  loaded: boolean;
  userId: string | null;
  catalogue?: Catalogue;
  dir: "ltr" | "rtl";
  lang: string;
  /** True when photos, audio, video, avatars and thumbnails must not be requested until the member asks. */
  mediaGated: boolean;
  update: (patch: Partial<ExperiencePrefs>) => Promise<ExperiencePrefs>;
  saving: boolean;
  loadError: boolean;
  retryPreferences: () => void;
}

const ExperienceContext = createContext<Ctx | null>(null);
const ENGLISH = ["en-AU", "en-GB", "en-US"];

function safeTz(tz: string | undefined) {
  if (!tz) return undefined;
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return tz; } catch { return undefined; }
}

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const uid = isSignedIn ? userId ?? null : null;
  const qc = useQueryClient();
  const prev = useRef<string | null | undefined>(undefined);
  const currentIdentity = useRef(uid);
  currentIdentity.current = uid;

  // Account boundary: generation guards + erase device drafts of the previous account.
  if (prev.current === undefined) { setActiveUser(uid); }
  useEffect(() => {
    if (!isLoaded) return;
    if (prev.current !== undefined && prev.current !== uid) {
      if (prev.current) wipeDrafts(prev.current);
      qc.removeQueries({ queryKey: ["experience"] });
    }
    setActiveUser(uid);
    prev.current = uid;
  }, [isLoaded, uid, qc]);
  useEffect(() => listenForCleanup(), []);

  const prefsQ = useQuery({ queryKey: experienceKeys.prefs(uid), queryFn: fetchPrefs, enabled: !!uid, staleTime: 60000, retry: false });
  const accountStatus = (prefsQ.error as { status?: number } | null)?.status;
  useEffect(() => {
    // 401 can mean a signed-in new identity has not completed app onboarding.
    // Only the authoritative inactive-account response ends its local session.
    if (uid && accountStatus === 403) {
      endAccountSession(uid);
      void qc.invalidateQueries({ queryKey: getGetAccountSummaryQueryKey() });
    }
  }, [uid, accountStatus, qc]);
  const catQ = useCatalogue(!!uid);
  const prefs: ExperiencePrefs = useMemo(() => ({ ...DEFAULT_PREFS, ...(prefsQ.data ?? {}) }), [prefsQ.data]);

  const mut = useMutation({
    mutationFn: ({ patch }: { owner: string; patch: Partial<ExperiencePrefs> }) => patchPrefs(patch),
    onSuccess: (data, variables) => {
      // A delayed response must never populate the next account's preference key.
      if (currentIdentity.current === variables.owner) qc.setQueryData(experienceKeys.prefs(variables.owner), data);
    },
  });

  useEffect(() => {
    if (uid && prefsQ.data && !prefsQ.data.offlineDrafts && (hasEncryptedDraft(uid) || hasKey(uid))) wipeEncryptedOnly(uid);
  }, [uid, prefsQ.data]);

  const catalogue = catQ.data;
  const enabledLocale = catalogue ? catalogue.locales.find(l => l.code === prefs.locale)?.enabled : ENGLISH.includes(prefs.locale);
  const locale = enabledLocale === false || !ENGLISH.includes(prefs.locale) ? "en-AU" : prefs.locale;
  const timeZone = safeTz(prefs.timeZone);
  const dir: "ltr" | "rtl" = prefs.direction === "rtl" ? "rtl" : "ltr"; // 'auto' follows the interface language; only reviewed English is enabled so it is ltr
  const mediaGated = !uid || prefsQ.isError || prefsQ.isLoading || prefs.lowData || prefs.textFirst;

  setFormatConfig(locale, timeZone);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const mutateAsync = mut.mutateAsync;
  const update = useCallback((patch: Partial<ExperiencePrefs>) => {
    if (!uid) return Promise.reject(new Error("Sign in before saving settings"));
    return mutateAsync({ owner: uid, patch });
  }, [mutateAsync, uid]);

  const value: Ctx = {
    prefs, loaded: !!prefsQ.data || !uid, userId: uid, catalogue, dir, lang: locale, mediaGated, update, saving: mut.isPending,
    loadError: prefsQ.isError, retryPreferences: () => { void prefsQ.refetch(); },
  };

  return (
    <ExperienceContext.Provider value={value}>
      <Fragment key={`${uid ?? "anonymous"}|${locale}|${timeZone ?? ""}`}>{children}</Fragment>
    </ExperienceContext.Provider>
  );
}

export function useExperience(): Ctx {
  const c = useContext(ExperienceContext);
  if (!c) throw new Error("useExperience must be used within ExperienceProvider");
  return c;
}
