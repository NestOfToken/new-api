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
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import { AuthLayout } from '@/features/auth/auth-layout'
import { resolveSystemLogo } from '@/lib/system-branding'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { Footer } from '../components/footer'
import { SystemBrand } from '../components/system-brand'

const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})
afterEach(() => {
  cleanup()
  client.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  localStorage.clear()
})

it('shows the customer brand in auth and console layouts when cached config and status still use the upstream default', async () => {
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  useSystemConfigStore
    .getState()
    .setConfig({ systemName: 'New API', logo: '/logo.png' })
  useSystemConfigStore.getState().setLoading(false)
  client.setQueryData(['status'], { system_name: 'New API' })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <>
          <AuthLayout>
            <p>Account form</p>
          </AuthLayout>
          <SystemBrand variant='inline' />
        </>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  expect(await screen.findByRole('heading', { name: '睿元云' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Go to home' })).toHaveTextContent(
    '睿元云'
  )
  for (const image of screen.getAllByRole('img')) {
    expect(image).toHaveAttribute('src', '/images/ruiyuan/key-mark.svg')
  }
  expect(screen.queryByText('New API')).not.toBeInTheDocument()
})

it('resolves inherited logos to the key while preserving explicitly configured artwork', () => {
  expect(resolveSystemLogo('/logo.png')).toBe('/images/ruiyuan/key-mark.svg')
  expect(resolveSystemLogo('/images/lftech/brand-mark.svg')).toBe(
    '/images/ruiyuan/key-mark.svg'
  )
  expect(resolveSystemLogo('https://brand.example/custom.svg')).toBe(
    'https://brand.example/custom.svg'
  )
  expect(resolveSystemLogo('/uploads/team-logo.svg')).toBe(
    '/uploads/team-logo.svg'
  )
})

it.each(['', '<p>Customer footer</p>'])(
  'shows the ICP registration instead of upstream attribution when footer HTML is %s',
  async (footerHtml) => {
    useSystemConfigStore.getState().setConfig({ footerHtml })
    client.setQueryData(['status'], {
      user_agreement_enabled: true,
      privacy_policy_enabled: true,
    })
    const router = createRouter({
      routeTree: createRootRoute({
        component: () => <Footer copyright='All rights reserved' />,
      }),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )
    const registration = await screen.findByRole('link', {
      name: '渝ICP备2026029137',
    })
    expect(registration).toHaveAttribute('href', 'https://beian.miit.gov.cn/')
    expect(registration).toHaveAttribute('target', '_blank')
    expect(registration).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.queryByText('New API')).not.toBeInTheDocument()
    expect(screen.queryByText('QuantumNous')).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'User Agreement' })
    ).toHaveAttribute('href', '/user-agreement')
    expect(
      screen.getByRole('link', { name: 'Privacy Policy' })
    ).toHaveAttribute('href', '/privacy-policy')
    if (footerHtml) {
      expect(screen.getByText('Customer footer')).toBeVisible()
    } else {
      expect(
        screen.getByText(
          `© ${new Date().getFullYear()} 睿元云 All rights reserved`
        )
      ).toBeVisible()
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    }
  }
)
