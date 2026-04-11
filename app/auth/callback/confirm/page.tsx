'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ConfirmPage() {
  const router = useRouter()

  useEffect(() => {
    // This page catches the hash-based session from magic links
    // Supabase automatically reads #access_token from the URL
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        // Check if profile exists
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', session.user.id)
          .single()

        if (profile) {
          router.push('/')
        } else {
          router.push('/onboarding')
        }
      }
    })

    // Also try immediately in case session is already available
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        supabase.from('profiles').select('id').eq('id', session.user.id).single()
          .then(({ data: profile }) => {
            router.push(profile ? '/' : '/onboarding')
          })
      }
    })

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
        <div style={{ color: '#00c6a2', fontSize: 15, fontWeight: 700 }}>Signing you in…</div>
        <div style={{ color: '#555', fontSize: 13, marginTop: 8 }}>Just a moment</div>
      </div>
    </div>
  )
}
