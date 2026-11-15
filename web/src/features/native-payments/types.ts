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
export type NativeProvider = 'wechat' | 'alipay'
export type NativeScene = 'native' | 'page' | 'h5' | 'wap'

export interface NativeChannel {
  provider: NativeProvider
  name: string
  scenes: NativeScene[]
}

export interface NativePaymentRequest {
  kind: 'topup' | 'subscription'
  amount?: number
  plan_id?: number
  provider: NativeProvider
  scene: NativeScene
}

export interface NativeQuote {
  amount_cents: number
  currency: 'CNY'
  quota?: number
}

export interface NativeOrder extends NativeQuote {
  order_no: string
  provider: NativeProvider
  status: string
  fulfillment_status: string
  refund_status?: string
  expires_at: number
  checkout?: { kind: 'qr' | 'redirect'; url: string }
}

export interface NativeCapabilities {
  enabled: boolean
  channels: NativeChannel[]
}

export interface NativeOrderPage {
  items: NativeOrder[]
  total: number
}

export interface NativeBill {
  id: number
  profile: string
  bill_date: string
  status: string
  entry_count: number
  payment_cents: number
  refund_cents: number
  fee_cents: number
  findings: string
  error_code?: string
}
