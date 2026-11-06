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
import { toast } from 'sonner'
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

async function renderSignIn(
  status: Record<string, unknown> = {},
  entry = '/sign-in?redirect=%2Fpricing'
) {
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
      mode: search.mode === 'register' ? ('register' as const) : undefined,
      aff: typeof search.aff === 'string' ? search.aff : undefined,
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
      initialEntries: [entry],
    }),
    defaultViewTransition: publicAuthViewTransition,
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await screen.findByRole('heading', {
    name:
      entry.includes('mode=register') &&
      status.register_enabled !== false &&
      !status.self_use_mode_enabled
        ? 'Create an account'
        : 'Welcome back!',
  })
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
  expect(screen.queryByRole('tab', { name: 'Sign up' })).not.toBeInTheDocument()
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

it('switches forms in place with the keyboard, retaining artwork and redirect without retaining entered passwords', async () => {
  const router = await renderSignIn({ register_enabled: true })
  const art = document.querySelector('.lf-sign-in-art')
  const user = userEvent.setup()
  await user.type(
    screen.getByLabelText('Password', { exact: true }),
    'local-login-password'
  )
  screen.getByRole('tab', { name: 'Sign in' }).focus()
  await user.keyboard('{ArrowRight}{Enter}')
  expect(
    await screen.findByRole('heading', { name: 'Create an account' })
  ).toBeVisible()
  expect(screen.getByRole('tab', { name: 'Sign up' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  expect(screen.queryByLabelText('Username or Email')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute(
    'autocomplete',
    'new-password'
  )
  expect(document.querySelector('.lf-sign-in-art')).toBe(art)
  expect(router.state.location.pathname).toBe('/sign-in')
  expect(router.state.location.search.redirect).toBe('/pricing')
  await user.click(screen.getByRole('tab', { name: 'Sign in' }))
  expect(await screen.findByLabelText('Username or Email')).toBeVisible()
  expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('')
  expect(screen.queryByLabelText('Confirm password')).not.toBeInTheDocument()
  expect(document.querySelector('.lf-sign-in-art')).toBe(art)
})

it('registers through the existing endpoint after consent and returns to login while preserving the destination', async () => {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true } })
  const router = await renderSignIn(
    { register_enabled: true, user_agreement_enabled: true },
    '/sign-in?mode=register&redirect=%2Fpricing&aff=invite-test'
  )
  const user = userEvent.setup()
  await user.type(
    screen.getByLabelText('Username', { exact: true }),
    'registration-user'
  )
  await user.type(
    screen.getByLabelText('Password', { exact: true }),
    'registration-password'
  )
  await user.type(
    screen.getByLabelText('Confirm password'),
    'registration-password'
  )
  expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()
  expect(post).not.toHaveBeenCalled()
  await user.click(screen.getByRole('checkbox'))
  await user.click(screen.getByRole('button', { name: 'Create account' }))
  expect(
    await screen.findByRole('heading', { name: 'Welcome back!' })
  ).toBeVisible()
  expect(post).toHaveBeenCalledExactlyOnceWith(
    '/api/user/register',
    expect.objectContaining({
      username: 'registration-user',
      password: 'registration-password',
      aff_code: 'invite-test',
    }),
    { params: { turnstile: '' } }
  )
  expect(router.state.location.search.redirect).toBe('/pricing')
  expect(screen.queryByLabelText('Confirm password')).not.toBeInTheDocument()
  expect(useAuthStore.getState().auth.user).toBeNull()
})

it.each([{ register_enabled: false }, { self_use_mode_enabled: true }])(
  'keeps a directly linked registration mode unavailable when registration is disabled: %j',
  async (status) => {
    await renderSignIn(status, '/sign-in?mode=register')
    expect(
      screen.queryByRole('tab', { name: 'Sign up' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Create account' })
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Username or Email')).toBeVisible()
  }
)

it('keeps email verification required in the combined registration panel', async () => {
  const post = vi.spyOn(api, 'post')
  const error = vi.spyOn(toast, 'error')
  await renderSignIn(
    { register_enabled: true, email_verification: true },
    '/sign-in?mode=register'
  )
  const user = userEvent.setup()
  await user.type(
    screen.getByLabelText('Username', { exact: true }),
    'email-user'
  )
  await user.type(
    screen.getByLabelText('Password', { exact: true }),
    'registration-password'
  )
  await user.type(
    screen.getByLabelText('Confirm password'),
    'registration-password'
  )
  await user.type(
    screen.getByLabelText('Email (required for verification)'),
    'test@example.invalid'
  )
  expect(screen.getByLabelText('Verification code')).toHaveAttribute(
    'autocomplete',
    'one-time-code'
  )
  await user.click(screen.getByRole('button', { name: 'Create account' }))
  await waitFor(() =>
    expect(error).toHaveBeenCalledWith('Please enter the verification code')
  )
  expect(post).not.toHaveBeenCalled()
  expect(
    screen.getByRole('heading', { name: 'Create an account' })
  ).toBeVisible()
})

it('keeps registration blocked while an enabled human check has no token', async () => {
  const post = vi.spyOn(api, 'post')
  await renderSignIn(
    {
      register_enabled: true,
      turnstile_check: true,
      turnstile_site_key: 'test-site-key',
    },
    '/sign-in?mode=register'
  )
  const create = screen.getByRole('button', { name: 'Create account' })
  expect(create).toBeDisabled()
  await userEvent.setup().click(create)
  expect(post).not.toHaveBeenCalled()
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
