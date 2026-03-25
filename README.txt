====================================================
AfricanSTN — africanstn.com
CMS-powered website v1.0 · March 2026
Built with Eleventy + Decap CMS + Netlify
====================================================

HOW THIS WORKS
--------------------------------------
- Content lives in src/_data/ as JSON files
- Pages are templates in src/ and src/pages/
- Decap CMS gives you a dashboard at /admin to edit content
- Every save triggers a Netlify rebuild (takes ~30 seconds)
- No code knowledge needed for day-to-day content changes


SETUP — DO THIS ONCE (20 minutes)
--------------------------------------

STEP 1: Create a GitHub repository
  1. Go to github.com and sign in as Nik-STZA
  2. Click + → New repository
  3. Name it: africanstn
  4. Set to Public
  5. Click Create repository
  6. DO NOT initialise with README

STEP 2: Upload this site to GitHub
  Option A (easiest — GitHub Desktop):
    1. Download GitHub Desktop from desktop.github.com
    2. Clone your new africanstn repo
    3. Copy all files from this zip into the cloned folder
    4. Commit with message "Initial site"
    5. Push to main

  Option B (web upload):
    1. Open github.com/Nik-STZA/africanstn
    2. Click "uploading an existing file"
    3. Drag all files/folders from this zip
    4. Commit

STEP 3: Connect Netlify to GitHub
  1. Go to netlify.com → Add new site → Import from Git
  2. Choose GitHub → authorise → select Nik-STZA/africanstn
  3. Build settings are auto-detected from netlify.toml:
     Build command: npm install && npm run build
     Publish directory: _site
  4. Click Deploy site
  5. Wait ~1 minute for first build

STEP 4: Connect your domain
  1. In Netlify: Site settings → Domain management → Add custom domain
  2. Enter: africanstn.com
  3. Follow DNS instructions at your domain registrar

STEP 5: Enable Netlify Identity (required for CMS login)
  1. In Netlify: Site settings → Identity → Enable Identity
  2. Under Registration: change to "Invite only"
  3. Under Git Gateway: Enable Git Gateway
  4. Go to Identity tab → Invite users → enter your email
  5. Check your email and accept the invite
  6. Set your password

STEP 6: Access the CMS
  1. Go to africanstn.com/admin
  2. Log in with your email and password
  3. You will see the content dashboard


EDITING CONTENT (day-to-day)
--------------------------------------
1. Go to africanstn.com/admin
2. Log in
3. Navigate to the section you want to edit:
   - Pages: Home, About, Services
   - Company directory: add/edit companies
   - Insights & news: write blog posts
   - Site settings: registration numbers, URLs etc
4. Make your changes
5. Click Save → then Publish
6. Site rebuilds in ~30 seconds


ADDING A COMPANY TO THE DIRECTORY
--------------------------------------
1. Admin → Company directory → New company
2. Fill in: name, country, sector, stage, description, website
3. Optionally upload a logo
4. Save and Publish
5. The company appears in the ecosystem page directory


WRITING AN INSIGHTS POST
--------------------------------------
1. Admin → Insights & news → New post
2. Fill in: title, date, slug (URL), excerpt, body (markdown supported)
3. Choose a category
4. Optionally upload a cover image
5. Save → set to Review → Publish
6. Post appears on the site


ADDING IMAGES
--------------------------------------
Any image uploaded through the CMS goes to:
  static/assets/images/

You can also add images directly to that folder and
reference them as /assets/images/filename.jpg in content.


FILE STRUCTURE
--------------------------------------
africanstn/
  src/
    _data/
      site.json          Global settings (footer, reg numbers)
      home.json          Home page copy
      about.json         About page copy
      services.json      Services page copy
      companies/         One JSON file per directory company
      posts/             One JSON file per blog post
    _includes/
      base.njk           Shared nav, footer, HTML shell
    pages/               One .njk file per page
    index.njk            Home page template
  static/
    admin/
      index.html         CMS dashboard
      config.yml         CMS content schema (what's editable)
    assets/
      css/style.css      All styling
      js/script.js       Nav, theme toggle, animations
      images/            Logos and images
  .eleventy.js           Build config
  netlify.toml           Netlify build + deploy config
  package.json           Node dependencies


REGISTRATION NUMBERS (for reference)
--------------------------------------
Sports Tech Africa Limited (UK):
  Companies House: 16850337
  ICO: C1880558

African Sports Technology Network (Pty) Ltd (SA):
  Company reg: 2026/020895/07
  POPIA Reg: 2026-002350


====================================================
africanstn.com · March 2026
Sports Tech Africa Limited · stza.io
====================================================
