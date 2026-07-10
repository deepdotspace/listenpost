/**
 * Collection Schemas
 *
 * All collections with columns and RBAC permissions.
 * Single source of truth — imported by both worker and frontend.
 *
 * Add schemas by creating a file in src/schemas/ and importing it here.
 */

import type { CollectionSchema } from 'deepspace/worker'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { aiChatSchemas } from './schemas/ai-chat-schema'
import { keywordsSchema } from './schemas/keywords-schema'
import { mentionsSchema } from './schemas/mentions-schema'
import { alertRulesSchema } from './schemas/alert-rules-schema'
import { webhookEndpointsSchema } from './schemas/webhook-endpoints-schema'
import { apiKeysSchema } from './schemas/api-keys-schema'
import { notificationTargetsSchema } from './schemas/notification-targets-schema'
import { digestsSchema } from './schemas/digests-schema'
import { sourcesStateSchema } from './schemas/sources-state-schema'
import { workspacesSchema } from './schemas/workspaces-schema'

export const schemas: CollectionSchema[] = [
  ...aiChatSchemas,
  usersSchema,
  settingsSchema,
  keywordsSchema,
  mentionsSchema,
  alertRulesSchema,
  webhookEndpointsSchema,
  apiKeysSchema,
  notificationTargetsSchema,
  digestsSchema,
  sourcesStateSchema,
  workspacesSchema,
]
