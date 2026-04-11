'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ConfirmPage() {
  const router = useRouter()

  useEffect(() => {
    async function handleConfirm() {
      // Get the hash from the URL
      const hash = window.location.hash
      
      if (hash && hash.includes('access_token')) {
        // Let Supabase process the hash automatically
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (session) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', session.user.id)
            .single()
          router.push(profile ? '/' : '/onboarding')
          return
        }
      }

      // No hash - check for existing session
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', session.user.id)
          .single()
        router.push(profile ? '/' : '/onboarding')
      } else {
        router.push('/login')
      }
    }

    // Small delay to let Supabase process the URL hash
    setTimeout(handleConfirm, 500)
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
