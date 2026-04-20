// ── Database row types ────────────────────────────────────────

export interface Profile {
  id: string
  name: string
  avatar: string
  level: string          // "1" | "2" | "3" | "4"
  availability: string[]
  created_at: string
}

export interface Post {
  id: number
  player_id: string
  player_name: string
  player_avatar: string
  level: string
  allowed_levels?: string[]
  slot: string
  spots_needed: number
  note: string
  created_at: string
  // Joined from post_interests
  interested_ids?: string[]
  interest_count?: number
}

export interface PostInterest {
  id: number
  post_id: number
  player_id: string
  created_at: string
}

export interface Rating {
  id: number
  player_id: string
  player_name: string
  avatar: string
  rating: number
  match_count: number
  created_at: string
  updated_at: string
}

export interface Match {
  id: number
  team_a1_id: string
  team_a1_name: string
  team_a2_id: string
  team_a2_name: string
  team_b1_id: string
  team_b1_name: string
  team_b2_id: string
  team_b2_name: string
  sets_a: number[]
  sets_b: number[]
  rating_a1_before: number; rating_a1_after: number
  rating_a2_before: number; rating_a2_after: number
  rating_b1_before: number; rating_b1_after: number
  rating_b2_before: number; rating_b2_after: number
  logged_by: string
  created_at: string
}
