# splitfree-privacy

The privacy policy for the SplitFree Android app (`app.splitfree.client`), as a single static page.

Google Play requires a publicly reachable privacy policy URL for any app that collects personal
data. SplitFree collects an email, a name, a photo and a UPI ID, so it needs one.

## Deploy

Static HTML, no build step. On Vercel: import the repo and accept the defaults — framework preset
"Other", no build command, output directory `.` (`vercel.json` already pins this).

Then put the resulting URL in two places:

1. **Play Console** → App content → Privacy policy.
2. **The app** → the "Privacy policy" row in Account → Settings, which currently points at the
   placeholder in `src/routes/_authenticated/account_.settings.tsx`.

## Editing

`index.html` is the whole site. If you change what the app collects, change the table here and bump
the "Last updated" date — the Play Data Safety form has to keep matching it.
