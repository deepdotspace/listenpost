/**
 * Navigation Config
 *
 * Grouped sidebar navigation. Routes are handled by generouted
 * (file-based routing in src/pages/), this just controls what appears
 * in the app shell's sidebar and how it's grouped.
 */

import {
  Activity,
  BarChart3,
  Inbox,
  KeyRound,
  Send,
  Settings,
  Shield,
  Sparkles,
  Tags,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from './constants'

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  roles?: Role[]
  devOnly?: boolean
}

export interface NavGroup {
  /** Uppercase micro-label above the group; null for the ungrouped top set. */
  label: string | null
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: 'Monitor',
    items: [
      { path: '/mentions', label: 'Mentions', icon: Inbox },
      { path: '/analytics', label: 'Analytics', icon: BarChart3 },
      { path: '/assistant', label: 'Assistant', icon: Sparkles, roles: ['member' as Role] },
    ],
  },
  {
    label: 'Configure',
    items: [
      { path: '/keywords', label: 'Keywords', icon: Tags },
      { path: '/alerts', label: 'Delivery', icon: Send },
      { path: '/api-keys', label: 'API', icon: KeyRound },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { path: '/settings', label: 'Settings', icon: Settings },
      { path: '/admin', label: 'Admin', icon: Shield, roles: ['admin' as Role] },
      { path: '/cron-log', label: 'Crawler', icon: Activity, roles: ['admin' as Role] },
    ],
  },
]

/** Flat list, for anything that still wants the old shape. */
export const nav: NavItem[] = navGroups.flatMap((g) => g.items)
