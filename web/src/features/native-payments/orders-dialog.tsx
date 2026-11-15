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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toIntlLocale } from '@/i18n/languages'
import { formatSettlementAmount } from '@/lib/currency'
import { ROLE } from '@/lib/roles'
import { getServerErrorMessage } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { listNativeOrders, reconcileNativeOrder } from './api'
import { NativeBillsTable } from './bills-table'
import { NativeCheckoutDialog } from './checkout-dialog'
import { NativeRefundButton } from './refund-button'
import type { NativeOrder } from './types'

export function NativeOrdersButton() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const isAdmin = useAuthStore(
    (state) => (state.auth.user?.role ?? 0) >= ROLE.SUPER_ADMIN
  )
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [adminView, setAdminView] = useState(false)
  const [tab, setTab] = useState('orders')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<NativeOrder>()
  const orders = useQuery({
    queryKey: ['native-payments', 'orders', adminView, page],
    queryFn: () => listNativeOrders(page, adminView && isAdmin),
    enabled: open && tab === 'orders',
    meta: { errorToast: false },
  })
  const reconcile = useMutation({
    mutationFn: reconcileNativeOrder,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['native-payments', 'orders'] }),
  })
  const columns: StaticDataTableColumn<NativeOrder>[] = [
    {
      id: 'order',
      header: t('Order Number'),
      cell: (order) => (
        <span className='font-mono text-xs break-all'>{order.order_no}</span>
      ),
    },
    {
      id: 'amount',
      header: t('Amount'),
      cell: (order) =>
        formatSettlementAmount(order.amount_cents / 100, 'CNY', locale),
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (order) => {
        if (order.refund_status === 'pending') return t('Refund processing')
        if (order.refund_status === 'succeeded') return t('Refunded')
        if (order.refund_status === 'failed') {
          return t('Refund failed. Please contact support.')
        }
        if (order.status === 'closed') return t('Order closed')
        if (order.fulfillment_status === 'complete') {
          return t('Payment completed')
        }
        if (order.status === 'paid') {
          return t('Payment received. Your purchase is being applied.')
        }
        return t('Waiting for payment')
      },
    },
    {
      id: 'actions',
      header: t('Actions'),
      cell: (order) =>
        adminView ? (
          <div className='flex gap-2'>
            <Button
              size='sm'
              variant='outline'
              disabled={reconcile.isPending}
              onClick={() => reconcile.mutate(order.order_no)}
            >
              {t('Verify payment')}
            </Button>
            {order.status === 'paid' &&
              order.fulfillment_status === 'pending' &&
              !order.refund_status && (
                <NativeRefundButton
                  order={order}
                  active={open}
                  onSuccess={() =>
                    void client.invalidateQueries({
                      queryKey: ['native-payments', 'orders'],
                    })
                  }
                />
              )}
          </div>
        ) : (
          <Button
            size='sm'
            variant='outline'
            onClick={() => setSelected(order)}
          >
            {t('Details')}
          </Button>
        ),
    },
  ]
  return (
    <>
      <Button variant='outline' size='sm' onClick={() => setOpen(true)}>
        {t('WeChat / Alipay orders')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('WeChat / Alipay orders')}
        contentClassName='sm:max-w-4xl'
        bodyClassName='space-y-4'
      >
        <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
          <TabsList>
            <TabsTrigger value='orders'>
              {t('WeChat / Alipay orders')}
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value='bills'>
                {t('Daily reconciliation')}
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value='orders' className='space-y-4'>
            {isAdmin && (
              <Button
                variant='outline'
                onClick={() => {
                  setAdminView(!adminView)
                  setPage(1)
                }}
              >
                {adminView ? t('My orders') : t('All orders')}
              </Button>
            )}
            {orders.isPending && <LoadingState />}
            {orders.isError && (
              <ErrorState
                description={getServerErrorMessage(orders.error)}
                onRetry={() => void orders.refetch()}
              />
            )}
            {orders.data && (
              <>
                <StaticDataTable
                  columns={columns}
                  data={orders.data.items}
                  getRowKey={(order) => order.order_no}
                  emptyContent={t('No billing records found')}
                />
                <div className='flex justify-end gap-2'>
                  <Button
                    variant='outline'
                    disabled={page <= 1 || orders.isFetching}
                    onClick={() => setPage(page - 1)}
                  >
                    {t('Previous')}
                  </Button>
                  <Button
                    variant='outline'
                    disabled={
                      page * 20 >= orders.data.total || orders.isFetching
                    }
                    onClick={() => setPage(page + 1)}
                  >
                    {t('Next')}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
          {isAdmin && (
            <TabsContent value='bills'>
              <NativeBillsTable active={open && tab === 'bills'} />
            </TabsContent>
          )}
        </Tabs>
      </Dialog>
      {selected && (
        <NativeCheckoutDialog
          key={selected.order_no}
          open
          initialOrder={selected}
          onOpenChange={(next) => {
            if (!next) setSelected(undefined)
          }}
        />
      )}
    </>
  )
}
