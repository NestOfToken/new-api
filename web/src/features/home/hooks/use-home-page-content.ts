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
import i18next from 'i18next'
import { useEffect, useState } from 'react'

import { isHttpUrl } from '@/lib/content-format'
import { handleServerError } from '@/lib/handle-server-error'

import { getHomePageContent } from '../api'
import type { HomePageContentResult } from '../types'

const STORAGE_KEY = 'home_page_content'

/**
 * Hook to load and manage custom home page content
 * Supports both Markdown/HTML content and iframe URLs
 */
export function useHomePageContent(): HomePageContentResult {
  const [page, setPage] = useState(() => {
    const cached = localStorage.getItem(STORAGE_KEY)
    return { content: cached ?? '', isLoaded: cached !== null }
  })

  useEffect(() => {
    let mounted = true

    const loadContent = async () => {
      try {
        const response = await getHomePageContent()
        const { success, data } = response

        if (!mounted) return

        if (success && data) {
          setPage({ content: data, isLoaded: true })
          localStorage.setItem(STORAGE_KEY, data)
        } else {
          // An empty value is a known default homepage, distinct from no cache.
          setPage({ content: '', isLoaded: true })
          localStorage.setItem(STORAGE_KEY, '')
        }
      } catch (error) {
        if (!mounted) return
        handleServerError(error, i18next.t('Failed to load home page content'))
      } finally {
        if (mounted) {
          setPage((current) =>
            current.isLoaded ? current : { ...current, isLoaded: true }
          )
        }
      }
    }

    loadContent()

    return () => {
      mounted = false
    }
  }, [])

  const isUrl = isHttpUrl(page.content)

  return { content: page.content, isLoaded: page.isLoaded, isUrl }
}
