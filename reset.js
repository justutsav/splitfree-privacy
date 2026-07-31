/**
 * Password reset landing page for SplitFree.
 *
 * Why this lives on the static site rather than in the app: the Android build
 * has no VIEW/BROWSABLE intent filter — it was removed deliberately, because
 * one that accepted any app.splitfree.client:// URL let any installed app hand
 * the user a forged session. Without it an email link cannot re-enter the app,
 * so the reset has to complete in a browser and the user then signs in normally.
 *
 * Supabase mints and sends the mail; this page only consumes what the link
 * carries. The Android client runs the implicit flow, so a recovery link lands
 * here as `#access_token=...&type=recovery` and the token can be used directly.
 * The web client runs PKCE and returns `?code=`, which can only be exchanged
 * with a verifier held in that browser's own storage — so that case is detected
 * and explained rather than failing silently.
 *
 * No SDK on purpose: one fetch against GoTrue is the whole job, and a CDN
 * <script> on the page that handles a live session token is a supply-chain risk
 * this does not need to take.
 */
(function () {
  "use strict";

  var SUPABASE_URL = "https://joiokdaaivwsomygrarb.supabase.co";
  // Publishable (anon) key. Public by design — it is already shipped inside the
  // app bundle, and it grants nothing on its own; the bearer token below is what
  // authorises the change.
  var ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvaW9rZGFhaXZ3c29teWdyYXJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMzAyMjEsImV4cCI6MjA5NjgwNjIyMX0.Lc7U1AOp8M5J2JIjU4-CMLerHU0RtjOFaPJHh464kro";

  var form = document.getElementById("form");
  var pw = document.getElementById("pw");
  var show = document.getElementById("show");
  var submit = document.getElementById("submit");
  var msg = document.getElementById("msg");

  function say(text, kind) {
    msg.textContent = text;
    msg.className = "msg" + (kind ? " " + kind : "");
  }

  function parseHash() {
    var h = (location.hash || "").replace(/^#/, "");
    var out = {};
    if (!h) return out;
    h.split("&").forEach(function (pair) {
      var i = pair.indexOf("=");
      if (i === -1) return;
      out[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1));
    });
    return out;
  }

  var hash = parseHash();
  var query = new URLSearchParams(location.search);

  // Take the token out of the address bar immediately. It is a real session
  // token: leaving it there puts it in history, in any screenshot, and in
  // whatever the user pastes when asking for help.
  if (location.hash) {
    history.replaceState(null, "", location.pathname);
  }

  var token = hash.access_token;
  var type = hash.type;
  var hashError = hash.error_description || hash.error;
  var queryError = query.get("error_description") || query.get("error");

  if (hashError || queryError) {
    say(hashError || queryError, "bad");
  } else if (query.get("code")) {
    say(
      "This link was opened in a different browser from the one that requested it. " +
        "Request a new reset from the SplitFree app and open the link on this device.",
      "bad",
    );
  } else if (!token || type !== "recovery") {
    say(
      "This link is invalid or has already been used. Request a new password reset from the SplitFree app.",
      "bad",
    );
  } else {
    form.classList.remove("hidden");
  }

  show.addEventListener("change", function () {
    pw.type = show.checked ? "text" : "password";
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var value = pw.value;
    if (value.length < 6) {
      say("Password must be at least 6 characters.", "bad");
      return;
    }

    submit.disabled = true;
    say("Saving…");

    fetch(SUPABASE_URL + "/auth/v1/user", {
      method: "PUT",
      headers: {
        apikey: ANON_KEY,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: value }),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (r) {
        if (!r.ok) {
          var m =
            (r.body && (r.body.msg || r.body.message || r.body.error_description)) ||
            "Could not update the password. The link may have expired.";
          say(m, "bad");
          submit.disabled = false;
          return;
        }
        form.classList.add("hidden");
        say("Password updated. Open SplitFree and sign in with your new password.", "good");
        // The token is single-use, but drop it from memory anyway.
        token = null;
        pw.value = "";
      })
      .catch(function () {
        say("Network error. Check your connection and try again.", "bad");
        submit.disabled = false;
      });
  });
})();
