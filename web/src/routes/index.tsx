/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { Home } from '@/features/home'

const OpenRouterReplicaPage = lazy(() =>
  import('@/features/home/components/openrouter-replica-page').then(
    (module) => ({ default: module.OpenRouterReplicaPage })
  )
)

function HomeRoute() {
  const { t } = useTranslation()
  const local =
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname)
  const reference =
    local &&
    new URLSearchParams(window.location.search).get('replica') === 'openrouter'
  if (reference) {
    return (
      <Suspense fallback={<div className='p-8'>{t('Loading...')}</div>}>
        <OpenRouterReplicaPage />
      </Suspense>
    )
  }
  return <Home />
}

export const Route = createFileRoute('/')({
  component: HomeRoute,
})
