/**
 * / — the front door. Signed-out visitors see the landing page; signed-in
 * users go straight to the live feed.
 */

import { Navigate } from 'react-router-dom'
import { useAuthStatus } from 'deepspace'
import OctolensLanding from '../components/landing/OctolensLanding'

export default function Index() {
  const { isLoaded, isSignedIn } = useAuthStatus()

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-muted-foreground">
        Loading...
      </div>
    )
  }

  return isSignedIn ? <Navigate to="/mentions" replace /> : <OctolensLanding />
}
