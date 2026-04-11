'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ConfirmPage() {
  const router = useRouter()
  const [status, setStatus] = useState('Signing you in…')

  useEffect(() => {
    let attempts = 0
    const maxAttempts = 10

    async function checkSession() {
      attempts++
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        setStatus('Checking your profile…')
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', session.user.id)
          .single()

        if (profile) {
          setStatus('Welcome back!')
          router.push('/')
        } else {
          setStatus('Setting up your profile…')
          router.push('/onboarding')
        }
        return
      }

      // Keep retrying until session appears (magic link sets it async)
      if (attempts < maxAttempts) {
        setTimeout(checkSession, 500)
      } else {
        setStatus('Having trouble signing in…')
        setTimeout(() => router.push('/login'), 1500)
      }
    }

    // Listen for auth state change first (fastest path)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setStatus('Checking your profile…')
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', session.user.id)
          .single()
        router.push(profile ? '/' : '/onboarding')
      }
    })

    // Also poll as fallback
    setTimeout(checkSession, 300)

    return () => subscription.unsubscribe()
  }, [router])

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0f',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans', sans-serif"
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>🎾</div>
        <div style={{ color: '#00c6a2', fontSize: 15, fontWeight: 700 }}>{status}</div>
        <div style={{ color: '#555', fontSize: 13, marginTop: 8 }}>Just a moment</div>
      </div>
    </div>
  )
}
