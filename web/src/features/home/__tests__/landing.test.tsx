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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { Home } from '..'

let client: QueryClient
let homeContent = ''

beforeEach(() => {
  localStorage.clear()
  homeContent = ''
  vi.stubEnv('VITE_LFTECH_SALES_URL', '')
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  useSystemConfigStore.getState().setLoading(false)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    let data: unknown = ''
    if (url === '/api/home_page_content') data = homeContent
    if (url === '/api/status') {
      data = {
        system_name: 'New API',
        docs_link: 'https://docs.example.com/start',
      }
    }
    return { data: { success: true, data } }
  })
})

afterEach(async () => {
  cleanup()
  client.clear()
  vi.unstubAllEnvs()
  await i18next.changeLanguage('en')
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  localStorage.clear()
})

async function renderHome() {
  const router = createRouter({
    routeTree: createRootRoute({ component: Home }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  if (!homeContent) {
    await screen.findByRole('heading', { name: /Bring AI model capabilities/ })
  }
  return router
}

describe('enterprise homepage', () => {
  it('shows the cached default homepage immediately while the return refresh is pending', async () => {
    localStorage.setItem('home_page_content', '')
    let release = () => {}
    const refresh = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/api/home_page_content') await refresh
      return { data: { success: true, data: '' } }
    })
    try {
      await renderHome()
      expect(
        screen.getByRole('heading', { name: /Bring AI model capabilities/ })
      ).toBeVisible()
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    } finally {
      release()
    }
  })

  it('presents model access, model selection, balance and usage before the API examples', async () => {
    await renderHome()
    const sections = [...document.querySelectorAll('#home-content > section')]
    expect(sections.map((section) => section.id)).toEqual([
      '',
      'models',
      'integration',
      'start',
    ])
    const products = screen.getByRole('region', {
      name: /One entry point.*More possibilities/,
    })
    expect(within(products).getAllByRole('article')).toHaveLength(4)
    const details = within(products).getAllByRole('button', {
      name: 'View details',
    })
    expect(details.map((link) => link.getAttribute('href'))).toEqual([
      '/#integration',
      '/#usage',
    ])
    expect(document.querySelectorAll('.lf-optical-light')).toHaveLength(2)
  })

  it('provides a unified authentication entry and routes other actions to models and integration docs', async () => {
    await renderHome()
    expect(
      within(screen.getByRole('banner')).getByRole('link', { name: /麟飞科技/ })
    ).toHaveAttribute('href', '/')
    expect(screen.getAllByRole('link', { name: 'New API' })).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'QuantumNous' })).toHaveAttribute(
      'href',
      'https://github.com/QuantumNous'
    )
    const registration = await screen.findAllByRole('button', {
      name: 'Sign in / Register',
    })
    for (const link of registration) {
      expect(link).toHaveAttribute('href', '/sign-in')
    }
    expect(
      document.querySelectorAll(
        '#home-content a[href="/sign-in"], a[href="/sign-up"]'
      )
    ).toHaveLength(0)
    expect(
      screen.queryByRole('button', { name: 'Sign in' })
    ).not.toBeInTheDocument()
    for (const link of screen.getAllByRole('button', {
      name: 'Read the integration guide',
    })) {
      expect(link).toHaveAttribute('href', 'https://docs.example.com/start')
    }
    for (const link of screen.getAllByRole('button', {
      name: 'View models and pricing',
    })) {
      expect(link).toHaveAttribute('href', '/pricing')
    }
    for (const link of screen.getAllByTitle('Sales contact coming soon')) {
      expect(link).toHaveAttribute('aria-disabled', 'true')
      expect(link).toHaveTextContent('Sales contact coming soon')
    }
    expect(
      screen.getByText(
        'Example data only. These are not real customer records.'
      )
    ).toBeVisible()
  })

  it('opens the configured enterprise WeChat destination for sales', async () => {
    vi.stubEnv('VITE_LFTECH_SALES_URL', 'https://work.weixin.qq.com/example')
    await renderHome()
    const links = await screen.findAllByRole('button', {
      name: 'Contact sales',
    })
    for (const link of links) {
      expect(link).toHaveAttribute('href', 'https://work.weixin.qq.com/example')
    }
  })

  it('directs an authenticated customer to the dashboard', async () => {
    useAuthStore.getState().auth.setUser({
      id: 1,
      username: 'customer',
      role: 1,
      quota: 100,
      used_quota: 0,
      request_count: 0,
    })
    await renderHome()
    const links = await screen.findAllByRole('button', {
      name: 'Go to Dashboard',
    })
    for (const link of links) expect(link).toHaveAttribute('href', '/dashboard')
    expect(
      screen.queryByRole('button', { name: 'Sign in / Register' })
    ).not.toBeInTheDocument()
  })

  it('switches protocol examples with the keyboard and preserves explicit Claude request fields', async () => {
    const user = userEvent.setup()
    await renderHome()
    const chat = await screen.findByRole('tab', { name: 'Chat' })
    chat.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Responses' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(
      screen.getByText('/v1/responses', { selector: 'code' })
    ).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Claude' }))
    expect(screen.getByText('/v1/messages', { selector: 'code' })).toBeVisible()
    expect(screen.getByText('"max_tokens"')).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Gemini' }))
    expect(
      screen.getByText('/v1beta/models/{model}:generateContent', {
        selector: 'code',
      })
    ).toBeVisible()
  })

  it('closes the mobile menu after choosing a homepage section', async () => {
    const user = userEvent.setup()
    const router = await renderHome()
    const menu = await screen.findByRole('button', {
      name: 'Toggle navigation menu',
    })
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    await user.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    const panel = document.querySelector<HTMLElement>(
      '#public-mobile-navigation'
    )
    expect(panel).not.toBeNull()
    if (!panel) throw new Error('Mobile navigation is missing')
    await user.click(within(panel).getByRole('link', { name: 'Usage' }))
    await waitFor(() => expect(router.state.location.hash).toBe('usage'))
    expect(menu).toHaveAttribute('aria-expanded', 'false')
  })

  it('lets customers switch application needs without changing the API example', async () => {
    const user = userEvent.setup()
    await renderHome()
    const needs = screen.getByRole('tablist', { name: 'Application needs' })
    await user.click(
      within(needs).getByRole('tab', { name: 'Understanding and analysis' })
    )
    expect(
      screen.getByText(
        'Explore models and integration options that fit your tasks.'
      )
    ).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await user.click(
      within(needs).getByRole('tab', { name: 'Choose as you need' })
    )
    expect(
      screen.getByText('Find model availability and pricing in the catalog.')
    ).toBeVisible()
    for (const link of screen.getAllByRole('button', {
      name: 'View models and pricing',
    })) {
      expect(link).toHaveAttribute('href', '/pricing')
    }
  })

  it('keeps the unified entry in the header without adding another inside the mobile menu', async () => {
    const user = userEvent.setup()
    await renderHome()
    await user.click(
      screen.getByRole('button', { name: 'Toggle navigation menu' })
    )
    const navigation = document.querySelector<HTMLElement>(
      '#public-mobile-navigation'
    )
    expect(navigation).not.toBeNull()
    if (!navigation) throw new Error('Mobile navigation is missing')
    expect(
      within(navigation).queryByRole('button', { name: 'Sign in / Register' })
    ).not.toBeInTheDocument()
    for (const link of within(screen.getByRole('banner')).getAllByRole(
      'button',
      { name: 'Sign in / Register' }
    )) {
      expect(link).toHaveAttribute('href', '/sign-in')
    }
  })

  it('preserves the configured custom homepage URL and its sandbox', async () => {
    homeContent = 'https://example.com/customer-home'
    await renderHome()
    const iframe = await screen.findByTitle('Custom Home Page')
    expect(iframe).toHaveAttribute('src', homeContent)
    expect(iframe).toHaveAttribute(
      'sandbox',
      expect.stringContaining('allow-top-navigation-by-user-activation')
    )
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(
      screen.queryByRole('heading', { name: 'Bring AI model capabilities' })
    ).not.toBeInTheDocument()
  })

  it('updates homepage copy when the interface language changes', async () => {
    i18next.addResourceBundle('zh', 'translation', {
      'Keep building.': '调用在继续，',
      'Keep usage in sight.': '用量心中有数。',
    })
    await renderHome()
    await screen.findByRole('heading', {
      name: /Keep building.*Keep usage in sight/,
    })
    await act(() => i18next.changeLanguage('zh'))
    expect(
      screen.getByRole('heading', { name: /调用在继续，.*用量心中有数。/ })
    ).toBeVisible()
  })
})
