# SPAZA — COMPLETE DEPLOYMENT GUIDE
## Eden Extract (Pty) Ltd t/a Spaza | Reg: 2025/756709/07

---

## WHAT YOU ARE DEPLOYING

| Layer       | Technology          | Cost         |
|-------------|---------------------|--------------|
| Frontend    | Next.js 14 (React)  | Free (Vercel)|
| Database    | Supabase PostgreSQL  | Free tier    |
| Auth        | Supabase Auth        | Free tier    |
| File Storage| Supabase Storage     | Free tier    |
| Payments    | PayFast              | % per txn    |
| Hosting     | Vercel               | Free tier    |
| Domain      | spaza.co.za          | ~R80/year    |

**Total starting cost: ~R80/year (domain only)**

---

## STEP 1 — INSTALL NODE.JS

> ⚠️ You need Node.js installed on your computer first.

1. Go to https://nodejs.org
2. Download the **LTS version** (e.g. Node 20 LTS)
3. Install it — click Next through all steps
4. Verify it worked: Open a terminal (Command Prompt / PowerShell) and type:
   ```
   node --version
   ```
   You should see something like `v20.15.0`

---

## STEP 2 — GET THE CODE READY

### 2a. Install dependencies

Open a terminal, navigate to the `spaza` folder, and run:

```bash
npm install
```

This downloads all the libraries. Takes 1–2 minutes.

### 2b. Create your environment file

Copy the example file:
```bash
cp .env.local.example .env.local
```

Leave it open — you will fill it in as you complete the steps below.

---

## STEP 3 — SET UP SUPABASE (Database)

### 3a. Create account & project

1. Go to https://supabase.com → **Start your project** (free)
2. Sign up with GitHub or email
3. Click **New project**
4. Fill in:
   - **Project name:** `spaza`
   - **Database password:** Create a strong password (SAVE THIS)
   - **Region:** Choose `Frankfurt (eu-central-1)` — closest to South Africa
5. Click **Create new project** — wait ~2 minutes

### 3b. Copy your API keys

Once the project is ready:
1. Click **Project Settings** (gear icon, left sidebar)
2. Click **API**
3. Copy these into your `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=       ← "Project URL"
NEXT_PUBLIC_SUPABASE_ANON_KEY=  ← "anon public" key
SUPABASE_SERVICE_ROLE_KEY=      ← "service_role" key (keep secret!)
```

### 3c. Run the database schema

1. In Supabase, click **SQL Editor** (left sidebar)
2. Click **New query**
3. Open `supabase/schema.sql` from this project
4. Copy the entire contents and paste into the SQL Editor
5. Click **Run** (green button)
6. You should see: `Success. No rows returned`

✅ Your database is now set up with all tables, relationships, and security rules.

### 3d. Create Storage bucket for product images

1. Click **Storage** (left sidebar)
2. Click **New bucket**
3. Name: `product-images`
4. Toggle **Public bucket** ON
5. Click **Create bucket**

---

## STEP 4 — SET UP PAYFAST

### 4a. Create a PayFast account

1. Go to https://www.payfast.co.za
2. Click **Sign Up** → choose **Merchant**
3. Fill in Eden Extract (Pty) Ltd details:
   - Company name: **Eden Extract (Pty) Ltd**
   - Registration: **2025/756709/07**
   - Address: **5488 Oregon Crescent, Crystal Park, Benoni, 1501**
   - Phone: **076 789 4445**
   - Email: **navhani.sky@gmail.com**
4. Complete their KYC verification (upload ID + company documents)
5. Wait for approval — usually 2–5 business days

> 💡 While waiting, use the **sandbox** for testing (step 4b)

### 4b. Get Sandbox credentials (for testing NOW)

1. Go to https://sandbox.payfast.co.za
2. Register a sandbox account
3. Log in → go to **Settings** → **Integration**
4. Copy:

```
PAYFAST_MERCHANT_ID=   ← Merchant ID
PAYFAST_MERCHANT_KEY=  ← Merchant Key
PAYFAST_PASSPHRASE=    ← Passphrase (set one if not set)
PAYFAST_ENV=sandbox
```

> When you go live, change `PAYFAST_ENV=live` and swap in your live credentials.

### 4c. PayFast ITN (Webhook) configuration

When your live account is approved:
1. Log into PayFast merchant portal
2. Go to **Settings** → **Integration**
3. Set **Notify URL** to:
   ```
   https://YOUR-DOMAIN.co.za/api/payfast/itn
   ```

---

## STEP 5 — PUSH CODE TO GITHUB

> Vercel deploys from GitHub. You need a free GitHub account.

### 5a. Create GitHub account (if you don't have one)
Go to https://github.com → Sign up (free)

### 5b. Create a new repository

1. Click the **+** icon → **New repository**
2. Name: `spaza`
3. Set to **Private** (important — contains sensitive config)
4. Click **Create repository**

### 5c. Push your code

In your terminal (in the spaza folder):

```bash
git init
git add .
git commit -m "Initial Spaza marketplace commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/spaza.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your GitHub username.

---

## STEP 6 — DEPLOY TO VERCEL

You already have a Vercel account — great!

### 6a. Import the project

1. Go to https://vercel.com/dashboard
2. Click **Add New → Project**
3. Click **Import** next to your `spaza` GitHub repo
4. Framework: **Next.js** (auto-detected)
5. Click **Deploy** — do NOT deploy yet, add environment variables first!

### 6b. Add environment variables

Before clicking deploy, click **Environment Variables** and add ALL variables from your `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
PAYFAST_MERCHANT_ID
PAYFAST_MERCHANT_KEY
PAYFAST_PASSPHRASE
PAYFAST_ENV
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_COMPANY_NAME
NEXT_PUBLIC_TRADING_NAME
NEXT_PUBLIC_REG_NUMBER
NEXT_PUBLIC_COMPANY_EMAIL
NEXT_PUBLIC_COMPANY_PHONE
NEXT_PUBLIC_COMPANY_ADDRESS
```

Set `NEXT_PUBLIC_APP_URL` to `https://spaza.vercel.app` for now (update to your domain later).

### 6c. Deploy

Click **Deploy**. Vercel will build and deploy in ~2 minutes.

You'll get a live URL like `https://spaza-abc123.vercel.app` 🎉

---

## STEP 7 — BUY & CONNECT YOUR DOMAIN

### 7a. Register spaza.co.za

Register at one of these SA registrars:
- **Afrihost:** https://www.afrihost.com/domain (~R80/year)
- **Web4Africa:** https://www.web4africa.co.za/domains
- **Domains.co.za:** https://www.domains.co.za

### 7b. Connect domain to Vercel

1. In Vercel → your project → **Settings** → **Domains**
2. Click **Add Domain** → type `spaza.co.za`
3. Vercel gives you DNS records (A record + CNAME)
4. Log into your domain registrar's control panel
5. Add those DNS records
6. Wait 10–60 minutes for propagation

### 7c. Update environment variables

In Vercel → Environment Variables, update:
```
NEXT_PUBLIC_APP_URL=https://spaza.co.za
```

Click **Redeploy** from the Deployments tab.

---

## STEP 8 — FINAL CHECKS BEFORE GOING LIVE

Run through this checklist:

### Functionality
- [ ] Homepage loads correctly
- [ ] Products display (add a test product via Supabase dashboard)
- [ ] Sign up / Sign in works
- [ ] Cart adds and removes items
- [ ] Checkout redirects to PayFast sandbox
- [ ] PayFast sandbox payment completes
- [ ] Order shows in Supabase `orders` table
- [ ] ITN webhook fires (`payments` table updated)
- [ ] Seller registration flow works
- [ ] Seller subscription redirects to PayFast

### Content
- [ ] All 6 legal pages load (Terms, Privacy, Returns, About, Contact, Seller Agreement)
- [ ] Eden Extract company details correct throughout
- [ ] Contact form submits
- [ ] Footer links all work

### PayFast Vetting
- [ ] Business name matches CIPC: **Eden Extract (Pty) Ltd**
- [ ] Reg number visible on site: **2025/756709/07**
- [ ] Physical address on Contact page
- [ ] Refund/Returns policy clearly published
- [ ] Privacy Policy published and POPIA compliant
- [ ] Terms & Conditions published
- [ ] Secure checkout (HTTPS) ✅ (Vercel provides this free)
- [ ] Product/service descriptions clear and accurate
- [ ] Pricing in ZAR clearly displayed

---

## STEP 9 — SWITCH TO PAYFAST LIVE

Once PayFast approves your merchant account:

1. In Vercel environment variables, update:
   ```
   PAYFAST_MERCHANT_ID=   ← your LIVE merchant ID
   PAYFAST_MERCHANT_KEY=  ← your LIVE merchant key
   PAYFAST_PASSPHRASE=    ← your LIVE passphrase
   PAYFAST_ENV=live
   ```
2. Set your notify URL in PayFast portal to `https://spaza.co.za/api/payfast/itn`
3. Redeploy from Vercel dashboard
4. Do a real R1.00 test transaction

---

## ONGOING: ADDING PRODUCTS TO YOUR MARKETPLACE

Until you build the full seller dashboard UI, you can add products directly in Supabase:

1. Go to Supabase → **Table Editor** → `products`
2. Click **Insert row**
3. Fill in the columns — minimum required:
   - `seller_id` — first create a seller record
   - `name`, `slug`, `price_cents`
   - `status` → set to `active`

---

## SUMMARY — YOUR TECH STACK

```
Browser / Customer
       ↓
   Vercel CDN  ←──── Next.js (your code on GitHub)
       ↓
  Next.js App
       ↓         ↓              ↓
  Supabase    PayFast ITN    Supabase
  (data/auth)  webhook       (storage)
```

---

## SUPPORT CONTACTS

| Service   | Support URL                              |
|-----------|------------------------------------------|
| Supabase  | https://supabase.com/docs                |
| Vercel    | https://vercel.com/docs                  |
| PayFast   | https://developers.payfast.co.za         |
| Next.js   | https://nextjs.org/docs                  |

---

*Guide prepared for Eden Extract (Pty) Ltd t/a Spaza | Reg: 2025/756709/07*
*Contact: navhani.sky@gmail.com | 076 789 4445*
