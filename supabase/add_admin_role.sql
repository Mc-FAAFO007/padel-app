-- Add admin role to profiles table
-- Run this in: Supabase Dashboard → SQL Editor

-- ── 1. Add is_admin column to profiles ──────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean default false;

-- ── 2. Update RLS policies to allow admins full access ──────
-- Drop old policies (optional, if you want to be more restrictive)
-- For now, we'll add admin-specific policies

-- Policy: Admins can update any profile
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  USING (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true));

-- Policy: Admins can delete any profile
CREATE POLICY "Admins can delete any profile"
  ON profiles FOR DELETE
  USING (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true));

-- ── 3. Update posts RLS to allow admin management ──────────
-- Policy: Admins can update any post
CREATE POLICY "Admins can update any post"
  ON posts FOR UPDATE
  USING (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true));

-- Policy: Admins can delete any post
CREATE POLICY "Admins can delete any post"
  ON posts FOR DELETE
  USING (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true));

-- ── 4. Update ratings RLS to allow admin management ────────
-- Policy: Admins can update any rating
CREATE POLICY "Admins can update any rating"
  ON ratings FOR UPDATE
  USING (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true));

-- Policy: Admins can delete any rating
CREATE POLICY "Admins can delete any rating"
  ON ratings FOR DELETE
  USING (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true));

-- ── 5. Update matches RLS to allow admin management ────────
-- Policy: Admins can delete any match
CREATE POLICY "Admins can delete any match"
  ON matches FOR DELETE
  USING (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true));

-- ── 6. Set initial admin (replace with your actual email/user id) ──────
-- First, find your user ID in auth.users table, then run:
-- UPDATE profiles SET is_admin = true WHERE id = 'your-user-id-here';
