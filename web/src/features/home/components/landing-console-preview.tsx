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
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { formatLocalCurrencyAmount } from '@/lib/currency'
import { formatCompactNumber, formatNumber } from '@/lib/format'

export function LandingConsolePreview() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  return (
    <div className='lf-console' data-home-motion>
      <div className='lf-console-toolbar'>
        <strong>{t('Customer console')}</strong>
        <span>{t('Illustrative preview')}</span>
      </div>
      <dl className='lf-console-summary'>
        <div>
          <dt>{t('Available Balance')}</dt>
          <dd>
            {formatLocalCurrencyAmount(1000, { locale, abbreviate: false })}
          </dd>
          <span>{t('Top up as needed')}</span>
        </div>
        <div>
          <dt>{t('Monthly requests')}</dt>
          <dd>{formatNumber(12480, locale)}</dd>
          <span>{t('Requests')}</span>
        </div>
        <div>
          <dt>{t('Monthly usage')}</dt>
          <dd>{formatCompactNumber(2400000, locale)}</dd>
          <span>tokens</span>
        </div>
      </dl>
      <div className='lf-console-records'>
        <h4>{t('Recent requests')}</h4>
        <table>
          <caption className='sr-only'>
            {t('Illustrative model call history')}
          </caption>
          <thead>
            <tr>
              <th>{t('Model')}</th>
              <th>{t('Usage')}</th>
              <th>{t('Status')}</th>
            </tr>
          </thead>
          <tbody>
            {[27, 31].map((tokens) => (
              <tr key={tokens}>
                <td>your-model</td>
                <td>{formatNumber(tokens, locale)} tokens</td>
                <td>{t('Completed')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className='lf-console-note'>
        {t('Example data only. These are not real customer records.')}
      </p>
    </div>
  )
}
