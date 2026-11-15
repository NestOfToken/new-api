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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

import {
  cancelNativeOrder,
  createNativeOrder,
  getNativeOrder,
  quoteNativePayment,
} from '../api'
import { NativeCheckoutDialog } from '../checkout-dialog'
import type { NativeOrder } from '../types'

vi.mock('../api', () => ({
  quoteNativePayment: vi.fn(),
  createNativeOrder: vi.fn(),
  getNativeOrder: vi.fn(),
  cancelNativeOrder: vi.fn(),
}))

const order: NativeOrder = {
  order_no: 'native-order-123',
  provider: 'alipay',
  amount_cents: 1990,
  currency: 'CNY',
  status: 'pending',
  fulfillment_status: 'pending',
  expires_at: 9999999999,
  checkout: {
    kind: 'redirect',
    url: 'https://openapi.alipay.com/gateway.do?order=123',
  },
}

function showCheckout(onSuccess = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <NativeCheckoutDialog
        open
        onOpenChange={vi.fn()}
        request={{
          kind: 'topup',
          amount: 10,
          provider: 'alipay',
          scene: 'page',
        }}
        idempotencyKey='stable-request-123'
        onSuccess={onSuccess}
      />
    </QueryClientProvider>
  )
  return client
}

beforeEach(() => {
  vi.mocked(quoteNativePayment).mockResolvedValue({
    amount_cents: 1990,
    currency: 'CNY',
  })
  vi.mocked(createNativeOrder).mockResolvedValue(order)
  vi.mocked(getNativeOrder).mockResolvedValue(order)
  vi.mocked(cancelNativeOrder).mockResolvedValue({ ...order, status: 'closed' })
})

it('shows the server CNY quote and waits for fulfillment before announcing completion', async () => {
  const completed = vi.fn()
  showCheckout(completed)
  const pay = await screen.findByRole('button', { name: 'Pay' })
  expect(screen.getByText(/CNY.*19\.90/)).toBeVisible()
  fireEvent.click(pay)
  const link = await screen.findByRole('button', { name: 'Open payment page' })
  expect(link).toHaveAttribute('href', order.checkout?.url)
  expect(completed).not.toHaveBeenCalled()
  vi.mocked(getNativeOrder).mockResolvedValue({ ...order, status: 'paid' })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await screen.findByText('Payment received. Your purchase is being applied.')
  expect(completed).not.toHaveBeenCalled()
  vi.mocked(getNativeOrder).mockResolvedValue({
    ...order,
    status: 'paid',
    fulfillment_status: 'complete',
  })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await screen.findByText('Payment completed')
  await waitFor(() => expect(completed).toHaveBeenCalledTimes(1))
  expect(
    screen.queryByRole('button', { name: 'Open payment page' })
  ).not.toBeInTheDocument()
})

it('reuses the idempotency key after a network failure instead of issuing a new purchase', async () => {
  vi.mocked(createNativeOrder).mockRejectedValueOnce(
    new Error('Connection interrupted')
  )
  showCheckout()
  fireEvent.click(await screen.findByRole('button', { name: 'Pay' }))
  await screen.findByText('Connection interrupted')
  fireEvent.click(screen.getByRole('button', { name: 'Pay' }))
  await screen.findByRole('button', { name: 'Open payment page' })
  expect(
    vi
      .mocked(createNativeOrder)
      .mock.calls.map(([request]) => request.idempotency_key)
  ).toEqual(['stable-request-123', 'stable-request-123'])
})

it('shows a failed quote with retry and does not allow an unpriced order', async () => {
  vi.mocked(quoteNativePayment).mockRejectedValueOnce(
    new Error('Quote unavailable')
  )
  showCheckout()
  await screen.findByText('Quote unavailable')
  expect(screen.queryByRole('button', { name: 'Pay' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await screen.findByRole('button', { name: 'Pay' })
  expect(createNativeOrder).not.toHaveBeenCalled()
})

it('keeps an unknown payment recoverable and confirms cancellation using server state', async () => {
  vi.mocked(createNativeOrder).mockResolvedValue({
    ...order,
    checkout: undefined,
  })
  showCheckout()
  fireEvent.click(await screen.findByRole('button', { name: 'Pay' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel payment' }))
  await screen.findByText('Order closed')
  expect(cancelNativeOrder).toHaveBeenCalledWith(order.order_no)
})

it('sends the site origin to WeChat H5 while isolating the new window', async () => {
  const wechat: NativeOrder = {
    ...order,
    provider: 'wechat',
    checkout: {
      kind: 'redirect',
      url: 'https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=test',
    },
  }
  vi.mocked(createNativeOrder).mockResolvedValue(wechat)
  vi.mocked(getNativeOrder).mockResolvedValue(wechat)
  showCheckout()
  fireEvent.click(await screen.findByRole('button', { name: 'Pay' }))
  const link = await screen.findByRole('button', { name: 'Open payment page' })
  expect(link).toHaveAttribute('rel', 'noopener')
  expect(link).toHaveAttribute('referrerpolicy', 'origin')
})
