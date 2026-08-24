# ResumeMuse

An ATS resume builder. Paste a job posting, answer a few questions or upload an
existing resume, and get a tailored, downloadable resume. Static frontend, one
serverless function, no build step, no framework.

```
index.html           landing page + the full resume builder
api/tailor.js        POST endpoint, 5 tasks:
                       extract  posting  -> resume scaffold
                       bullets  own words -> 4-5 tailored bullets
                       rewrite  existing bullets -> retargeted to the posting
                       parse    uploaded resume text -> structured JSON
                       summary  finished profile -> professional summary
lib/ratelimit.js     Upstash if configured, in-memory fallback
lib/validate.js      shared word-count helpers
vendor/              pdf.js + mammoth, lazy-loaded for in-browser file reading
vercel.json          function timeout
.env.example         every variable the backend reads
```

## Deploy on Vercel

1. Push this folder to a GitHub repo.
2. In Vercel, "Add New Project" and import the repo. No build settings needed;
   Vercel serves `index.html` and turns `api/tailor.js` into an endpoint
   automatically.
3. (Optional) In Project Settings -> Environment Variables you can add
   `GROQ_API_KEY`. This is only a fallback for your own testing. In normal use
   each visitor brings their own key (see below), so you do not need one.
4. Redeploy.

## What the builder does

1. Paste a job posting. The `extract` task drafts target titles, a professional
   summary, professional skills and technical skills straight into a live resume.
2. A guided Q&A collects contact details, then each role. The "what did you do
   day to day" answer runs through the `bullets` task and becomes 4 to 5 tailored
   bullets.
3. It keeps offering "add another role" until the user says no. There is no cap.
4. Education and certifications follow, then the `summary` task rewrites the
   summary from what the user actually said.
5. Every line in the live resume is editable in place. Download as PDF
   (print-to-PDF, so text stays selectable for ATS) or Word.

## Uploading an existing resume

Users can start from a resume they already have, in PDF or DOCX, or by pasting
raw text.

- The file is read **in the browser**. It is never uploaded to our server. Only
  the extracted text goes to Groq (with the user's own key) for the `parse` task.
- Parsing libraries are vendored in `vendor/` and lazy-loaded on first upload, so
  the landing page stays light:
  - `pdf.min.js` + `pdf.worker.min.js` (pdf.js) for PDF
  - `mammoth.browser.min.js` for DOCX
- Scanned PDFs with no selectable text are detected and the user is told to paste
  the text instead.
- Once parsed, the Q&A **skips every question the resume already answered** and
  only asks what is missing. Each existing role is shown for review with three
  options: retarget the bullets to this job (`rewrite` task, which re-expresses
  existing facts and never invents new ones), keep them as they are, or describe
  the role again from scratch.
- Old `.doc` (pre-2007) is not readable in the browser; the user is told to save
  as PDF or DOCX.

## Global resume standards

Every prompt shares one writing standard so output works in any market:

- Neutral international English, no regional slang or idioms.
- Dates as `Mon YYYY` and ranges as `Mon YYYY - Mon YYYY`, with `Present` for
  current roles. Numeric dates like `03/2021` are normalised client-side too.
- Phone numbers in international format with a country code. The app never
  guesses a country code it was not given.
- No photo, date of birth, age, gender, marital status, religion or nationality.
- Plain characters only, no em dashes or decorative symbols.

## Bring your own key (BYOK)

The product runs on the visitor's own free Groq key, not yours.

- On first visit a spotlight walks them through getting a key at
  `console.groq.com/keys` and pasting it in.
- The key is saved only in their browser (localStorage), and is sent on each
  request in an `x-groq-key` header, used for that one Groq call, and never
  stored or logged on the server. See the comment block in `api/tailor.js`.
- If a key is rejected by Groq (401), the UI reopens the key panel and asks for a
  fresh one. If no key is present, the builder stays locked.

Why this matters: your server never holds anyone's credentials, and inference
cost sits with each user, not with you.

## Rate limiting

Even with BYOK the endpoint is public, so it is still rate limited by IP to stop
abuse of your function (defaults: `RATE_LIMIT_BURST` per minute,
`RATE_LIMIT_HOURLY` per hour).

- **With Upstash** (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`):
  durable across instances and cold starts. Recommended before real traffic.
- **Without Upstash**: per-instance in-memory counting. Fine for dev and early
  beta.

## Custom subdomain: resume.clearpath.click

clearpath.click stays exactly where it is. You are only pointing one subdomain at
this new project, so the main site is never touched.

1. Deploy this repo as its own Vercel project (steps above).
2. In that project: Settings -> Domains -> add `resume.clearpath.click`.
3. Vercel shows the DNS record to create. For a subdomain it is a CNAME, target
   `cname.vercel-dns.com`.
4. In Hostinger: Domains -> clearpath.click -> DNS Zone -> add a record:
   - Type: `CNAME`
   - Name / Host: `resume`
   - Target / Points to: `cname.vercel-dns.com`
   - TTL: default
5. Save. Propagation is usually minutes, up to an hour. Vercel issues the HTTPS
   certificate automatically once it sees the record.

Notes:
- If clearpath.click's nameservers point to Vercel rather than Hostinger, add the
  same CNAME in Vercel's DNS panel instead of Hostinger.
- If Hostinger refuses the CNAME because a `resume` record already exists, delete
  the old one first.
- Do not change the apex `clearpath.click` records. Only the `resume` subdomain.

Once live, add any env vars you want (`GROQ_MODEL`, Upstash, limits) to the new
project and redeploy.

## Word limits

- Job description: **1000 words**. Enforced in the browser and again on the server.
- "What you actually did": **100 words**. Same, both sides.

The server always re-checks; never trust the client for either.

## The honesty rule

The system prompt forbids inventing numbers, titles, employers or metrics. If a
bullet would want a number the candidate did not give, the model writes it
qualitatively and adds a gap asking for the figure. That behaviour lives in
`api/tailor.js` (the task prompts, sharing one HONESTY rule) and is the core product promise, so
change it carefully.

## Model churn

`GROQ_MODEL` defaults to `openai/gpt-oss-120b`. Groq retires models regularly
(the Llama 3.x models were deprecated in June 2026). If calls start 404-ing,
set `GROQ_MODEL` to the current production model from
https://console.groq.com/docs/models — no code change.

## Local run

```
npm i -g vercel
vercel dev
```

Put your keys in a `.env` file (copy `.env.example`). Without a key the endpoint
returns preview-mode responses so the UI still works.
