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

Play also asks for a separate **Delete account URL**, under App content → Data safety. Give it the
fragment, not the bare URL:

```
https://splitfree-privacy.vercel.app/#delete-account
```

The `id="delete-account"` on that heading is load-bearing. Play requires the link to land on the
deletion steps rather than the top of a policy page, and checks that the page names the app, spells
out the steps, and says what is deleted, what is kept, and for how long. Do not rename or drop the
id without repointing the Console field.

## Editing

`index.html` is the whole site. If you change what the app collects, change the table here and bump
the "Last updated" date — the Play Data Safety form has to keep matching it.

Keep the page in plain language and free of implementation detail: it is a public document for
users, not developer notes. Reasoning about *why* the page is shaped the way it is belongs here in
the README, not in an HTML comment that ships to every visitor.
