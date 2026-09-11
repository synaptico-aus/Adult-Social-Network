import { type ReactNode, useEffect, useRef } from 'react';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

import { ThemeProvider } from '@/components/theme-provider';
import { SimpleViewProvider } from '@/lib/simple-view';
import { AppLayout } from '@/components/layout/app-layout';

import HomeFeed from '@/pages/feed';
import Explore from '@/pages/explore';
import Groups from '@/pages/groups';
import Messages from '@/pages/messages';
import MePage from '@/pages/me-profile';
import ProfileEdit from '@/pages/profile-edit';
import ProfilePreview from '@/pages/profile-preview';
import ThisIsMe from '@/pages/this-is-me';
import ProfilePrivacy from '@/pages/profile-privacy';
import ComponentsPreview from '@/pages/components-preview';
import UnderstandingDementia from '@/pages/understanding-dementia';
import About from '@/pages/about';
import AccountSecurity from '@/pages/account-security';
import Onboarding from '@/pages/onboarding';
import {
  getGetAccountSummaryQueryKey,
  useGetAccountSummary,
} from '@workspace/api-client-react';

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    return addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        queryClient.clear();
      }
      previousUserId.current = userId;
    });
  }, [addListener, queryClient]);

  return null;
}

function RequireMember({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const summary = useGetAccountSummary({
    query: {
      enabled: Boolean(isLoaded && isSignedIn),
      queryKey: getGetAccountSummaryQueryKey(),
    },
  });
  if (!isLoaded) return <div className="p-8 text-center">Loading your account…</div>;
  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-10 text-center">
        <h1 className="font-display text-3xl font-bold">Sign in to continue</h1>
        <p className="mt-3 text-muted-foreground">Your account and content stay private.</p>
        <a className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground" href={`${basePath}/sign-in`}>Sign in</a>
      </div>
    );
  }
  if (summary.isLoading) return <div className="p-8 text-center">Checking your account setup…</div>;
  if (summary.isError) {
    const status = (summary.error as { status?: number } | undefined)?.status;
    if (status === 401) return <div className="p-8 text-center"><a className="text-primary underline" href={`${basePath}/sign-in`}>Sign in to continue</a></div>;
    if (status === 404) return <Onboarding onComplete={() => summary.refetch()} />;
    return <div role="alert" className="mx-auto max-w-xl rounded-3xl border border-destructive/30 bg-card p-8 text-center"><h1 className="font-display text-2xl font-bold">Account unavailable</h1><p className="mt-2 text-muted-foreground">We could not check your account setup.</p><button className="mt-5 rounded-xl border border-border px-4 py-3" onClick={() => summary.refetch()}>Try again</button></div>;
  }
  return <>{children}</>;
}

function SignInPage() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>;
}

function SignUpPage() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}

function HomeRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded || !isSignedIn) return <HomeFeed />;
  return <RequireMember><HomeFeed /></RequireMember>;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/about" component={About} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        
        {/* App Shell Routes */}
        <Route>
          <ThemeProvider>
            <SimpleViewProvider>
              <AppLayout>
                <Switch>
                  <Route path="/" component={HomeRoute} />
                  <Route path="/explore"><RequireMember><Explore /></RequireMember></Route>
                  <Route path="/groups"><RequireMember><Groups /></RequireMember></Route>
                  <Route path="/messages"><RequireMember><Messages /></RequireMember></Route>
                  <Route path="/me"><RequireMember><MePage /></RequireMember></Route>
                  <Route path="/profile/edit"><RequireMember><ProfileEdit /></RequireMember></Route>
                  <Route path="/profile/preview"><RequireMember><ProfilePreview /></RequireMember></Route>
                  <Route path="/this-is-me"><RequireMember><ThisIsMe /></RequireMember></Route>
                  <Route path="/profile/privacy"><RequireMember><ProfilePrivacy /></RequireMember></Route>
                  <Route path="/account/security"><RequireMember><AccountSecurity /></RequireMember></Route>
                  <Route path="/components-preview" component={ComponentsPreview} />
                  <Route path="/understanding-dementia" component={UnderstandingDementia} />
                  <Route component={NotFound} />
                </Switch>
              </AppLayout>
            </SimpleViewProvider>
          </ThemeProvider>
        </Route>
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl}
      appearance={{
        theme: shadcn,
        options: {
          logoPlacement: "inside",
          logoLinkUrl: basePath || "/",
          logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
          socialButtonsPlacement: "bottom",
        },
        variables: {
          colorPrimary: '#ad1029',
          colorForeground: '#252023',
          colorMutedForeground: '#625a5e',
          colorBackground: '#fffaf8',
          colorInput: '#ffffff',
          colorInputForeground: '#252023',
          colorDanger: '#b42318',
          colorNeutral: '#776d72',
          fontFamily: 'DM Sans, sans-serif',
          borderRadius: '0.75rem',
        },
        elements: {
          formButtonPrimary: {
            color: "#ffffff",
            fontWeight: "700",
          },
        },
      }}
      localization={{
        signIn: { start: { title: "Welcome back", subtitle: "Sign in to your private Me account" } },
        signUp: { start: { title: "Create your account", subtitle: "Me is for adults aged 18 and over" } },
      }}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
