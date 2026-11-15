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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { NativeCheckoutDialog } from './checkout-dialog'
import { useNativeCapabilities } from './hooks'
import { nativeScene } from './lib'
import type { NativePaymentRequest } from './types'

interface Props {
  kind: 'topup' | 'subscription'
  amount?: number
  planId?: number
  enabled?: boolean
  disabled?: boolean
  onSuccess?: () => void | Promise<void>
}

export function NativePaymentOptions(props: Props) {
  const { t } = useTranslation()
  const capabilities = useNativeCapabilities(props.enabled !== false)
  const [selection, setSelection] = useState<{
    request: NativePaymentRequest
    key: string
  }>()
  const [open, setOpen] = useState(false)
  const channels = capabilities.data?.enabled ? capabilities.data.channels : []
  if (props.enabled === false || (!channels.length && !selection)) return null

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap gap-2'>
        {selection ? (
          <Button variant='outline' onClick={() => setOpen(true)}>
            {t('Continue payment')}
          </Button>
        ) : (
          channels.map((channel) => {
            const scene = nativeScene(channel, navigator.userAgent)
            return (
              <Button
                key={channel.provider}
                variant='outline'
                disabled={props.disabled || !scene}
                onClick={() => {
                  if (!scene) return
                  setSelection({
                    request: {
                      kind: props.kind,
                      amount: props.amount,
                      plan_id: props.planId,
                      provider: channel.provider,
                      scene,
                    },
                    key: crypto.randomUUID(),
                  })
                  setOpen(true)
                }}
              >
                {channel.provider === 'wechat' ? t('WeChat Pay') : t('Alipay')}
              </Button>
            )
          })
        )}
      </div>
      {!selection &&
        channels.some(
          (channel) => !nativeScene(channel, navigator.userAgent)
        ) && (
          <p className='text-muted-foreground text-xs'>
            {t('Some payment methods require a desktop or external browser.')}
          </p>
        )}
      {selection && (
        <NativeCheckoutDialog
          key={selection.key}
          open={open}
          request={selection.request}
          idempotencyKey={selection.key}
          onSuccess={props.onSuccess}
          onOpenChange={(next, finished) => {
            setOpen(next)
            if (!next && finished) setSelection(undefined)
          }}
        />
      )}
    </div>
  )
}
