// Optional: Add this code to your main app navigation
// This shows an admin link only to admin users

// In app/page.tsx, in your navigation section, add:

{currentUser?.is_admin && (
  <button 
    onClick={() => router.push('/admin')} 
    style={{ 
      background: '#990033', 
      border: 'none', 
      borderRadius: 12, 
      padding: '12px 24px', 
      color: '#fff', 
      fontWeight: 800, 
      fontSize: 14, 
      cursor: 'pointer', 
      fontFamily: 'inherit',
      marginRight: 12
    }}>
    ⚙️ Admin Panel
  </button>
)}

// Or in your nav bar - a subtle indicator:

{currentUser?.is_admin && (
  <span 
    style={{
      background: 'rgba(153, 0, 51, 0.12)',
      color: '#990033',
      borderRadius: 20,
      padding: '4px 12px',
      fontSize: 11,
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: 0.5
    }}>
    🔐 Admin
  </span>
)}

// You'll need to add is_admin to the type check:
// Change: const [currentUser, setCurrentUser] = useState<Profile | null>(null)
// To: const [currentUser, setCurrentUser] = useState<Profile & { is_admin?: boolean } | null>(null)
