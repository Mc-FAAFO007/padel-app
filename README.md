# PadelMatch — Deployment Guide (MacBook)

Step-by-step instructions written for Mac. No prior experience needed.
Estimated time: **2–3 hours**.

---

## What you'll end up with

- A live web app at a URL like `https://padel-yourclub.vercel.app`
- Members sign in with just their email — no passwords needed
- All data saves to a real database (nothing disappears on refresh)
- Works on any phone and can be installed like a native app
- Free to run for a small club

---

## Before you start — open Terminal

You'll use the Terminal app throughout this guide. It's already on your Mac.

**To open Terminal:**
Press **⌘ + Space**, type `Terminal`, press Enter.

A black or white window will open with a blinking cursor. This is where you'll type the commands in this guide. After typing each command, press **Enter** to run it.

---

## Step 1 — Unzip the project

1. Find the `padel-app.zip` file you downloaded (probably in your Downloads folder)
2. Double-click it — it will unzip into a folder called `padel-app`
3. Move the `padel-app` folder somewhere easy to find, like your Desktop

---

## Step 2 — Install Node.js (the engine that runs the app)

Node.js is a free tool that powers the app. You only need to install it once.

1. Go to **https://nodejs.org**
2. Click the big button that says **"LTS"** (recommended for most users)
3. Open the downloaded `.pkg` file and follow the installer — just keep clicking Continue and Install
4. Once done, verify it worked. In Terminal, type:

```
node -v
```

You should see something like `v20.11.0`. Any number means it worked ✓

---

## Step 3 — Create a Supabase account (your database)

Supabase is the free database that stores all your member data, posts, and ratings.

1. Go to **https://supabase.com** and click **"Start your project"**
2. Sign up — the easiest option is **"Continue with GitHub"**
   - If you don't have a GitHub account, create one free at **https://github.com** first
3. Once logged in, click **"New project"** and fill in:
   - **Name:** `padel-club`
   - **Database Password:** make something up and save it in Notes
   - **Region:** choose one near your players (e.g. West EU for Europe)
4. Click **"Create new project"** and wait about 2 minutes

---

## Step 4 — Set up the database tables

This tells your database what information to store.

1. In Supabase, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. On your Mac, open Finder → go to your `padel-app` folder → open the `supabase` folder → right-click `schema.sql` → **Open With → TextEdit**
4. Press **⌘ + A** to select everything, then **⌘ + C** to copy
5. Go back to Supabase, click inside the SQL editor, press **⌘ + V** to paste
6. Click the green **"Run"** button (or press **⌘ + Enter**)
7. You should see **"Success. No rows returned"** ✓

---

## Step 5 — Get your Supabase API keys

These let your app communicate with the database.

1. In Supabase, click the **gear icon (Settings)** in the left sidebar → **"API"**
2. Keep this page open — you'll need two things:
   - **Project URL** — looks like `https://abcdefghij.supabase.co`
   - **anon / public key** — a very long string starting with `eyJ...`

---

## Step 6 — Set up the project on your Mac

In Terminal, navigate to the padel-app folder. The easiest way:

1. Type `cd ` (with a space after it) in Terminal — don't press Enter yet
2. Open Finder, find your `padel-app` folder, and **drag it into the Terminal window**
3. The path fills in automatically — now press **Enter**

Install the app's dependencies (downloads everything it needs — takes 1–2 mins):

```
npm install
```

A lot of text will scroll by — that's normal. Wait until you see a cursor again.

Create your environment file (stores your Supabase keys):

```
cp .env.local.example .env.local
```

Open it to edit:

```
open -e .env.local
```

TextEdit will open showing two lines:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE
```

Replace the placeholder values with your actual **Project URL** and **anon key** from Step 5. No spaces around the `=` sign.

Save with **⌘ + S** and close TextEdit.

Test the app locally:

```
npm run dev
```

Open your browser and go to **http://localhost:3000** — you should see the PadelMatch app! 🎾

Press **⌘ + C** in Terminal when you're done testing to stop it.

---

## Step 7 — Put your code on GitHub

GitHub stores your code online so Vercel can deploy it.

1. Go to **https://github.com** and sign in
2. Click **"+"** (top right) → **"New repository"**
3. Name it `padel-app`, leave everything else as default, click **"Create repository"**
4. **Ignore** the instructions GitHub shows on the next page

Back in Terminal (still inside the padel-app folder), run these **one at a time**:

```
git init
```
```
git add .
```
```
git commit -m "Initial deploy"
```
```
git branch -M main
```
```
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/padel-app.git
```
> ⚠️ Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username

```
git push -u origin main
```

**If it asks for a password:** GitHub no longer accepts your regular password here. You need a Personal Access Token:
- Go to GitHub → click your profile photo → **Settings** → scroll down to **"Developer settings"** → **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**
- Give it a name, tick the **"repo"** checkbox, click **Generate token**
- Copy the token and use it as the password in Terminal

---

## Step 8 — Deploy to Vercel (go live!)

1. Go to **https://vercel.com** → **"Sign Up"** → **"Continue with GitHub"**
2. Click **"Add New Project"** and import your `padel-app` repository
3. **Before clicking Deploy** — scroll down to **"Environment Variables"** and add:
   - Name: `NEXT_PUBLIC_SUPABASE_URL` / Value: your Supabase Project URL
   - Name: `NEXT_PUBLIC_SUPABASE_ANON_KEY` / Value: your Supabase anon key
4. Click **"Deploy"**

After about 1 minute you'll see a live URL like `https://padel-app.vercel.app` 🎉

---

## Step 9 — Configure email login

Members sign in via a magic link sent to their email. You need to tell Supabase where to send them after clicking it.

1. In Supabase → **Authentication** (left sidebar) → **URL Configuration**
2. Set **Site URL** to your Vercel URL e.g. `https://padel-app.vercel.app`
3. Under **Redirect URLs**, click **"Add URL"** and enter: `https://padel-app.vercel.app/auth/callback`
4. Click **Save**

---

## Step 10 — Share with your members

Send members your Vercel URL. To install it like an app on their phone:

- **iPhone:** Open the URL in Safari → tap the Share button → **"Add to Home Screen"**
- **Android:** Open in Chrome → tap the three-dot menu → **"Add to Home Screen"**

---

## Making changes in the future

1. Ask Claude for the change and download the updated file
2. Replace the old file in your `padel-app` folder with the new one
3. In Terminal (from inside the padel-app folder) run:

```
git add .
git commit -m "Update"
git push
```

Vercel detects the push and redeploys in about 30 seconds automatically.

---

## Troubleshooting

**"command not found: npm"**
→ Node.js didn't install. Repeat Step 2 and make sure you open and run the `.pkg` file.

**"permission denied"**
→ Add `sudo ` before the command (e.g. `sudo npm install`) and enter your Mac login password when prompted.

**"cd: no such file or directory"**
→ The path is wrong. Try dragging the padel-app folder into Terminal after typing `cd ` to auto-fill the correct path.

**App loads but shows a Supabase error**
→ Open `.env.local` again (`open -e .env.local`) and check there are no extra spaces, the URL starts with `https://`, and the anon key is complete (it's very long — make sure you copied all of it).

**Login email not arriving**
→ Check spam. For more reliable delivery, connect a free email service: Supabase → Settings → Auth → SMTP Settings → use **Resend.com** (free, easy to set up).

**"relation does not exist" error**
→ The database tables weren't created. Repeat Step 4.

**Git asks for a password when pushing**
→ Use a Personal Access Token — see the note in Step 7.
