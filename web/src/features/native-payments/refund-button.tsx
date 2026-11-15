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
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  SecureVerificationDialog,
  useSecureVerification,
} from '@/features/auth/secure-verification'
import { toIntlLocale } from '@/i18n/languages'
import { formatSettlementAmount } from '@/lib/currency'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'

import { refundNativeOrder } from './api'
import type { NativeOrder } from './types'

export function NativeRefundButton(props: {
  order: NativeOrder
  active: boolean
  onSuccess: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const verification = useSecureVerification()
  const cancelVerification = verification.cancel
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const operation = useRef<AbortController | null>(null)
  useEffect(() => {
    setBusy(false)
    setConfirmOpen(false)
    return () => {
      operation.current?.abort()
      operation.current = null
      cancelVerification()
    }
  }, [props.active, props.order.order_no, cancelVerification])

  const refund = async () => {
    if (operation.current || !props.active) return
    const current = new AbortController()
    operation.current = current
    setBusy(true)
    try {
      const proof = await verification.requestVerification({
        scope: 'payment.native.refund',
        context: {
          order_no: props.order.order_no,
          amount_cents: props.order.amount_cents,
        },
        title: t('Verify refund'),
      })
      if (!proof || operation.current !== current) return
      await refundNativeOrder(
        props.order.order_no,
        props.order.amount_cents,
        proof.proof_token,
        current.signal
      )
      if (operation.current !== current) return
      setConfirmOpen(false)
      props.onSuccess()
    } catch (error) {
      if (operation.current === current && !current.signal.aborted) {
        handleServerError(AuthOperationError.from(error))
      }
    } finally {
      if (operation.current === current) {
        operation.current = null
        setBusy(false)
      }
    }
  }

  return (
    <>
      <Button
        size='sm'
        variant='outline'
        disabled={busy}
        onClick={() => setConfirmOpen(true)}
      >
        {t('Refund')}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!busy) setConfirmOpen(open)
        }}
        title={t('Refund')}
        desc={
          <div className='space-y-2'>
            <p>{t('Refund this payment to its original payment method?')}</p>
            <p className='font-mono break-all'>{props.order.order_no}</p>
            <strong>
              {formatSettlementAmount(
                props.order.amount_cents / 100,
                'CNY',
                locale
              )}
            </strong>
          </div>
        }
        confirmText={t('Refund')}
        handleConfirm={() => void refund()}
        isLoading={busy}
        destructive
      />
      <SecureVerificationDialog {...verification.dialogProps} />
    </>
  )
}
