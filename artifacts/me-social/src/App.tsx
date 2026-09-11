import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import ComponentsPreview from '@/pages/components-preview';
import UnderstandingDementia from '@/pages/understanding-dementia';
import About from '@/pages/about';

const queryClient = new QueryClient();

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/about" component={About} />
        
        {/* App Shell Routes */}
        <Route>
          <ThemeProvider>
            <SimpleViewProvider>
              <AppLayout>
                <Switch>
                  <Route path="/" component={HomeFeed} />
                  <Route path="/explore" component={Explore} />
                  <Route path="/groups" component={Groups} />
                  <Route path="/messages" component={Messages} />
                  <Route path="/me" component={MePage} />
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
