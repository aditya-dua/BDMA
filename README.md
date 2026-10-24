# BDMA — Big Data Management & Analytics

Course site for **Part 2 (Lectures 11–20)** of Big Data Management & Analytics, an MBA
elective. Lectures 1–10 are delivered separately; this repository covers the
non-relational half of the course — MongoDB, Atlas Charts, Redis, and a capstone
project.

**Live site:** https://aditya-dua.github.io/BDMA/
**Companion course:** [Streaming Data Analytics](https://sda.adityadua.com/)

---

## Course structure

| Lectures | Module | Topic |
|---|---|---|
| 11–12 | MongoDB 101 | Introduction to non-relational and document databases |
| 13–14 | MongoDB 201 | Querying, indexing, and the aggregation framework |
| 15–16 | Visualisation | Atlas Charts and dashboard storytelling |
| 17–18 | Redis | Key–value databases and real-time analytics |
| 19–20 | Capstone | Project presentations |

Every lecture ships with **notes** (`lectureN/notes.html`) and a **slide deck**
(`lectureN/index.html`). Decks support keyboard navigation, click zones, swipe,
`?s=N` deep-linking, and print-to-PDF.

## Site pages

| Page | Purpose |
|---|---|
| `index.html` | Course home and lecture index |
| `dashboard/` | Reference analytics dashboard built on the course dataset |
| `commands.html` | Searchable MongoDB + Redis command reference (~75 commands) |
| `assignments.html` | Assignments, capstone brief, rubric, and submission flow |

---

## The dataset

Lectures 13–18 all run against a single **Uber ride-analytics** dataset: 15,000
bookings across Delhi NCR for calendar year 2024. The dataset is *generated*, not
downloaded, for three reasons:

1. The original Kaggle dataset requires a login, which blocks students mid-class.
2. Redistributing it here would breach its licence.
3. A fixed seed means every student's dashboard shows **identical numbers**, so the
   notes can quote exact figures and students can verify their own queries.

Regenerate it with:

```bash
node data/generate_uber_dataset.js --rows 15000
```

This writes four files into `data/`:

| File | Use |
|---|---|
| `uber_bookings.json` | Import into MongoDB for the labs |
| `uber_bookings.csv` | Import into Atlas Charts / spreadsheets |
| `uber_summary.json` | Precomputed aggregates |
| `uber_summary.js` | Same aggregates as `window.BDMA_SUMMARY`, for the dashboard |

> **Warning:** the row count is baked into every statistic quoted across ~24 pages.
> Changing `--rows` invalidates the entire site's numbers. Leave it at 15,000.

Load it into MongoDB with:

```bash
mongoimport --db bdma --collection bookings --file data/uber_bookings.json --jsonArray
```

### Deliberate data design

The dataset is shaped to teach, not just to exist:

- `booked_at` and `date` are **strings, not BSON dates**, so Lecture 14 has a real
  reason to teach `$dateFromString` and `$toDate`.
- Fields are **absent** rather than null on failed bookings (`booking_value`,
  `ratings`, `payment_method` and others), which makes `$exists` genuinely
  necessary and makes averaging over missing fields a trap students hit themselves.
- Ranking hours by failure rate puts **03:00 on top at 43.48% — on 46 bookings all
  year**. The real finding, once a volume floor is applied, is 17:00 at 39.92% on
  1,062 bookings. This small-sample trap is used as a teaching thread from Lecture
  13 through Lecture 19.

---

## Local preview

The dashboard reads its data from a plain `<script src>`, so it works over
`file://` — but relative links behave better over HTTP. Any static server works:

```bash
npx serve .
# or, with no install:
node -e 'const h=require("http"),f=require("fs"),p=require("path"),T={".html":"text/html",".css":"text/css",".js":"text/javascript",".json":"application/json",".csv":"text/csv"};h.createServer((q,s)=>{let u=decodeURIComponent(q.url.split("?")[0]);if(u.endsWith("/"))u+="index.html";const x=p.join(process.cwd(),u);if(!f.existsSync(x)){s.writeHead(404);return s.end()}s.writeHead(200,{"Content-Type":T[p.extname(x)]||"application/octet-stream"});f.createReadStream(x).pipe(s)}).listen(8080,()=>console.log("http://localhost:8080"))'
```

Then open http://localhost:8080.

## Deployment

Pushes to the default branch deploy via `.github/workflows/deploy-pages.yml`.

> **One-time setup:** in **Settings → Pages**, set **Source** to **GitHub Actions**.
> The workflow cannot do this itself and deploys will fail until it is set.

## Repository layout

```
index.html              Course home
assignments.html        Assignments, rubric, submission flow
commands.html           Searchable command reference
dashboard/              Reference analytics dashboard
lecture11..20/          notes.html (notes) + index.html (slides)
assets/css/             base, notes, slides, dashboard, pages
assets/js/              theme, slides, dashboard, commands
data/                   Generator + generated dataset
.github/workflows/      Pages deployment
```

## Conventions

- No build step. Static HTML, CSS, and vanilla JS only — no framework, no bundler,
  no dependencies.
- Shared stylesheets; lecture pages carry **no** `<style>` blocks. The class
  vocabulary in `assets/css/notes.css` and `slides.css` is the complete allowed set.
- Charts are hand-rolled SVG. Colours are emitted as `style="fill:var(--token)"`
  rather than as presentation attributes, so charts re-colour on theme switch with
  no re-render.
- Theme preference persists in `localStorage` under `bdma-theme`.
