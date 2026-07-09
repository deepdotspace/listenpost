/**
 * App — global providers + shell.
 *
 * Generouted renders this around all routes.
 * Providers → auth gate → nav + page outlet.
 */

import { Suspense, type ReactNode } from 'react'
import { Outlet, useLocation, useRouteError } from 'react-router-dom'
import { DeepSpaceAuthProvider, useAuthStatus } from 'deepspace'
import { RecordProvider, RecordScope } from 'deepspace'
import { ErrorScreen } from '../components/ErrorScreen'
import { ToastProvider } from '@/components/ui'
import AppShell from '../components/AppShell'
import { APP_NAME, SCOPE_ID } from '../constants'
import { schemas } from '../schemas'

export default function App() {
  const { pathname } = useLocation()
  // The landing page owns the viewport — stacking the app's Navigation on
  // top of the landing's own TopBar reads bolted-on.
  const isLanding = pathname === '/' || pathname === '/landing'

  return (
    <ToastProvider>
      <DeepSpaceAuthProvider>
        <AuthBoot>
          {/* data-testid="app-root" is the canonical "app shell mounted" hook
              every test relies on. Don't rename without updating templates/tests. */}
          <div data-testid="app-root" className="h-screen overflow-hidden bg-background">
            {isLanding ? (
              <main className="h-full overflow-y-auto">
                <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>}>
                  <Outlet />
                </Suspense>
              </main>
            ) : (
              <AppShell>
                <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>}>
                  <Outlet />
                </Suspense>
              </AppShell>
            )}
          </div>
        </AuthBoot>
      </DeepSpaceAuthProvider>
    </ToastProvider>
  )
}

/**
 * Root error boundary. Generouted wires a `_app` `Catch` export to the root
 * route's errorElement, so any render-time crash in a page — a thrown error,
 * or a hooks-rule violation like React #310 — lands here instead of React
 * Router's raw minified screen. ErrorScreen decodes the error for the developer.
 */
export function Catch() {
  const error = useRouteError()
  return <ErrorScreen error={error} />
}

/** Waits for auth to resolve, then mounts the data layer. Distinct from the SDK's `AuthGate`. */
function AuthBoot({ children }: { children: ReactNode }) {
  const { isLoaded } = useAuthStatus()

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-muted-foreground">
        Loading...
      </div>
    )
  }

  return (
    <RecordProvider allowAnonymous>
      <RecordScope roomId={SCOPE_ID} schemas={schemas} appId={APP_NAME}>
        {children}
      </RecordScope>
    </RecordProvider>
  )
}
