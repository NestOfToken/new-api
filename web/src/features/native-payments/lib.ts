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
import type { NativeChannel, NativeOrder, NativeScene } from './types'

export function nativeOrderFinished(order: NativeOrder): boolean {
  return (
    order.status === 'closed' ||
    order.fulfillment_status === 'complete' ||
    order.fulfillment_status === 'refunded' ||
    order.refund_status === 'succeeded'
  )
}

export function nativeScene(
  channel: NativeChannel,
  userAgent: string
): NativeScene | undefined {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(userAgent)
  const wechat = /MicroMessenger/i.test(userAgent)
  if (channel.provider === 'wechat') {
    if (mobile && !wechat && channel.scenes.includes('h5')) return 'h5'
    if (!mobile && channel.scenes.includes('native')) return 'native'
    return undefined
  }
  if (wechat) return undefined
  if (mobile && channel.scenes.includes('wap')) return 'wap'
  if (!mobile && channel.scenes.includes('page')) return 'page'
  return undefined
}

export function trustedCheckoutUrl(order: NativeOrder): string | undefined {
  if (order.checkout?.kind !== 'redirect') return undefined
  try {
    const url = new URL(order.checkout.url)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) {
      return undefined
    }
    const allowed =
      order.provider === 'alipay'
        ? [
            'openapi.alipay.com',
            'openapi-sandbox.dl.alipaydev.com',
            'openapi.alipaydev.com',
          ]
        : ['wx.tenpay.com']
    return allowed.includes(url.hostname) ? url.href : undefined
  } catch {
    return undefined
  }
}
