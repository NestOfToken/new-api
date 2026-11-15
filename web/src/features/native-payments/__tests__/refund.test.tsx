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
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { refundNativeOrder } from '../api'
import { NativeRefundButton } from '../refund-button'
import type { NativeOrder } from '../types'

const verification = vi.hoisted(() => ({
  requestVerification: vi.fn(),
  cancel: vi.fn(),
  dialogProps: {},
}))
vi.mock('@/features/auth/secure-verification', () => ({
  useSecureVerification: () => verification,
  SecureVerificationDialog: () => null,
}))
vi.mock('../api', () => ({ refundNativeOrder: vi.fn() }))

const order: NativeOrder = {
  order_no: 'refund-test-123',
  amount_cents: 1990,
  currency: 'CNY',
  provider: 'wechat',
  status: 'paid',
  fulfillment_status: 'pending',
  expires_at: 9999999999,
}

async function confirmRefund() {
  fireEvent.click(screen.getByRole('button', { name: 'Refund' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(within(dialog).getByText(order.order_no)).toBeVisible()
  expect(within(dialog).getByText(/CNY.*19\.90/)).toBeVisible()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Refund' }))
}

it('binds refund verification to the reviewed order and amount before submitting the proof', async () => {
  verification.requestVerification.mockResolvedValue({
    proof_token: 'one-use-proof',
  })
  vi.mocked(refundNativeOrder).mockResolvedValue({ status: 'pending' })
  const success = vi.fn()
  render(<NativeRefundButton order={order} active onSuccess={success} />)
  await confirmRefund()
  await act(async () => undefined)
  expect(verification.requestVerification).toHaveBeenCalledWith(
    expect.objectContaining({
      scope: 'payment.native.refund',
      context: { order_no: order.order_no, amount_cents: 1990 },
    })
  )
  expect(refundNativeOrder).toHaveBeenCalledWith(
    order.order_no,
    1990,
    'one-use-proof',
    expect.any(AbortSignal)
  )
  expect(success).toHaveBeenCalledOnce()
})

it('does not refund when identity verification is cancelled', async () => {
  verification.requestVerification.mockResolvedValue(null)
  render(<NativeRefundButton order={order} active onSuccess={vi.fn()} />)
  await confirmRefund()
  await act(async () => undefined)
  expect(refundNativeOrder).not.toHaveBeenCalled()
})

it('discards a late proof after leaving the order view', async () => {
  let resolve: (value: { proof_token: string }) => void = () => undefined
  verification.requestVerification.mockReturnValue(
    new Promise((complete) => {
      resolve = complete
    })
  )
  const view = render(
    <NativeRefundButton order={order} active onSuccess={vi.fn()} />
  )
  await confirmRefund()
  view.rerender(
    <NativeRefundButton order={order} active={false} onSuccess={vi.fn()} />
  )
  await act(async () => resolve({ proof_token: 'late-proof' }))
  expect(refundNativeOrder).not.toHaveBeenCalled()
  expect(verification.cancel).toHaveBeenCalled()
})
