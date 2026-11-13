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
import { DEFAULT_LOGO, DEFAULT_SYSTEM_NAME } from '@/lib/constants'

/** Resolve inherited defaults without overriding an operator's custom brand. */
export function resolveSystemName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || /^new[\s-]*api$/i.test(name)) return DEFAULT_SYSTEM_NAME
  // Keep recognizing persisted names from releases before the brand migration.
  return name
    .replaceAll('\u9e9f\u98de\u79d1\u6280', '睿元云')
    .replaceAll('麟飛科技', '睿元雲')
    .replaceAll('Linfei Technology', 'nerioncloud')
}

export function resolveSystemLogo(value: unknown): string {
  const logo = typeof value === 'string' ? value.trim() : ''
  return !logo ||
    /^\/?(?:logo\.png|favicon\.ico|images\/lftech\/brand-mark\.svg)$/i.test(
      logo
    )
    ? DEFAULT_LOGO
    : logo
}
