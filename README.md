# splitfree.justutsav.com

The SplitFree website: the landing page, the privacy policy Google Play links to, and the
delete-account instructions. Static files, no build step, deployed by Vercel from this repo.

| Path | What |
| --- | --- |
| `/` | `index.html`: the landing page |
| `/privacy` | `privacy.html`: the privacy policy (Play Console → App content → Privacy policy) |
| `/privacy#delete-account` | the deletion steps (Play Console → Data safety → Delete account URL) |
| `/delete-account` | short link, redirects to the above |
| `/logo.png` | the icon the sign-in email template loads; keep it at this path |
| `/reset-password` | legacy password-reset page from before email codes; kept for old links |

The old address `splitfree-privacy.vercel.app/` redirects to `/privacy` (see `vercel.json`), so
every link Play or the app ever handed out still lands on the policy.

## Hosting on splitfree.justutsav.com

1. Vercel → this project → Settings → Domains → add `splitfree.justutsav.com`.
2. Cloudflare → justutsav.com → DNS → add `CNAME splitfree → cname.vercel-dns.com`,
   **DNS only** (grey cloud), so Vercel can issue the certificate.
3. When `https://splitfree.justutsav.com/privacy` loads, put it in Play Console (privacy policy)
   and `https://splitfree.justutsav.com/privacy#delete-account` in the Data safety form.

## Editing the policy

`privacy.html` is the legal text. The app shows the same document natively in
`splitfreeapp/src/routes/_authenticated/account_.settings_.privacy.tsx`; when one changes, change
the other and both "Last updated" dates, and keep Play's Data safety form matching.

## How the page is built

- Type: Anek Latin (display, figures, interface) and Literata (reading), both self-hosted from
  `assets/fonts`, so the site makes no request to any other company.
- The fixed half is one three.js scene (`assets/js/stage.js`, `assets/vendor/three.module.min.js`
  r169): the phone shows real app screens, the coins are the app's own avatar faces exported
  from `src/lib/avatar-presets.ts`. Everything it shows also exists in HTML, so the page works
  without WebGL. `assets/js/site.js` owns every control.
- `assets/shots/*.webp` and `assets/video/*.mp4` are captured from the real app running against
  the local stack, never production data. The story's screens and clips use a made-up cast
  (`tools/seed-site.mjs`: Kabir with the MindOS owl, Singh, Luffy, Elon, Oggy); the privacy
  page's screens come from the app's own demo seed (`scripts/seed-demo.mjs`).
- The Content-Security-Policy in `vercel.json` allows only this origin (plus the Supabase API for
  the reset page). Adding anything from a CDN means editing it.

## Refreshing the pictures

`tools/` holds the scripts that made them (not deployed; see `.vercelignore`). They drive the
real app against the **local** Supabase stack, so start it and seed it first, and run them from
`splitfreeapp/` with Node 22:

```bash
npx supabase start
# the app on :5299 against the local stack (tools/app-lib.mjs has the exact command)
node ../../splitfree-privacy/tools/record-clips.mjs      # home + add, remind, scan, settle clips
node scripts/seed-demo.mjs
node ../../splitfree-privacy/tools/capture-screens.mjs /tmp/shots plum      # privacy-page screens
```

`record-clips.mjs` reseeds before each clip, writes `assets/video/<clip>.mp4` and its poster, and
`assets/shots/home.webp` / `settled.webp`. Pass clip names to redo only some. The scan clip's
camera is a drawn shop standee fed to Chrome as a fake webcam. `tools/flow.mjs` runs ad-hoc steps
against the app and screenshots each one, for finding the next thing to tap.
Convert PNGs with `convert x.png -quality 84 x.webp`.
`tools/export-coins.mts` re-exports the coin faces from a copy of `src/lib/avatar-presets.ts`.
`node tools/serve-like-vercel.mjs . 8790` serves the site with the same redirects and CSP as
production, for checking locally.
