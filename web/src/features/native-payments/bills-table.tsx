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
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatSettlementAmount } from '@/lib/currency'
import { getServerErrorMessage } from '@/lib/server-error-message'

import { listNativeBills } from './api'
import type { NativeBill } from './types'

export function NativeBillsTable(props: { active: boolean }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<NativeBill>()
  const bills = useQuery({
    queryKey: ['native-payments', 'bills', page],
    queryFn: () => listNativeBills(page),
    enabled: props.active,
    meta: { errorToast: false },
  })
  const columns: StaticDataTableColumn<NativeBill>[] = [
    {
      id: 'date',
      header: t('Bill date'),
      cell: (bill) => (
        <div>
          <p>{bill.bill_date}</p>
          <code className='text-xs'>{bill.profile}</code>
        </div>
      ),
    },
    {
      id: 'payment',
      header: t('Payment'),
      cell: (bill) =>
        formatSettlementAmount(bill.payment_cents / 100, 'CNY', locale),
    },
    {
      id: 'refund',
      header: t('Refund'),
      cell: (bill) =>
        formatSettlementAmount(bill.refund_cents / 100, 'CNY', locale),
    },
    {
      id: 'fee',
      header: t('Fee'),
      cell: (bill) =>
        formatSettlementAmount(bill.fee_cents / 100, 'CNY', locale),
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (bill) => {
        if (bill.status === 'matched') return t('Matched')
        if (bill.status === 'differences') return t('Differences found')
        if (bill.status === 'error') return t('Error')
        if (bill.status === 'running') return t('Running')
        return t('Pending')
      },
    },
    {
      id: 'details',
      header: t('Details'),
      cell: (bill) => (
        <Button variant='outline' size='sm' onClick={() => setDetail(bill)}>
          {t('Details')}
        </Button>
      ),
    },
  ]
  return (
    <div className='space-y-4'>
      <Button
        variant='outline'
        disabled={bills.isFetching}
        onClick={() => void bills.refetch()}
      >
        {t('Refresh')}
      </Button>
      {bills.isPending && <LoadingState />}
      {bills.isError && (
        <ErrorState
          description={getServerErrorMessage(bills.error)}
          onRetry={() => void bills.refetch()}
        />
      )}
      {bills.data && (
        <>
          <StaticDataTable
            columns={columns}
            data={bills.data.items}
            getRowKey={(bill) => bill.id}
            emptyContent={t('No Data')}
          />
          <div className='flex justify-end gap-2'>
            <Button
              variant='outline'
              disabled={page <= 1 || bills.isFetching}
              onClick={() => setPage(page - 1)}
            >
              {t('Previous')}
            </Button>
            <Button
              variant='outline'
              disabled={page * 20 >= bills.data.total || bills.isFetching}
              onClick={() => setPage(page + 1)}
            >
              {t('Next')}
            </Button>
          </div>
        </>
      )}
      {detail && (
        <Dialog
          open
          title={t('Daily reconciliation')}
          onOpenChange={(open) => {
            if (!open) setDetail(undefined)
          }}
        >
          <p>
            {detail.bill_date} · {detail.profile}
          </p>
          <pre className='mt-3 max-h-80 overflow-auto rounded-md border p-3 text-xs break-all whitespace-pre-wrap'>
            {detail.error_code || detail.findings || '[]'}
          </pre>
        </Dialog>
      )}
    </div>
  )
}
