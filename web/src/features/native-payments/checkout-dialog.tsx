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
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency, formatSettlementAmount } from '@/lib/currency'
import {
  createServerError,
  getServerErrorMessage,
} from '@/lib/server-error-message'

import {
  cancelNativeOrder,
  createNativeOrder,
  getNativeOrder,
  quoteNativePayment,
} from './api'
import { nativeOrderFinished, trustedCheckoutUrl } from './lib'
import type { NativeOrder, NativePaymentRequest } from './types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean, finished?: boolean) => void
  request?: NativePaymentRequest
  idempotencyKey?: string
  initialOrder?: NativeOrder
  onSuccess?: () => void | Promise<void>
}

export function NativeCheckoutDialog(props: Props) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const queryClient = useQueryClient()
  const request = props.request
  const onSuccess = props.onSuccess
  const [createdOrder, setCreatedOrder] = useState(props.initialOrder)
  const notifiedOrder = useRef('')
  const orderNo = createdOrder?.order_no
  const quote = useQuery({
    queryKey: ['native-payments', 'quote', props.request],
    queryFn: request ? () => quoteNativePayment(request) : skipToken,
    enabled: props.open && !!props.request && !orderNo,
    retry: false,
    meta: { errorToast: false },
  })
  const current = useQuery({
    queryKey: ['native-payments', 'order', orderNo],
    queryFn: orderNo ? () => getNativeOrder(orderNo) : skipToken,
    enabled: props.open && !!orderNo,
    initialData: createdOrder,
    refetchInterval: (query) =>
      query.state.data && nativeOrderFinished(query.state.data) ? false : 3000,
    retry: 1,
    meta: { errorToast: false },
  })
  const order = current.data ?? createdOrder
  const saveOrder = (next: NativeOrder) => {
    queryClient.setQueryData(['native-payments', 'order', next.order_no], next)
    setCreatedOrder(next)
    void queryClient.invalidateQueries({
      queryKey: ['native-payments', 'orders'],
    })
  }
  const create = useMutation({
    mutationFn: () => {
      if (!request || !props.idempotencyKey) {
        throw createServerError({ message: 'Invalid parameters' })
      }
      return createNativeOrder({
        ...request,
        idempotency_key: props.idempotencyKey,
      })
    },
    onSuccess: saveOrder,
    retry: false,
    meta: { errorToast: false },
  })
  const cancel = useMutation({
    mutationFn: () => {
      if (!orderNo) throw createServerError({ message: 'Invalid parameters' })
      return cancelNativeOrder(orderNo)
    },
    onSuccess: saveOrder,
    retry: false,
  })
  const complete = order?.fulfillment_status === 'complete'
  useEffect(() => {
    if (!complete || !orderNo || notifiedOrder.current === orderNo) return
    notifiedOrder.current = orderNo
    void onSuccess?.()
    void queryClient.invalidateQueries({
      queryKey: ['native-payments', 'orders'],
    })
  }, [complete, orderNo, onSuccess, queryClient])

  const payable = order && order.status !== 'paid' && order.status !== 'closed'
  const redirectUrl = order && trustedCheckoutUrl(order)
  const money = order ?? quote.data
  let status = t('Waiting for payment')
  if (order?.status === 'paid') {
    status = t('Payment received. Your purchase is being applied.')
  }
  if (complete) status = t('Payment completed')
  if (order?.status === 'closed') status = t('Order closed')
  if (order?.refund_status === 'pending') status = t('Refund processing')
  if (order?.refund_status === 'succeeded') status = t('Refunded')
  if (order?.refund_status === 'failed') {
    status = t('Refund failed. Please contact support.')
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) =>
        props.onOpenChange(
          open,
          order
            ? nativeOrderFinished(order)
            : !create.isPending && !create.isError
        )
      }
      title={t('WeChat Pay / Alipay')}
      contentClassName='sm:max-w-md'
      bodyClassName='space-y-4'
    >
      {money && (
        <div className='flex items-center justify-between gap-3'>
          <span>{t('Amount Due')}</span>
          <strong>
            {formatSettlementAmount(money.amount_cents / 100, 'CNY', locale)}
          </strong>
        </div>
      )}
      {money?.quota !== undefined && money.quota > 0 && (
        <div className='flex justify-between gap-3 text-sm'>
          <span>{t('Quota')}</span>
          <span>{formatQuotaWithCurrency(money.quota, { locale })}</span>
        </div>
      )}
      {!order && quote.isPending && <LoadingState />}
      {!order && quote.isError && (
        <ErrorState
          description={getServerErrorMessage(quote.error)}
          onRetry={() => void quote.refetch()}
        />
      )}
      {!order && quote.data && (
        <>
          <p className='text-muted-foreground text-sm'>
            {t('The final payment amount is shown in CNY.')}
          </p>
          {create.isError && (
            <Alert variant='destructive'>
              <AlertDescription>
                {getServerErrorMessage(create.error)}
              </AlertDescription>
            </Alert>
          )}
          <Button
            className='w-full'
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? t('Processing...') : t('Pay')}
          </Button>
        </>
      )}
      {order && (
        <>
          <p role='status' aria-live='polite' className='text-sm'>
            {status}
          </p>
          <p className='text-muted-foreground font-mono text-xs break-all'>
            {order.order_no}
          </p>
          {payable && order.checkout?.kind === 'qr' && (
            <div className='flex flex-col items-center gap-3'>
              <div className='rounded-lg bg-white p-4'>
                <QRCodeSVG
                  value={order.checkout.url}
                  size={200}
                  title={t('Scan with WeChat to pay')}
                />
              </div>
              <p className='text-sm'>{t('Scan with WeChat to pay')}</p>
            </div>
          )}
          {payable && redirectUrl && (
            <Button
              render={
                <a
                  href={redirectUrl}
                  target='_blank'
                  rel={
                    order.provider === 'wechat'
                      ? 'noopener'
                      : 'noopener noreferrer'
                  }
                  referrerPolicy={
                    order.provider === 'wechat' ? 'origin' : 'no-referrer'
                  }
                />
              }
              className='w-full'
            >
              {t('Open payment page')}
            </Button>
          )}
          {current.isError && (
            <Alert variant='destructive'>
              <AlertDescription>
                {t(
                  'Unable to refresh payment status. Your payment may still be processing.'
                )}
              </AlertDescription>
            </Alert>
          )}
          <div className='flex flex-wrap justify-end gap-2'>
            {!nativeOrderFinished(order) && (
              <Button
                variant='outline'
                disabled={current.isFetching}
                onClick={() => void current.refetch()}
              >
                {t('Refresh')}
              </Button>
            )}
            {payable && (
              <Button
                variant='outline'
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                {t('Cancel payment')}
              </Button>
            )}
            <Button
              variant='secondary'
              onClick={() =>
                props.onOpenChange(false, nativeOrderFinished(order))
              }
            >
              {t('Close')}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  )
}
