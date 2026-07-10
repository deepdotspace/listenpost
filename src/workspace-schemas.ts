/**
 * Client-side scope split for multi-tenant workspaces.
 *
 * The APP room (`app:listenpost`) holds the tenancy registry + global
 * account surfaces; each workspace's data lives in its own RecordRoom DO at
 * `ws:<workspaceRecordId>` (see worker.ts `/ws/:roomId`).
 *
 * The two arrays are DISJOINT on purpose: nested `<RecordScope>`s register
 * their collection names in the SDK's ScopeRegistry, and a name registered
 * by both scopes would make hook resolution order-dependent. Keeping the
 * sets disjoint means `useQuery('api_keys')` inside the workspace scope
 * still resolves to the app room via the registry, while
 * `useQuery('mentions')` prefers the local (workspace) scope.
 *
 * `src/schemas.ts` stays the worker-side aggregate (every room DO knows all
 * collections); this file only controls CLIENT scope resolution.
 */

import type { CollectionSchema } from 'deepspace/worker'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { apiKeysSchema } from './schemas/api-keys-schema'
import { workspacesSchema } from './schemas/workspaces-schema'
import { aiChatSchemas } from './schemas/ai-chat-schema'
import { keywordsSchema } from './schemas/keywords-schema'
import { mentionsSchema } from './schemas/mentions-schema'
import { alertRulesSchema } from './schemas/alert-rules-schema'
import { webhookEndpointsSchema } from './schemas/webhook-endpoints-schema'
import { notificationTargetsSchema } from './schemas/notification-targets-schema'
import { digestsSchema } from './schemas/digests-schema'
import { sourcesStateSchema } from './schemas/sources-state-schema'

/** Collections that live in the app room: users, workspaces, api_keys, settings. */
export const APP_ROOM_SCHEMAS: CollectionSchema[] = [
  usersSchema,
  settingsSchema,
  apiKeysSchema,
  workspacesSchema,
]

/** Collections that live in each tenant room (`ws:<workspaceId>`). */
export const WORKSPACE_ROOM_SCHEMAS: CollectionSchema[] = [
  ...aiChatSchemas,
  keywordsSchema,
  mentionsSchema,
  alertRulesSchema,
  webhookEndpointsSchema,
  notificationTargetsSchema,
  digestsSchema,
  sourcesStateSchema,
]
