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

      if (attempts < maxAttempts) {
        setTimeout(checkSession, 500)
      } else {
        setStatus('Having trouble signing in…')
        setTimeout(() => router.push('/login'), 1500)
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setStatus('Checking your profile…')
        const { data: profile } = await supabase
          .from('profiles').select('id').eq('id', session.user.id).single()
        router.push(profile ? '/' : '/onboarding')
      }
    })

    setTimeout(checkSession, 300)
    return () => subscription.unsubscribe()
  }, [router])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f5f0e8',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'DM Sans', sans-serif"
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 22, fontWeight: 900, color: '#014a09',
          letterSpacing: -0.5, marginBottom: 24
        }}>
          Court Connections
        </div>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          border: '3px solid #014a09',
          borderTopColor: 'transparent',
          margin: '0 auto 20px',
          animation: 'spin 0.8s linear infinite'
        }} />
        <div style={{ color: '#014a09', fontSize: 15, fontWeight: 700 }}>{status}</div>
        <div style={{ color: '#888', fontSize: 13, marginTop: 6 }}>Just a moment</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

