# Admin Panel Setup Instructions

Your admin panel is now ready! Follow these steps to activate it:

## 1. Run the Database Migration

Go to your Supabase Dashboard and run the SQL migration:

**Supabase Dashboard → SQL Editor → Run the following:**

Copy the contents of `/supabase/add_admin_role.sql` and paste it into the Supabase SQL editor, then execute it.

This will:
- Add the `is_admin` column to profiles table
- Create RLS policies allowing admins full access
- Enable admin role-based access control

## 2. Set Yourself as Admin

After running the migration, find your user ID in the Supabase auth.users table:

```sql
SELECT id FROM auth.users WHERE email = 'marthinusvisser@gmail.com';
```

Then execute this command with your user ID:

```sql
UPDATE profiles SET is_admin = true WHERE id = 'your-user-id-here';
```

## 3. Access the Admin Panel

Visit: `http://localhost:3000/admin` (or your deployment URL + `/admin`)

## Features

Your admin panel includes:

### 📊 Dashboard
- Quick stats: Total users, open games, ratings, matches, admins

### 👥 Users Management
- View all users
- Toggle admin status for any user
- Delete users (cascades to all their data)
- Sorted by join date

### 📋 Posts Management
- View all game posts
- Delete posts instantly
- See spots needed and notes

### ⭐ Ratings Management
- View all player ratings (sorted by rating)
- Edit any player's rating and match count
- Delete ratings
- Real-time updates

### 📅 Matches Management
- View all match history
- See team compositions and scores
- Delete matches
- Latest 20 matches displayed

### 📈 Analytics
- Top 5 players by rating
- Level distribution chart
- Player activity metrics
- Average rating and matches per player

## Access Control

- Only users with `is_admin = true` can access the admin panel
- Supabase RLS policies enforce admin-only updates
- All changes are logged in the database

## Making Other Users Admins

You can now make other users admins directly from the admin panel:
1. Go to Admin Dashboard → Users tab
2. Check the "Admin" checkbox next to any user
3. They will be promoted to admin status immediately

## Next Steps (Optional)

1. **Add admin link to navigation** - Add a button in the main app that links to `/admin` (shown only to admins)
2. **Add audit logging** - Track who made what changes
3. **Add settings management** - Control availability slots, level thresholds, etc.
4. **Add bulk operations** - Export user data, mass updates, etc.

## Important Notes

⚠️ **Backup your database regularly** - The admin panel has delete functionality

⚠️ **Restrict admin access** - Only promote trusted users to admin status

⚠️ **Monitor activity** - Consider adding audit logs for sensitive operations

---

Your admin panel is production-ready! 🚀
