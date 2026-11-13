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
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
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
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PublicRibbonProvider } from '@/features/auth/components/public-ribbon-provider'
import type { PricingModel, PricingVendor } from '@/features/pricing/types'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { Home } from '..'
import { LandingModelExplorer } from '../components/landing-model-explorer'
import { useLandingCatalog } from '../hooks/use-landing-catalog'

let client: QueryClient
let homeContent = ''
let catalogModels: string[]
let catalogUnavailable: boolean
let docsLink: string | undefined
let catalogVendors: PricingVendor[]
let catalogAssignments: Record<string, number>
let catalogMetadata: Record<string, Partial<PricingModel>>
let journeyVisibility: (target: Element) => void
let journeyMargin: string | undefined

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(
        private callback: (
          entries: { target: Element; isIntersecting: boolean }[]
        ) => void,
        private options?: IntersectionObserverInit
      ) {}
      observe(target: Element) {
        if (!target.hasAttribute('data-journey-step')) return
        journeyMargin = this.options?.rootMargin
        journeyVisibility = (target) =>
          this.callback([{ target, isIntersecting: true }])
      }
      unobserve() {}
      disconnect() {}
    }
  )
  localStorage.clear()
  homeContent = ''
  catalogUnavailable = false
  docsLink = 'https://docs.example.com/start'
  catalogMetadata = {
    'wan3.0-example': { supported_endpoint_types: ['openai-video'] },
  }
  catalogModels = [
    'gpt-example',
    'gemini-example',
    'deepseek-example',
    'qwen-example',
    'kimi-example',
    'wan3.0-example',
  ]
  catalogVendors = [
    { id: 1, name: 'OpenAI', icon: 'OpenAI' },
    { id: 2, name: 'Google', icon: 'Gemini.Color' },
    { id: 3, name: 'DeepSeek', icon: 'DeepSeek.Color' },
    { id: 4, name: 'Alibaba', icon: 'Qwen.Color' },
    { id: 5, name: 'Moonshot', icon: 'Moonshot' },
    { id: 6, name: 'Empty provider', icon: 'Claude' },
  ]
  catalogAssignments = {
    'gpt-example': 1,
    'gemini-example': 2,
    'deepseek-example': 3,
    'qwen-example': 4,
    'kimi-example': 5,
  }
  vi.stubEnv('VITE_LFTECH_SALES_URL', '')
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  useSystemConfigStore.getState().setLoading(false)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/pricing') {
      if (catalogUnavailable) throw new Error('Catalog unavailable')
      return {
        data: {
          success: true,
          data: catalogModels.map((model_name, id) => ({
            id,
            model_name,
            vendor_id: catalogAssignments[model_name],
            supported_endpoint_types: ['openai'],
            ...catalogMetadata[model_name],
          })),
          vendors: catalogVendors,
        },
      }
    }
    let data: unknown = ''
    if (url === '/api/home_page_content') data = homeContent
    if (url === '/api/status') {
      data = {
        system_name: 'New API',
        docs_link: docsLink,
      }
    }
    return { data: { success: true, data } }
  })
})

afterEach(async () => {
  cleanup()
  client.clear()
  vi.useRealTimers()
  focusManager.setFocused(undefined)
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await i18next.changeLanguage('en')
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  localStorage.clear()
})

async function renderHome() {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <PublicRibbonProvider>
          <Home />
        </PublicRibbonProvider>
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
  if (!homeContent) {
    await screen.findByRole('heading', { name: /More models\./ })
  }
  return router
}

function CatalogFixture() {
  const catalog = useLandingCatalog()
  const [selectedType, setSelectedType] = useState('all')
  const [search, setSearch] = useState('')
  return (
    <LandingModelExplorer
      catalog={catalog}
      selectedType={selectedType}
      onSelectType={setSelectedType}
      search={search}
      onSearchChange={setSearch}
    />
  )
}

describe('enterprise homepage', () => {
  it('shows real totals and turns hero provider inspection into visible search without provider tabs', async () => {
    const user = userEvent.setup()
    await renderHome()
    await waitFor(() => {
      expect(
        screen.getByText('Available models').nextElementSibling
      ).toHaveTextContent('6')
      expect(
        screen.getByText('Model providers').nextElementSibling
      ).toHaveTextContent('5')
    })
    expect(screen.queryByText('800T+')).not.toBeInTheDocument()
    expect(document.querySelector('img[src^="/__reference/"]')).toBeNull()
    await user.click(
      screen.getByRole('button', { name: 'Explore OpenAI models' })
    )
    const filters = screen.getByRole('tablist', {
      name: 'Filter by model type',
    })
    expect(
      within(filters).getByRole('tab', { name: /All models/ })
    ).toHaveAttribute('aria-selected', 'true')
    expect(
      within(filters).queryByRole('tab', { name: /OpenAI/ })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'Search models or providers' })
    ).toHaveValue('OpenAI')
    const list = screen.getByRole('list', { name: 'Models in the catalog' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(within(list).getByText('gpt-example')).toBeVisible()
    expect(within(list).queryByText('gemini-example')).not.toBeInTheDocument()
    expect(screen.queryByText('Empty provider')).not.toBeInTheDocument()
  })

  it('lets keyboard users select output types across providers and excludes video from text', async () => {
    const user = userEvent.setup()
    await renderHome()
    const filters = screen.getByRole('tablist', {
      name: 'Filter by model type',
    })
    await screen.findByText('gpt-example')
    const all = within(filters).getByRole('tab', { name: /All models/ })
    all.focus()
    await user.keyboard('{ArrowRight}')
    expect(
      within(filters).getByRole('tab', { name: /^Text 5$/ })
    ).toHaveAttribute('aria-selected', 'true')
    const list = screen.getByRole('list', { name: 'Models in the catalog' })
    expect(within(list).getByText('qwen-example')).toBeVisible()
    expect(within(list).getByText('gpt-example')).toBeVisible()
    expect(within(list).queryByText('wan3.0-example')).not.toBeInTheDocument()
    await user.keyboard('{ArrowRight}')
    expect(
      within(filters).getByRole('tab', { name: /^Video 1$/ })
    ).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('wan3.0-example')).toBeVisible()
    expect(screen.queryByText('gpt-example')).not.toBeInTheDocument()
  })

  it('counts explicit output types once and combines type filters with searchable provider names', async () => {
    catalogModels = ['vision-reader', 'studio-model', 'movie-model']
    catalogAssignments = {
      'vision-reader': 1,
      'studio-model': 2,
      'movie-model': 2,
    }
    catalogMetadata = {
      'vision-reader': {
        input_modalities: ['image', 'text'],
        output_modalities: ['text'],
      },
      'studio-model': { output_modalities: ['text', 'image', 'image'] },
      'movie-model': { supported_endpoint_types: ['openai-video'] },
    }
    const user = userEvent.setup()
    await renderHome()
    const images = await screen.findByRole('tab', { name: 'Image 1' })
    expect(screen.getByRole('tab', { name: 'Text 2' })).toBeVisible()
    await user.click(images)
    expect(screen.getByText('studio-model')).toBeVisible()
    expect(screen.queryByText('vision-reader')).not.toBeInTheDocument()
    await user.type(
      screen.getByRole('textbox', { name: 'Search models or providers' }),
      'OpenAI'
    )
    expect(
      screen.getByText('No matching models. Try another name.')
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(images).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('studio-model')).toBeVisible()
  })

  it('falls back to all models when live refresh removes the selected type', async () => {
    const user = userEvent.setup()
    await renderHome()
    await user.click(await screen.findByRole('tab', { name: 'Video 1' }))
    catalogModels = ['current-text']
    await act(async () => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    expect(await screen.findByText('current-text')).toBeVisible()
    expect(screen.queryByRole('tab', { name: /Video/ })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'All models 1' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  it('opens a model detail with Enter and restores focus on Escape', async () => {
    const user = userEvent.setup()
    await renderHome()
    const list = await screen.findByRole('list', {
      name: 'Models in the catalog',
    })
    const model = within(list).getByRole('button', { name: /gpt-example/ })
    model.focus()
    await user.keyboard('{Enter}')
    const detail = await screen.findByRole('dialog', { name: 'gpt-example' })
    expect(within(detail).getByText('OpenAI')).toBeVisible()
    expect(
      within(detail).getByRole('button', { name: 'Open model catalog' })
    ).toHaveAttribute('href', '/pricing')
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(model).toHaveFocus()
  })

  it('filters names and providers, provides a no-match recovery and clears search', async () => {
    const user = userEvent.setup()
    await renderHome()
    await screen.findByText('gpt-example')
    const search = screen.getByRole('textbox', {
      name: 'Search models or providers',
    })
    await user.type(search, 'GPT')
    expect(
      screen.getByRole('list', { name: 'Models in the catalog' }).children
    ).toHaveLength(1)
    await user.clear(search)
    await user.type(search, 'Google')
    expect(screen.getByText('gemini-example')).toBeVisible()
    expect(screen.queryByText('gpt-example')).not.toBeInTheDocument()
    await user.clear(search)
    await user.type(search, 'missing-model')
    expect(
      screen.getByText('No matching models. Try another name.')
    ).toHaveAttribute('role', 'status')
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(search).toHaveValue('')
    expect(
      screen.getByRole('list', { name: 'Models in the catalog' }).children
    ).toHaveLength(6)
  })

  it('updates real names and hero totals when focus refreshes the catalog', async () => {
    await renderHome()
    await screen.findByText('gpt-example')
    catalogModels = ['gpt-current']
    catalogAssignments['gpt-current'] = 1
    await act(async () => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    expect(await screen.findByText('gpt-current')).toBeVisible()
    expect(
      screen.getByText('Available models').nextElementSibling
    ).toHaveTextContent('1')
    expect(
      screen.getByText('Model providers').nextElementSibling
    ).toHaveTextContent('1')
    expect(screen.queryByText('gpt-example')).not.toBeInTheDocument()
  })

  it('keeps a deduplicated model preview and opens the full model square directly', async () => {
    catalogModels = [
      'deployment-a',
      'deployment-b',
      'deployment-c',
      'deployment-d',
      'deployment-e',
      'deployment-f',
      'deployment-g',
      'deployment-h',
      'deployment-a',
    ]
    catalogAssignments = Object.fromEntries(
      catalogModels.map((name) => [name, 1])
    )
    await renderHome()
    await waitFor(() =>
      expect(
        screen.getByText('Available models').nextElementSibling
      ).toHaveTextContent('8')
    )
    expect(
      screen.getByText('Model providers').nextElementSibling
    ).toHaveTextContent('1')
    const list = screen.getByRole('list', { name: 'Models in the catalog' })
    expect(list.children).toHaveLength(6)
    expect(
      screen.queryByRole('button', { name: /Show all.*models/ })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Show less' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Explore all models' })
    ).toHaveAttribute('href', '/pricing')
  })

  it('keeps provider search visible and recoverable if that provider disappears during synchronization', async () => {
    const user = userEvent.setup()
    await renderHome()
    await user.click(
      await screen.findByRole('button', { name: 'Explore OpenAI models' })
    )
    catalogModels = ['gemini-example']
    await act(() => client.invalidateQueries({ queryKey: ['pricing'] }))
    expect(
      await screen.findByText('No matching models. Try another name.')
    ).toBeVisible()
    expect(
      screen.getByRole('textbox', { name: 'Search models or providers' })
    ).toHaveValue('OpenAI')
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByText('gemini-example')).toBeVisible()
    expect(screen.getByRole('tab', { name: /All models/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(
      screen.queryByRole('button', { name: 'Explore OpenAI models' })
    ).not.toBeInTheDocument()
  })

  it.each(['empty', 'unavailable'])(
    'keeps the real directory action when the catalog is %s',
    async (state) => {
      catalogModels = []
      catalogUnavailable = state === 'unavailable'
      await renderHome()
      const catalog = screen.getByRole('region', {
        name: 'One platform. Every possibility.',
      })
      await waitFor(() =>
        expect(within(catalog).getByRole('status')).not.toHaveTextContent(
          'Loading model catalog...'
        )
      )
      expect(
        within(catalog).getByRole('button', {
          name: 'Explore all models',
        })
      ).toHaveAttribute('href', '/pricing')
      expect(
        within(catalog).queryByRole('list', { name: 'Models in the catalog' })
      ).not.toBeInTheDocument()
    }
  )

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
        screen.getByRole('heading', { name: /More models\./ })
      ).toBeVisible()
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    } finally {
      release()
    }
  })

  it('replaces retired cached names when the homepage opens', async () => {
    client.setQueryData(['pricing'], {
      success: true,
      data: [{ model_name: 'retired-model', id: 1 }],
      vendors: [],
    })
    catalogModels = ['current-model']
    await renderHome()
    expect(await screen.findByText('current-model')).toBeVisible()
    expect(screen.queryByText('retired-model')).not.toBeInTheDocument()
  })

  it('synchronizes every minute while visible and refreshes after returning from the background', async () => {
    const router = createRouter({
      routeTree: createRootRoute({ component: CatalogFixture }),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()
    vi.useFakeTimers()
    focusManager.setFocused(true)
    catalogModels = ['before-change']
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(screen.getByText('before-change')).toBeVisible()
    catalogModels = ['after-change']
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(screen.getByText('after-change')).toBeVisible()
    act(() => focusManager.setFocused(false))
    catalogModels = ['after-return']
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(screen.queryByText('after-return')).not.toBeInTheDocument()
    await act(async () => {
      focusManager.setFocused(true)
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(screen.getByText('after-return')).toBeVisible()
  })

  it('keeps scene pause and resume on the keyboard without visible icon controls', async () => {
    const user = userEvent.setup()
    await renderHome()
    const scene = await screen.findByRole('group', {
      name: 'Explore model providers',
    })
    expect(
      screen.queryByRole('button', { name: 'Pause model animation' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Reset view' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Refresh model catalog' })
    ).not.toBeInTheDocument()
    scene.focus()
    await user.keyboard(' ')
    expect(screen.getByText('Model animation paused')).toBeInTheDocument()
    await user.keyboard(' ')
    expect(screen.getByText('Model animation running')).toBeInTheDocument()
  })

  it('shows the stability timeline automatically without demand sliders or instructions', async () => {
    await renderHome()
    const timeline = await screen.findByRole('img', {
      name: 'Illustrative timeline: healthy upstreams serve in parallel, and other available routes maintain continuous platform service when one is interrupted.',
    })
    expect(timeline).toBeVisible()
    expect(
      screen.queryByRole('slider', { name: 'Business demand' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Move the slider to explore elastic resources.')
    ).not.toBeInTheDocument()
    expect(within(timeline).queryByRole('button')).not.toBeInTheDocument()
  })

  it('switches product scenes with keyboard tabs and keeps only the selected interface exposed', async () => {
    const user = userEvent.setup()
    await renderHome()
    const controls = screen.getByRole('tablist', {
      name: 'Explore the platform',
    })
    within(controls).getByRole('tab', { name: 'Stability' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(within(controls).getAllByRole('tab')).toHaveLength(2)
    expect(
      within(controls).queryByRole('tab', { name: 'Extensibility' })
    ).not.toBeInTheDocument()
    expect(
      within(controls).getByRole('tab', { name: 'Flexible usage' })
    ).toHaveAttribute('aria-selected', 'true')
    const usageDemo = screen.getByRole('tabpanel', { name: 'Flexible usage' })
    expect(within(usageDemo).queryByRole('button')).not.toBeInTheDocument()
    expect(within(usageDemo).queryByRole('slider')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Explore how usage can follow your business rhythm.')
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('img', {
        name: 'Illustrative comparison: platform usage increases and decreases with business demand. Not actual usage data.',
      })
    ).toBeVisible()
  })

  it('keeps the sticky product interface synchronized with the story reached by scrolling', async () => {
    vi.stubGlobal('innerHeight', 900)
    await renderHome()
    expect(journeyMargin).toBe('-432px 0px -432px 0px')
    vi.stubGlobal('innerHeight', 600)
    act(() => window.dispatchEvent(new Event('resize')))
    expect(journeyMargin).toBe('-288px 0px -288px 0px')
    const story = screen
      .getByRole('heading', {
        name: 'Use what you need. Grow at your own pace.',
      })
      .closest('article')
    if (!story) throw new Error('Missing usage story')
    act(() => journeyVisibility(story))
    expect(screen.getByRole('tab', { name: 'Flexible usage' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(
      screen.queryByRole('img', {
        name: 'Illustrative timeline: healthy upstreams serve in parallel, and other available routes maintain continuous platform service when one is interrupted.',
      })
    ).not.toBeInTheDocument()
  })

  it('removes the extensibility story and demonstration from the homepage', async () => {
    await renderHome()
    expect(
      screen.queryByRole('heading', { name: 'More ways to build.' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('tab', { name: 'Extensibility' })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Model capabilities')).not.toBeInTheDocument()
  })

  it('removes the FAQ and closing promotion from the homepage', async () => {
    vi.stubEnv('VITE_LFTECH_SALES_URL', 'https://work.weixin.qq.com/example')
    await renderHome()
    expect(
      screen.queryByRole('heading', { name: 'A few things, answered.' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /Your next idea/ })
    ).not.toBeInTheDocument()
  })

  it('keeps hero sales contact as a disabled placeholder without a destination', async () => {
    await renderHome()
    const hero = screen.getByRole('region', { name: /More models\./ })
    const sales = within(hero).getByRole('button', { name: 'Contact sales' })
    expect(sales).toBeDisabled()
    expect(sales).not.toHaveAttribute('href')
  })

  it('uses direct model square and API documentation links in the header', async () => {
    await renderHome()
    const header = within(screen.getByRole('banner'))
    expect(
      header.getByRole('link', { name: 'Explore all models' })
    ).toHaveAttribute('href', '/pricing')
    const docs = header.getByRole('link', {
      name: 'Read the integration guide',
    })
    expect(docs).toHaveAttribute('href', 'https://docs.example.com/start')
    expect(docs).toHaveAttribute('target', '_blank')
    expect(docs).toHaveAttribute('rel', 'noopener noreferrer')
    expect(
      header.queryByRole('link', { name: 'Enterprise capabilities' })
    ).not.toBeInTheDocument()
    expect(
      header.queryByRole('link', { name: 'Explore models' })
    ).not.toBeInTheDocument()
  })

  it('adapts transparent header contrast when scrolling, returning, resizing and restoring a scrolled page', async () => {
    let position = 820
    let openingEnd = 720
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => position)
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        if (this.matches('.lf-ruiyuan-opening')) {
          return new DOMRect(0, -position, 1200, openingEnd)
        }
        if (this.matches('.lf-home-header')) return new DOMRect(0, 0, 1200, 72)
        return new DOMRect()
      }
    )
    await renderHome()
    const home = document.querySelector('[data-lf-public-surface="home"]')
    const opening = document.querySelector<HTMLElement>('.lf-ruiyuan-opening')
    opening?.style.setProperty('--lf-header-brand-lag', '60px')
    act(() => window.dispatchEvent(new Event('resize')))
    expect(home).toHaveAttribute('data-header-tone', 'default')
    act(() => {
      position = 0
      window.dispatchEvent(new Event('scroll'))
    })
    expect(home).toHaveAttribute('data-header-tone', 'inverse')
    expect(home).toHaveAttribute('data-brand-tone', 'inverse')
    act(() => {
      position = 700
      window.dispatchEvent(new Event('scroll'))
    })
    expect(home).toHaveAttribute('data-header-tone', 'default')
    expect(home).toHaveAttribute('data-brand-tone', 'inverse')
    act(() => {
      position = 820
      window.dispatchEvent(new Event('scroll'))
    })
    expect(home).toHaveAttribute('data-header-tone', 'default')
    expect(home).toHaveAttribute('data-brand-tone', 'default')
    act(() => {
      openingEnd = 1100
      window.dispatchEvent(new Event('resize'))
    })
    expect(home).toHaveAttribute('data-header-tone', 'inverse')
  })

  it('updates the new headline when the interface language changes', async () => {
    i18next.addResourceBundle('zh', 'translation', {
      'More models.': '多种模型，',
      'One place to build.': '一个平台。',
    })
    await renderHome()
    await act(() => i18next.changeLanguage('zh'))
    expect(
      screen.getByRole('heading', { name: /多种模型，\s*一个平台。/ })
    ).toBeVisible()
  })
  it('provides a unified authentication entry and routes other actions to models and integration docs', async () => {
    await renderHome()
    expect(
      within(screen.getByRole('banner')).getByRole('link', { name: /睿元云/ })
    ).toHaveAttribute('href', '/')
    expect(
      screen.getByRole('link', { name: '渝ICP备2026029137' })
    ).toHaveAttribute('href', 'https://beian.miit.gov.cn/')
    const registration = await screen.findAllByRole('button', {
      name: 'Sign in / Register',
    })
    for (const link of registration) {
      expect(link).toHaveAttribute('href', '/sign-in')
    }
    expect(screen.getByRole('button', { name: 'Use now' })).toHaveAttribute(
      'href',
      '/sign-in'
    )
    expect(
      screen.queryByRole('button', { name: 'Sign in' })
    ).not.toBeInTheDocument()
    for (const link of screen.getAllByRole('button', {
      name: 'Read the integration guide',
    })) {
      expect(link).toHaveAttribute('href', 'https://docs.example.com/start')
    }
    for (const link of screen.getAllByRole('button', {
      name: 'Explore all models',
    })) {
      expect(link).toHaveAttribute('href', '/pricing')
    }
    expect(
      screen.queryByTitle('Sales contact coming soon')
    ).not.toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: 'Use now' })).toHaveAttribute(
      'href',
      '/dashboard'
    )
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

  it.each([undefined, '', '   '])(
    'uses the platform API reference when the configured docs link is %s',
    async (configuredLink) => {
      docsLink = configuredLink
      await renderHome()
      const integration = screen.getByRole('region', {
        name: 'From exploration to integration.',
      })
      expect(
        within(integration).getByRole('button', {
          name: 'Read the integration guide',
        })
      ).toHaveAttribute('href', '/docs/')
    }
  )

  it('keeps getting started and protocol examples visible without a collapse control', async () => {
    await renderHome()
    const hero = screen.getByRole('region', { name: /More models\./ })
    const integration = screen.getByRole('region', {
      name: 'From exploration to integration.',
    })
    expect(
      within(hero).getByRole('group', { name: 'Explore model providers' })
    ).toBeVisible()
    expect(
      within(hero).queryByRole('tab', { name: 'Chat' })
    ).not.toBeInTheDocument()
    expect(within(integration).getByRole('tab', { name: 'Chat' })).toBeVisible()
    expect(
      within(integration).getByRole('list', { name: 'Getting started' })
    ).toBeVisible()
    expect(
      within(integration).queryByRole('button', { name: 'Developer examples' })
    ).not.toBeInTheDocument()
    expect(
      within(integration).getByRole('button', {
        name: 'Read the integration guide',
      })
    ).toHaveAttribute('href', 'https://docs.example.com/start')
  })

  it('closes the mobile menu when opening the model square directly', async () => {
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
    await user.click(
      within(panel).getByRole('link', {
        name: 'Explore all models',
      })
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/pricing'))
    expect(menu).toHaveAttribute('aria-expanded', 'false')
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
      screen.queryByRole('heading', { name: 'More models.' })
    ).not.toBeInTheDocument()
  })
})
