# FormFill

FormFill helps blind and low-vision users fill out PDF forms and scanned form images through an accessible, guided workflow — upload a form, answer questions one at a time by keyboard or screen reader, and get a completed document back.

**Live deployment:** https://formfill-rahul.vercel.app

## Branch: `rahul`

This branch builds on [Arya](https://github.com/lucifer0096/Hackathon-AI/tree/Arya)'s first-page UI, adding the remaining pages of the form-filling flow:

| Route | Purpose |
|---|---|
| `/` | Upload a form (PDF, PNG, or JPG) |
| `/review` | Review the fields detected on the form |
| `/overview` | See the form's sections and estimated completion time |
| `/questions` | Answer questions one field at a time |
| `/confirm` | Mandatory read-back of every answer before finishing |

The last four pages currently use placeholder data — they aren't wired to real form parsing yet. Their data shapes match `packages/form-model`'s `Form`/`Section`/`Field` types on `main`, so real data can be swapped in without a rewrite once the AI-integration side (redact → model call → validated `Form`) is ready.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see it running locally.

```bash
npm run build   # production build
npm run lint    # eslint
```

## Stack

Next.js (App Router, Turbopack) · React · Tailwind CSS · Atkinson Hyperlegible font for readability.

## Accessibility

This is not a bolt-on feature — it's the point of the product. Every page follows: keyboard-first navigation, visible focus rings, semantic landmarks and headings, `aria-live` status regions for dynamic updates, and a skip-to-content link. See `docs/ACCESSIBILITY.md` on `main` for the full design rationale.

## Deploying

Deployed via the Vercel CLI from this branch:

```bash
npx vercel --prod
```

This project is not currently connected to GitHub for auto-deploy — redeploy manually after pushing changes, or connect the repo in the Vercel dashboard for deploys on every push.
