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
import { api } from '@/lib/api'
import { authRequestOptions, authResult } from '@/lib/secure-verification'
import {
  createServerError,
  requireServerSuccess,
} from '@/lib/server-error-message'

import type {
  NativeCapabilities,
  NativeBill,
  NativeOrder,
  NativeOrderPage,
  NativePaymentRequest,
  NativeQuote,
} from './types'

interface Response<T> {
  success: boolean
  data?: T
}

function paymentData<T>(response: Response<T>): T {
  requireServerSuccess(response)
  if (!response.success || response.data === undefined) {
    throw createServerError(response)
  }
  return response.data
}

export async function getNativeCapabilities(): Promise<NativeCapabilities> {
  return paymentData((await api.get('/api/payments/capabilities')).data)
}

export async function quoteNativePayment(
  request: NativePaymentRequest
): Promise<NativeQuote> {
  return paymentData((await api.post('/api/payments/quote', request)).data)
}

export async function createNativeOrder(
  request: NativePaymentRequest & { idempotency_key: string }
): Promise<NativeOrder> {
  return paymentData((await api.post('/api/payments/orders', request)).data)
}

export async function getNativeOrder(orderNo: string): Promise<NativeOrder> {
  return paymentData(
    (await api.get(`/api/payments/orders/${encodeURIComponent(orderNo)}`)).data
  )
}

export async function cancelNativeOrder(orderNo: string): Promise<NativeOrder> {
  return paymentData(
    (
      await api.post(
        `/api/payments/orders/${encodeURIComponent(orderNo)}/cancel`
      )
    ).data
  )
}

export async function listNativeOrders(
  page: number,
  admin: boolean
): Promise<NativeOrderPage> {
  const path = admin ? '/api/payments/admin/orders' : '/api/payments/orders'
  return paymentData(
    (await api.get(path, { params: { p: page, page_size: 20 } })).data
  )
}

export async function reconcileNativeOrder(
  orderNo: string
): Promise<NativeOrder> {
  return paymentData(
    (
      await api.post(
        `/api/payments/admin/orders/${encodeURIComponent(orderNo)}/reconcile`
      )
    ).data
  )
}

export async function refundNativeOrder(
  orderNo: string,
  amountCents: number,
  proofToken: string,
  signal?: AbortSignal
): Promise<{ status: string }> {
  return authResult(
    api.post(
      `/api/payments/admin/orders/${encodeURIComponent(orderNo)}/refund`,
      { amount_cents: amountCents },
      {
        ...authRequestOptions,
        headers: { 'X-Security-Proof': proofToken },
        signal,
      }
    )
  )
}

export async function listNativeBills(
  page: number
): Promise<{ items: NativeBill[]; total: number }> {
  return paymentData(
    (
      await api.get('/api/payments/admin/bills', {
        params: { p: page, page_size: 20 },
      })
    ).data
  )
}
