/**
 * App — global providers + shell.
 *
 * Generouted renders this around all routes.
 * Providers → auth gate → workspace scope → nav + page outlet.
 *
 * Scope layout (multi-tenant):
 *   RecordProvider (auth + ScopeRegistry, allowAnonymous)
 *     RecordScope app:octolens-clone   — users, workspaces, api_keys, settings
 *       WorkspaceProvider              — selection, create, invite (app-room reads)
 *         RecordScope ws:<workspaceId> — keywords, mentions, alerts, digests, AI chats
 *           AppShell → routed page
 *
 * The two scopes register DISJOINT collection sets (src/workspace-schemas.ts),
 * so hooks resolve unambiguously: tenant collections hit the inner ws room,
 * app-room collections fall through the ScopeRegistry to the outer scope.
 */

import { Suspense, type ReactNode } from 'react'
import { Outlet, useLocation, useRouteError } from 'react-router-dom'
import { DeepSpaceAuthProvider, useAuth, useAuthStatus } from 'deepspace'
import { RecordProvider, RecordScope } from 'deepspace'
import { ErrorScreen } from '../components/ErrorScreen'
import { ToastProvider } from '@/components/ui'
import AppShell from '../components/AppShell'
import { WorkspaceProvider, useWorkspace } from '../components/WorkspaceProvider'
import { WorkspaceOnboarding } from '../components/WorkspaceOnboarding'
import { APP_NAME, SCOPE_ID } from '../constants'
import { APP_ROOM_SCHEMAS, WORKSPACE_ROOM_SCHEMAS } from '../workspace-schemas'

/**
 * URL prefixes of the (protected) route group — the folder name doesn't
 * appear in URLs, so the workspace gate needs the list spelled out. Keep in
 * sync with src/pages/(protected)/*.tsx.
 */
const PROTECTED_PREFIXES = [
  '/mentions',
  '/keywords',
  '/alerts',
  '/analytics',
  '/assistant',
  '/api-keys',
  '/api-status',
  '/settings',
  '/admin',
]

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
                <Suspense fallback={<Loading />}>
                  <Outlet />
                </Suspense>
              </main>
            ) : (
              <WorkspaceGate pathname={pathname}>
                <AppShell>
                  <Suspense fallback={<Loading />}>
                    <Outlet />
                  </Suspense>
                </AppShell>
              </WorkspaceGate>
            )}
          </div>
        </AuthBoot>
      </DeepSpaceAuthProvider>
    </ToastProvider>
  )
}

function Loading() {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>
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
      <RecordScope roomId={SCOPE_ID} schemas={APP_ROOM_SCHEMAS} appId={APP_NAME}>
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </RecordScope>
    </RecordProvider>
  )
}

/**
 * Mounts the per-tenant RecordScope (`ws:<workspaceId>`) around the routed
 * content once a signed-in user has a workspace. Signed-out visitors and
 * public pages render without it — the (protected) layout's AuthGate still
 * handles the sign-in wall. A signed-in user with zero workspaces gets the
 * onboarding screen on protected pages instead of the outlet.
 */
function WorkspaceGate({ pathname, children }: { pathname: string; children: ReactNode }) {
  const { isSignedIn } = useAuth()
  const { currentId, loading } = useWorkspace()
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))

  // Signed-out: landing/pricing/etc. must render without any workspace.
  if (!isSignedIn) return <>{children}</>

  if (currentId) {
    return (
      // key: switching workspaces tears the scope (and page state) down
      // cleanly instead of resubscribing a live socket to a new room.
      <RecordScope
        key={currentId}
        roomId={`ws:${currentId}`}
        schemas={WORKSPACE_ROOM_SCHEMAS}
        appId={APP_NAME}
      >
        {children}
      </RecordScope>
    )
  }

  // Signed in, no workspace: public pages still work; protected pages get
  // onboarding (never a ws RecordScope with a null id).
  if (!isProtected) return <>{children}</>
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading...
      </div>
    )
  }
  return <WorkspaceOnboarding />
}
