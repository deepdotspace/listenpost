// Generouted, changes to this file will be overridden
/* eslint-disable */

import { components, hooks, utils } from '@generouted/react-router/client'

export type Path =
  | `*`
  | `/`
  | `/admin`
  | `/alerts`
  | `/analytics`
  | `/api-keys`
  | `/api-status`
  | `/assistant`
  | `/cron-log`
  | `/home`
  | `/keywords`
  | `/mentions`
  | `/settings`

export type Params = {
  '/*': { '*': string }
}

export type ModalPath = never

export const { Link, Navigate } = components<Path, Params>()
export const { useModals, useNavigate, useParams } = hooks<Path, Params, ModalPath>()
export const { redirect } = utils<Path, Params>()
