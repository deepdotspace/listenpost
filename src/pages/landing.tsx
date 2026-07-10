/**
 * /landing — always shows the marketing page (even signed-in), useful for
 * previewing. Signed-out visitors get it at / via index.tsx.
 */

import ListenpostLanding from '../components/landing/ListenpostLanding'

export default function LandingRoute() {
  return <ListenpostLanding />
}
