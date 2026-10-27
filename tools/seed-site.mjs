// Seeds the LOCAL stack with the cast the website's screens and clips show.
// Nothing here is a real person: Kabir is the signed-in user, his picture is the
// MindOS owl, and the others are Singh, Luffy, Elon and Oggy on coin faces.
// Run from the app folder (it imports the app's local-only seed helpers):
//   cd ../SplitFree/splitfreeapp && node ../../splitfree-privacy/tools/seed-site.mjs
//
// Home screen this produces:
//   you owe       Singh 620   (in Groceries)
//   you are owed  Luffy 1250 | Elon 990 | Oggy 450   (in Catch-up)
//   bell          3 new: Luffy, Elon and Oggy each paid some back
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const APP = "/home/justutsav/projects/SplitFree/SplitFree/splitfreeapp";
const { db, url } = await import(`${APP}/scripts/seed-demo.mjs`);

export const PASSWORD = "splitfree-site";
export const SITE_EMAIL = "kabir@site.splitfree.test";
const OWL = "/home/justutsav/projects/Personal_Work/Project_Mind_OS/app/store/play-icon-512.png";

const ok = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};

const CAST = [
  { key: "you", email: SITE_EMAIL, username: "kabir_k", name: "Kabir", upi: "kabir@okaxis" },
  { key: "singh", email: "singh@site.splitfree.test", username: "singh", name: "Singh", upi: "singh@okicici", coin: "paid-full-bill" },
  { key: "luffy", email: "luffy@site.splitfree.test", username: "luffy", name: "Luffy", upi: "luffy@ybl", coin: "treat-on-me" },
  { key: "elon", email: "elon@site.splitfree.test", username: "elon", name: "Elon", upi: "elon@paytm", coin: "stonks" },
  { key: "oggy", email: "oggy@site.splitfree.test", username: "oggy", name: "Oggy", upi: "oggy@okhdfcbank", coin: "sus" },
];

async function clear() {
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
  const emails = new Set(CAST.map((c) => c.email));
  const users = (data?.users ?? []).filter((u) => emails.has(u.email));
  const ids = users.map((u) => u.id);
  if (!ids.length) return;
  const groups = ok(await db.from("groups").select("id").in("owner_id", ids), "find groups");
  const gIds = groups.map((g) => g.id);
  if (gIds.length) {
    ok(await db.from("expenses").delete().in("group_id", gIds), "clear expenses");
    ok(await db.from("settlements").delete().in("group_id", gIds), "clear settlements");
    ok(await db.from("groups").delete().in("id", gIds), "clear groups");
  }
  const list = ids.join(",");
  const fr = ok(await db.from("friendships").select("id").or(`user_a.in.(${list}),user_b.in.(${list})`), "find friendships");
  const fIds = fr.map((f) => f.id);
  if (fIds.length) {
    ok(await db.from("expenses").delete().in("friendship_id", fIds), "clear friend expenses");
    ok(await db.from("settlements").delete().in("friendship_id", fIds), "clear friend settlements");
    ok(await db.from("friendships").delete().in("id", fIds), "clear friendships");
  }
  for (const id of ids) {
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) throw new Error(`clear user ${id}: ${error.message}`);
  }
}

async function cast() {
  const people = {};
  for (const c of CAST) {
    const { data, error } = await db.auth.admin.createUser({
      email: c.email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: c.name },
    });
    if (error) throw new Error(`create ${c.email}: ${error.message}`);
    people[c.key] = { ...c, id: data.user.id };
    ok(await db.from("profiles").update({
      display_name: c.username, full_name: c.name, upi_id: c.upi ?? null,
      avatar_url: c.coin ? `preset:${c.coin}` : null,
    }).eq("id", data.user.id), `profile ${c.email}`);
  }
  // Kabir's picture: the MindOS owl, uploaded like the app uploads a photo.
  const path = `${people.you.id}/avatar-${Date.now()}.png`;
  ok(await db.storage.from("avatars").upload(path, readFileSync(OWL), { contentType: "image/png", upsert: true }), "owl upload");
  ok(await db.from("profiles").update({ avatar_url: path }).eq("id", people.you.id), "owl avatar");
  return people;
}

async function group(people, name, type, members) {
  const g = ok(await db.from("groups").insert({ name, group_type: type, owner_id: people.you.id, default_currency: "INR" }).select("id").single(), `group ${name}`);
  const rows = ok(await db.from("group_members").insert(members.map((k) => ({
    group_id: g.id, user_id: people[k].id, role: k === "you" ? "owner" : "member",
  }))).select("id, user_id"), `members ${name}`);
  return { id: g.id, memberId: Object.fromEntries(members.map((k) => [k, rows.find((r) => r.user_id === people[k].id).id])) };
}

function minutesAgo(n) {
  return new Date(Date.now() - n * 60_000).toISOString();
}
const today = () => new Date().toISOString().slice(0, 10);

async function expense(people, g, { description, amount, category, payer, between, at }) {
  const e = ok(await db.from("expenses").insert({
    group_id: g.id, description, amount, category, expense_date: today(),
    paid_by_member_id: g.memberId[payer], paid_by_user_id: people[payer].id,
    created_by: people[payer].id, split_type: "equal", created_at: at,
  }).select("id").single(), `expense ${description}`);
  const share = amount / between.length;
  if (!Number.isInteger(share * 100)) throw new Error(`${description}: ${amount}/${between.length} is not exact`);
  ok(await db.from("expense_splits").insert(between.map((k) => ({
    expense_id: e.id, member_id: g.memberId[k], user_id: people[k].id, amount: share,
  }))), `splits ${description}`);
}

async function main() {
  await clear();
  const people = await cast();
  for (const k of ["singh", "luffy", "elon", "oggy"]) {
    const [a, b] = [people.you.id, people[k].id].sort();
    ok(await db.from("friendships").insert({ user_a: a, user_b: b, status: "accepted" }), `friendship ${k}`);
  }
  const crew = ["you", "luffy", "elon", "oggy"];
  const catchup = await group(people, "Catch-up", "other", crew);
  await expense(people, catchup, { description: "Dinner", amount: 2400, category: "food", payer: "you", between: crew, at: minutesAgo(600) });
  await expense(people, catchup, { description: "Bowling", amount: 1020, category: "entertainment", payer: "you", between: ["you", "luffy", "elon"], at: minutesAgo(560) });
  await expense(people, catchup, { description: "Ice cream", amount: 640, category: "food", payer: "elon", between: crew, at: minutesAgo(90) });
  await expense(people, catchup, { description: "Cab home", amount: 600, category: "travel", payer: "oggy", between: crew, at: minutesAgo(60) });
  await expense(people, catchup, { description: "Movie tickets", amount: 1000, category: "entertainment", payer: "you", between: ["you", "luffy"], at: minutesAgo(520) });
  await expense(people, catchup, { description: "Chai and samosa", amount: 300, category: "food", payer: "you", between: ["you", "oggy"], at: minutesAgo(500) });
  await expense(people, catchup, { description: "Coffee", amount: 200, category: "food", payer: "you", between: ["you", "elon"], at: minutesAgo(480) });
  // Each paid some back: these three are the bell's "3 new".
  for (const [k, amount, mins] of [["luffy", 500, 45], ["elon", 100, 35], ["oggy", 150, 20]]) {
    ok(await db.from("settlements").insert({
      group_id: catchup.id, amount, method: "upi", created_by: people[k].id, created_at: minutesAgo(mins),
      from_member_id: catchup.memberId[k], from_user_id: people[k].id,
      to_member_id: catchup.memberId.you, to_user_id: people.you.id,
    }), `settlement ${k}`);
  }
  const groceries = await group(people, "Groceries", "home", ["you", "singh"]);
  await expense(people, groceries, { description: "Vegetables and milk", amount: 1240, category: "groceries", payer: "singh", between: ["you", "singh"], at: minutesAgo(30) });
  console.log(`seeded ${url}: sign in as ${SITE_EMAIL} / ${PASSWORD}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
