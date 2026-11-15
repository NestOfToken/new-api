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
import { expect, it } from 'vitest'

import { toIntlLocale } from '@/i18n/languages'
import { formatSettlementAmount } from '@/lib/currency'

import { nativeScene, trustedCheckoutUrl } from '../lib'
import type { NativeOrder } from '../types'

it.each(['zhCN', 'zhTW', 'en', 'fr', 'ru', 'ja', 'vi', 'invalid-language'])(
  'formats CNY without applying the display exchange rate in %s',
  (language) => {
    const locale = toIntlLocale(language)
    expect(formatSettlementAmount(19.9, 'CNY', locale)).toBe(
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'CNY',
        currencyDisplay: 'code',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(19.9)
    )
  }
)

it('offers only supported scenes for the current browser', () => {
  expect(
    nativeScene(
      { provider: 'wechat', name: 'WeChat Pay', scenes: ['native'] },
      'Windows'
    )
  ).toBe('native')
  expect(
    nativeScene(
      { provider: 'wechat', name: 'WeChat Pay', scenes: ['native'] },
      'iPhone'
    )
  ).toBeUndefined()
  expect(
    nativeScene(
      { provider: 'wechat', name: 'WeChat Pay', scenes: ['native', 'h5'] },
      'Android'
    )
  ).toBe('h5')
  expect(
    nativeScene(
      { provider: 'wechat', name: 'WeChat Pay', scenes: ['h5'] },
      'Android MicroMessenger'
    )
  ).toBeUndefined()
  expect(
    nativeScene(
      { provider: 'alipay', name: 'Alipay', scenes: ['page', 'wap'] },
      'iPhone'
    )
  ).toBe('wap')
})

it.each([
  'javascript:alert(1)',
  'https://openapi.alipay.com.attacker.test',
  'https://openapi.alipay.com@attacker.test',
  'http://openapi.alipay.com',
  'https://openapi.alipay.com:8443',
])('rejects an unsafe official checkout URL %s', (url) => {
  const order = {
    provider: 'alipay',
    checkout: { kind: 'redirect', url },
  } as NativeOrder
  expect(trustedCheckoutUrl(order)).toBeUndefined()
})
