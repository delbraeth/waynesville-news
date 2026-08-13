# Deploying Waynesville Daily Brief

**Architecture:** domain + email stay at **Spaceship** → DNS at **Cloudflare** → the static site
auto-deploys on **Cloudflare Pages**. Everything is free except the domain (already owned).

These are the steps only you can do (they need your logins).

## 1. Put the code on GitHub

From the unzipped project folder:

```bash
git init
git add -A
git commit -m "Waynesville Daily Brief — Phase 1"
# Create an empty repo at github.com/<you>/waynesville-news, then:
git remote add origin https://github.com/<you>/waynesville-news.git
git branch -M main
git push -u origin main
```

(Use the **HTTPS** remote URL above — no SSH key setup needed.)

## 2. Connect Cloudflare Pages

1. Sign in at **dash.cloudflare.com** → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Select the `waynesville-news` repo.
3. Build settings:
   - **Framework preset:** Astro
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. **Save and Deploy.** You get a free `*.pages.dev` URL — that's your live staging site.

## 3. Point `waynesville.news` at it

1. In the Pages project → **Custom domains** → **Set up a domain** → enter `waynesville.news`.
2. Easiest path: **add the domain to Cloudflare** (Add a Site → Free plan), then at **Spaceship** change the
   domain's **nameservers** to the two Cloudflare gives you. Cloudflare then handles DNS + free SSL and the
   custom domain "just works."
   - Alternative (keep DNS at Spaceship): add the exact CNAME/records Cloudflare specifies in Spaceship's DNS panel.
3. Propagation takes minutes to a few hours. SSL is automatic.

## 4. Keep email working at Spaceship

No change to your mailboxes. If you move nameservers to Cloudflare in step 3, re-create your existing
**MX** records (and **SPF / DKIM / DMARC**) in Cloudflare DNS so `editor@waynesville.news` keeps flowing —
Spaceship lists those values in your email settings. If you keep DNS at Spaceship, nothing changes.

## 5. Ongoing publishing

Every `git push` — a new brief in `src/content/briefs/`, or refreshed `src/data/*.json` — triggers an
automatic rebuild and deploy. That is the entire publish loop.

---

Need help with any step when you get there? Say the word and I'll walk it through with you.
