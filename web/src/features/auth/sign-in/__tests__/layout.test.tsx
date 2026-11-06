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
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { SignIn } from '..'
import { PublicRibbonProvider } from '../../components/public-ribbon-provider'
import { publicAuthViewTransition } from '../../lib/public-auth-motion'

let client: QueryClient

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  useSystemConfigStore.getState().setLoading(false)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: {} } })
})

afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
  localStorage.clear()
})

async function renderSignIn(status: Record<string, unknown> = {}) {
  client.setQueryData(['status'], status)
  const root = createRootRoute({
    component: () => (
      <PublicRibbonProvider>
        <Outlet />
      </PublicRibbonProvider>
    ),
  })
  const auth = createRoute({
    getParentRoute: () => root,
    id: '(auth)',
    component: Outlet,
  })
  const login = createRoute({
    getParentRoute: () => auth,
    path: 'sign-in',
    component: SignIn,
    validateSearch: (search: Record<string, unknown>) => ({
      redirect:
        typeof search.redirect === 'string' ? search.redirect : undefined,
    }),
  })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <h1>Homepage destination</h1>,
  })
  const router = createRouter({
    routeTree: root.addChildren([auth.addChildren([login]), home]),
    history: createMemoryHistory({
      initialEntries: ['/sign-in?redirect=%2Fpricing'],
    }),
    defaultViewTransition: publicAuthViewTransition,
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await screen.findByRole('heading', { name: 'Welcome back!' })
  return router
}

it('opens a directly linked login with a focused heading, password-manager fields and a usable static artwork fallback', async () => {
  const router = await renderSignIn()
  expect(screen.getByRole('heading', { name: 'Welcome back!' })).toHaveFocus()
  expect(screen.getByLabelText('Username or Email')).toHaveAttribute(
    'autocomplete',
    'username'
  )
  expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute(
    'autocomplete',
    'current-password'
  )
  expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute(
    'href',
    '/'
  )
  expect(document.querySelector('.lf-sign-in-fallback')).toHaveAttribute(
    'src',
    '/images/lftech/api-ribbon.webp'
  )
  expect(router.state.location.search).toEqual({ redirect: '/pricing' })
})

it('allows keyboard playback control and returns home without submitting a login', async () => {
  const post = vi.spyOn(api, 'post')
  const router = await renderSignIn()
  const user = userEvent.setup()
  const pause = screen.getByRole('button', { name: 'Pause animation' })
  pause.focus()
  await user.keyboard('{Enter}')
  expect(
    screen.getByRole('button', { name: 'Resume animation' })
  ).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('link', { name: 'Back to home' }))
  expect(
    await screen.findByRole('heading', { name: 'Homepage destination' })
  ).toBeVisible()
  expect(router.state.location.pathname).toBe('/')
  expect(post).not.toHaveBeenCalled()
})

it('keeps legal-consent enforcement and sends the original password login contract from the new layout', async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: false, message: 'Invalid username or password' },
  })
  await renderSignIn({
    user_agreement_enabled: true,
    privacy_policy_enabled: true,
  })
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Username or Email'), 'layout-user')
  await user.type(
    screen.getByLabelText('Password', { exact: true }),
    'regression-password'
  )
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(post).not.toHaveBeenCalled()
  await user.click(screen.getByRole('checkbox'))
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  await waitFor(() =>
    expect(post).toHaveBeenCalledExactlyOnceWith(
      '/api/user/login?turnstile=',
      { username: 'layout-user', password: 'regression-password' },
      { skipAuthRefresh: true }
    )
  )
  expect(useAuthStore.getState().auth.user).toBeNull()
})

it('preserves configured alternative login methods when password login and registration are disabled', async () => {
  await renderSignIn({
    password_login_enabled: false,
    register_enabled: false,
    passkey_login: true,
    github_oauth: true,
    discord_oauth: true,
  })
  expect(screen.queryByLabelText('Username or Email')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: 'Sign up' })
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Sign in with Passkey' })
  ).toBeVisible()
  expect(
    screen.getByRole('button', { name: /Continue with GitHub/ })
  ).toBeVisible()
  expect(
    screen.getByRole('button', { name: /Continue with Discord/ })
  ).toBeVisible()
})

it('keeps direct navigation functional with reduced motion and repeated browser history changes', async () => {
  const router = await renderSignIn()
  await act(async () => {
    await router.navigate({ to: '/' })
  })
  expect(
    await screen.findByRole('heading', { name: 'Homepage destination' })
  ).toBeVisible()
  await act(async () => {
    router.history.back()
  })
  expect(
    await screen.findByRole('heading', { name: 'Welcome back!' })
  ).toHaveFocus()
  expect(router.state.location.search).toEqual({ redirect: '/pricing' })
})
