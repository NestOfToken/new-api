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
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStatus } from '@/hooks/use-status'

import { TermsFooter } from '../components/terms-footer'
import { SignUpForm } from '../sign-up/components/sign-up-form'
import { SignInLayout } from './components/sign-in-layout'
import { UserAuthForm } from './components/user-auth-form'

export function SignIn() {
  const { t } = useTranslation()
  const search = useSearch({ from: '/(auth)/sign-in' })
  const navigate = useNavigate({ from: '/sign-in' })
  const { status } = useStatus()
  const registrationEnabled =
    !status?.self_use_mode_enabled && status?.register_enabled !== false
  const mode =
    registrationEnabled && search.mode === 'register' ? 'register' : 'login'

  return (
    <SignInLayout
      heading={
        mode === 'register' ? t('Create an account') : t('Welcome back!')
      }
    >
      <Tabs
        value={mode}
        onValueChange={(value) => {
          void navigate({
            search: {
              ...search,
              mode: value === 'register' ? 'register' : undefined,
            },
            replace: true,
            resetScroll: false,
          })
        }}
      >
        {registrationEnabled && (
          <TabsList
            variant='line'
            className='lf-auth-tabs'
            aria-label={t('Sign in / Register')}
          >
            <TabsTrigger value='login'>{t('Sign in')}</TabsTrigger>
            <TabsTrigger value='register'>{t('Sign up')}</TabsTrigger>
          </TabsList>
        )}
        <TabsContent value='login'>
          <UserAuthForm redirectTo={search.redirect} />
          <TermsFooter
            variant='sign-in'
            status={status}
            className='lf-sign-in-terms'
          />
        </TabsContent>
        {registrationEnabled && (
          <TabsContent value='register'>
            <SignUpForm
              redirectTo={search.redirect}
              affiliateCode={search.aff}
            />
            <TermsFooter
              variant='sign-up'
              status={status}
              className='lf-sign-in-terms'
            />
          </TabsContent>
        )}
      </Tabs>
    </SignInLayout>
  )
}
