# ExamPortal — Online Assessment System

A secure, full-stack **Next.js 15** online exam portal with dynamic question randomization, Bangla text support (SutonnyMJ), MathJax 3 rendering, and Firebase Firestore persistence.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Firebase Setup](#firebase-setup)
- [Adding Your Questions](#adding-your-questions)
- [File Structure](#file-structure)
- [How Randomization Works](#how-randomization-works)
- [Tech Stack & Design Decisions](#tech-stack--design-decisions)
- [Deployment](#deployment)

---

## Features

### Admin Dashboard (`/admin`)
- 🔐 Firebase Email/Password authentication
- 📅 Exam scheduler with title, date, time, and duration
- 🎲 Randomization configurator — select source sets + total question count
- ➕ / 🗑️ Create and delete scheduled exams
- 📊 Per-exam results viewer with correct/wrong/skipped/time stats
- 🔴 Negative marking support (0, 0.25, 0.5, 1 per wrong answer)

### Student Portal (`/student`)
- 🪪 ID-based login (no password — just a Student ID)
- 📋 Live exam board with status badges (Upcoming / Live / Ended)
- ⏱️ Countdown timer for upcoming exams
- 🚫 "Already submitted" guard — no re-attempts
- 🎯 Unique randomized paper per student session

### Exam Arena (`/student/exam/[id]`)
- ⏱️ Sticky countdown timer (critical pulse animation under 5 minutes)
- 📝 Rendered HTML questions with Bangla (SutonnyMJ) + LaTeX (MathJax 3)
- 🔒 **Answers are locked after first selection** — cannot be undone
- 🧭 Question navigator panel (grid) for instant jump
- 📊 Progress bar showing answered/total
- 🤖 Auto-submit on timer expiry
- ✅ Immediate score display with correct/wrong review

---

## Quick Start

### 1. Clone and install

```bash
git clone <your-repo>
cd exam-portal
npm install
```

### 2. Set up environment variables

```bash
cp .env.local.example .env.local
# Fill in your Firebase config values
```

### 3. Add the SutonnyMJ font

Download `SutonnyMJ.ttf` (free, from [omicronlab.com](https://www.omicronlab.com/bangla-fonts.html)) and place it at:

```
public/fonts/SutonnyMJ.ttf
```

### 4. Generate placeholder question sets (optional, for testing)

```bash
node scripts/generate-sets.js
```

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Firebase Setup

### Step 1 — Create a project
1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a new project

### Step 2 — Enable Authentication
1. Go to **Authentication → Sign-in method**
2. Enable **Email/Password**
3. Go to **Authentication → Users** and add your admin email + password

### Step 3 — Create Firestore Database
1. Go to **Firestore Database → Create database**
2. Start in **test mode** (then apply the rules below)
3. Choose your region

### Step 4 — Deploy Security Rules
```bash
npm install -g firebase-tools
firebase login
firebase init firestore
firebase deploy --only firestore:rules
```

Or paste the contents of `firestore.rules` directly in the Firebase Console.

### Step 5 — Get Web App Config
1. Go to **Project Settings → General → Your apps**
2. Add a **Web app** if not already created
3. Copy the config values into your `.env.local`

---

## Adding Your Questions

Place your scraped JSON files in the `/data` directory.

### Naming Convention

The file name **must match** what you enter in the Admin Dashboard's "Question Sets" selector:

| Admin selector | File path |
|---|---|
| `set-1` | `data/set-1.json` |
| `biology-ch5` | `data/biology-ch5.json` |
| `physics-2024` | `data/physics-2024.json` |

### JSON Format

Each file must be an array of question objects:

```json
[
  {
    "question_html": "<p>Your question with <span class=\"bangla\">বাংলা</span> or $\\LaTeX$</p>",
    "options_html": [
      "<p>Option A</p>",
      "<p>Option B — the correct one</p>",
      "<p>Option C</p>",
      "<p>Option D</p>"
    ],
    "correct_answer_html": "<p>Option B — the correct one</p>",
    "solution_html": "<p>Explanation here</p>"
  }
]
```

> ⚠️ **Important:** `correct_answer_html` must exactly match one of the strings in `options_html` (after `.trim()`). The API uses string comparison to find the `correctIndex`. If there's no match, the question is skipped with a warning.

### Wrapped Format (also supported)

```json
{
  "questions": [ ... ]
}
```

Or:

```json
{
  "data": [ ... ]
}
```

---

## File Structure

```
exam-portal/
├── app/
│   ├── layout.tsx              # Root layout (MathJax 3, Google Fonts)
│   ├── page.tsx                # Landing page (role selector)
│   ├── globals.css             # Tailwind v4 + design tokens + SutonnyMJ
│   ├── admin/
│   │   ├── layout.tsx          # Admin layout (auth guard)
│   │   ├── page.tsx            # Admin Dashboard (full SPA-like)
│   │   └── login/
│   │       └── page.tsx        # Admin login (Firebase Auth)
│   ├── student/
│   │   ├── layout.tsx          # Student layout
│   │   ├── page.tsx            # Student portal + exam board
│   │   └── exam/
│   │       └── [id]/
│   │           └── page.tsx    # Exam Arena (use() params, timer, submit)
│   └── api/
│       └── questions/
│           └── route.ts        # POST /api/questions (loads + randomizes)
├── components/
│   ├── MathJaxRenderer.tsx     # dangerouslySetInnerHTML + MathJax typeset
│   ├── CountdownTimer.tsx      # Dual-variant timer (card + exam-header)
│   └── QuestionCard.tsx        # MCQ card with answer lock
├── lib/
│   ├── types.ts                # All TypeScript interfaces + helpers
│   ├── firebase.ts             # Firebase app initialization
│   └── firestore.ts            # All Firestore CRUD operations
├── data/
│   ├── set-1.json              # Your question sets go here
│   ├── set-2.json
│   └── ...
├── public/
│   └── fonts/
│       └── SutonnyMJ.ttf       # ← Add this manually
├── scripts/
│   └── generate-sets.js        # Helper: duplicate test sets
├── firestore.rules             # Firestore security rules
├── firestore.indexes.json      # Composite indexes for queries
└── .env.local.example          # Environment variables template
```

---

## How Randomization Works

The randomization runs **server-side** in `app/api/questions/route.ts`:

1. **Load** — All JSON files for the selected source sets are read from `/data`
2. **Enrich** — Each question gets a `correctIndex` (matched by string comparison with `correct_answer_html`) and a stable `_key` (`source__index`)
3. **Shuffle** — A Fisher-Yates shuffle randomizes the combined pool
4. **Slice** — The first N questions from the shuffled array are selected
5. **Serve** — The prepared questions array is returned to the client

Every student who starts the exam gets a unique random ordering, drawn from the same pool defined by the admin.

---

## Tech Stack & Design Decisions

| Decision | Choice | Why |
|---|---|---|
| Framework | Next.js 15 App Router | `use()` for async params, Server Components for API |
| Styling | Tailwind CSS v4 | Native CSS imports, no config file needed |
| Database | Firebase Firestore | Real-time capable, generous free tier |
| Admin Auth | Firebase Email/Password | Secure, managed, easy to set up |
| Student Auth | Session ID only | Low friction for students; no account needed |
| Math Rendering | MathJax 3 CDN | Best LaTeX support, `typesetPromise` API |
| Bangla Font | SutonnyMJ | Standard for legacy Bijoy-encoded Bangla text |
| Randomization | Fisher-Yates shuffle | Unbiased, O(n) |
| Answer locking | `prev[key] !== undefined` guard | Prevents React re-render races |

---

## Deployment

### Vercel (Recommended)

```bash
npm install -g vercel
vercel
```

Set environment variables in the Vercel dashboard under **Settings → Environment Variables**.

The `/data/*.json` files are bundled with the deployment and read at runtime by the API route using Node.js `fs`.

### Self-hosted

```bash
npm run build
npm start
```

> **Note:** The `/api/questions` route uses Node.js `fs` (not Edge Runtime) to read JSON files. Ensure your deployment environment supports Node.js runtime (default on Vercel). If you need Edge compatibility, migrate question storage to Firestore.

---

## Extending the App

### Add more question sets
Drop any `.json` file in `/data` and add its basename to the `AVAILABLE_SETS` array in `app/admin/page.tsx`.

### Leaderboard
Query `exam_results` filtered by `examId`, ordered by `score DESC` — all indexes are already defined in `firestore.indexes.json`.

### Student result history
Use `getResultsForStudent(studentId)` already implemented in `lib/firestore.ts`.

### Timed per-section questions
Extend `ScheduledExam` to include `sections: Array<{ source, count }>` instead of a flat `examSources` array, then update the randomization logic in the API route.
