/**
 * Navigation Config
 *
 * Add one entry per nav item. Routes are handled by generouted
 * (file-based routing in src/pages/), this just controls what
 * appears in the navigation bar.
 */

import type { Role } from './constants'

export interface NavItem {
  path: string
  label: string
  roles?: Role[]
  devOnly?: boolean
}

export const nav: NavItem[] = [
  { path: '/home', label: 'Home' },
  { path: '/mentions', label: 'Mentions' },
  { path: '/keywords', label: 'Keywords' },
  { path: '/api-status', label: 'API Status', devOnly: true },
  { path: '/settings', label: 'Settings' },
  // ── Features add nav items below this line ──
  { path: '/admin', label: 'Admin', roles: ['admin' as Role] },
  { path: '/assistant', label: 'AI Chat', roles: ['member' as Role] },
]
