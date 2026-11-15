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
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { listNativeBills } from '../api'
import { NativeBillsTable } from '../bills-table'
import type { NativeBill } from '../types'

vi.mock('../api', () => ({ listNativeBills: vi.fn() }))

function showBills() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <NativeBillsTable active />
    </QueryClientProvider>
  )
}

it('shows reconciliation differences, CNY totals and order details', async () => {
  const bill: NativeBill = {
    id: 1,
    profile: 'wechat-v1',
    bill_date: '2026-11-05',
    status: 'differences',
    entry_count: 1,
    payment_cents: 1990,
    refund_cents: 0,
    fee_cents: 12,
    findings: '[{"order_no":"NP123","reason":"paid_unfulfilled"}]',
  }
  vi.mocked(listNativeBills).mockResolvedValue({ items: [bill], total: 1 })
  showBills()
  expect(await screen.findByText('Differences found')).toBeVisible()
  expect(screen.getByText(/CNY.*19\.90/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Details' }))
  expect(
    await screen.findByRole('dialog', { name: 'Daily reconciliation' })
  ).toBeVisible()
  expect(screen.getByText(/NP123/)).toBeVisible()
})

it('lets administrators retry failed bill loading and shows the empty result', async () => {
  vi.mocked(listNativeBills).mockRejectedValueOnce(
    new Error('Bill service unavailable')
  )
  showBills()
  expect(await screen.findByText('Bill service unavailable')).toBeVisible()
  vi.mocked(listNativeBills).mockResolvedValue({ items: [], total: 0 })
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('No Data')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
})
