/**
 * /landing — always shows the marketing page (even signed-in), useful for
 * previewing. Signed-out visitors get it at / via index.tsx.
 */

import OctolensLanding from '../components/landing/OctolensLanding'

export default function LandingRoute() {
  return <OctolensLanding />
}
