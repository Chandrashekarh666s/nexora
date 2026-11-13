# NEXORA: complete developer guide (0 to 100%)

Read in order. Each step says WHAT to do, WHY, and what you should SEE. If you do not see it, stop and fix it before moving on.

---
## MODULE 1: How the system works (15 minutes)
```
Browser (landing, dashboards, arena)      <- what users see; anyone can tamper with it, so it decides nothing
   | HTTPS request  e.g. POST /api/auth/login
Express server (src/)                     <- the guard + brain: checks login, role, section, then acts
   |-- MongoDB Atlas                      <- permanent memory (users, problems, submissions, audit log)
   |-- Judge0                             <- a sealed sandbox that runs student code (never inside Node)
   |-- GitHub / LeetCode public APIs      <- optional extra data, refreshed automatically
```
Key words: **API** = a URL that runs one server function. **Database** = data that survives restarts. **JWT cookie** = the login ticket (httpOnly, so JavaScript cannot steal it). **.env** = secrets file, never uploaded. **RBAC** = role-based access control. **IDOR** = changing an id in a URL to read someone else's data; every route here checks permission BEFORE looking the record up.

## MODULE 2: Folder, tools, Git (30 minutes)
1. Install VS Code, Node.js 22 LTS, Git. Check in a terminal: `node -v` (v22+), `npm -v`, `git --version`.
2. Create your project folder: Documents -> new folder `nexora`. Unzip `nexora.zip` and **move the contents of the inner `nexora` folder** into it, so `package.json` sits directly inside. (Why: every command must run in the folder containing `package.json`.)
3. VS Code -> File -> Open Folder -> pick it. Open the terminal with Ctrl+` . Run `ls` (Mac/Linux) or `dir` (Windows): you must see `package.json`.
4. One-time Git identity: `git config --global user.name "Your Name"` and `git config --global user.email "you@email.com"`.
5. Create an EMPTY repo named `nexora` on github.com (do not tick "Add README"). Then:
```
git init
git status            # .env must NOT be listed (the .gitignore blocks it)
git add .
git commit -m "NEXORA v1"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/nexora.git
git push -u origin main
```
**Why Git/GitHub:** Git = undo button + history on your machine. GitHub = online copy; Render deploys by pulling from it. **Daily loop:** `git add .` -> `git commit -m "what changed"` -> `git push`. If a secret ever shows in `git status`, stop; a pushed password is a leaked password.

## MODULE 3: Database and secrets (20 minutes)
1. mongodb.com/atlas -> free **M0** cluster.
2. Database Access -> add a user (letters+digits only password, so no URL-encoding problems).
3. Network Access -> Add current IP (later add `0.0.0.0/0` for Render, free tier, strong password).
4. Connect -> Drivers -> copy the string; insert the database name before `?`:  
   `mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/nexora?retryWrites=true&w=majority`
5. `cp .env.example .env` (Windows: `copy .env.example .env`). Generate the secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
6. In `.env` fill `MONGODB_URI`, `JWT_SECRET`, and the four `FACULTY_*` lines (your own name, employee ID, email, an initial password of 10+ chars with a letter and a number).
Never paste `.env` into chats or screenshots.

## MODULE 4: Run it and walk every feature (45 minutes)
```
npm install
npm run test:unit        # 23 tests, no database -> all green
npm run seed:faculty     # creates the first faculty; then DELETE the FACULTY_* lines from .env
npm start
```
Open `http://localhost:3000/api/health`: must show `"db":"up"`. If not, fix Atlas (IP allow-list / password) first.

**Walkthrough (this tests every role):**
1. Landing -> Login with the faculty ID + initial password -> forced to choose a new password.
2. Faculty -> **Team** -> Create invite (Student coordinator). Copy the code (shown once).
3. Private/incognito window -> Landing -> Join the Club -> "I am joining as: Student coordinator" -> paste the invite -> register.
4. Another window: register a normal **Student** (semester 3, section A).
5. Faculty -> Team -> Section assignments: coordinator + semester 3 + section A -> Assign.
6. Coordinator -> **My students**: sees only semester 3 / A. Try a student of another section: they are invisible; the API answers 403.
7. Coordinator -> **Problems** -> New problem (add 1 public + 1 hidden test) -> Save -> Publish.
8. Student -> **Practice** -> open it -> Coding Arena. Without Judge0 the page says execution is not configured (it never fakes results). With Judge0 (Module 5): Run = public samples only, no points; Submit = all tests incl. hidden, stored.
9. Student **Home**: stats, crown, activity calendar update from the real submission. **Leaderboard** shows points, house cup, crowns.
10. Coordinator/Faculty -> **Audit** -> pick the problem -> Uploaded vs Not uploaded (Pending / Not attempted / Deadline missed / Technical failure). Click a row to read the submitted code (this is logged).
11. Faculty -> **Logs**: every invite, assignment, publish, code view, suspension and failed access is recorded.

**Who can do what:** Student = own data. Coordinator = student powers + assigned sections. Faculty = everything. The server enforces it (`src/lib/scope.js`, `src/lib/rbac.js`); hiding tabs is only cosmetic.

## MODULE 5: APIs and integrations (what, why, how)
| Integration | Why | Where | Status |
|---|---|---|---|
| **Judge0** (code execution) | Student code must run in an isolated sandbox, never in Node | `src/lib/judge0.js`, `routes/problems.js` | Set `JUDGE0_API_URL` (+ `JUDGE0_API_KEY`) in `.env` |
| **GitHub** (official REST API) | Shows public repos and recent push activity next to the student's profile | `src/lib/github.js` | Works without a key; optional `GITHUB_TOKEN` (no scopes) lifts the rate limit |
| **LeetCode** | Shows public solved counts / active days | `src/lib/leetcode.js` | **No official API exists.** Uses the website's public GraphQL; may break or be blocked. |

**Getting Judge0 free:** use a hosted Judge0 CE on RapidAPI (free tier) -> `JUDGE0_API_URL=https://judge0-ce.p.rapidapi.com`, `JUDGE0_API_KEY=<your RapidAPI key>`; or self-host with Docker (judge0.com docs) -> `JUDGE0_API_URL=http://localhost:2358`.

**Automation:** a student links usernames once (Connect tab). `src/lib/sync.js` then refreshes every `SYNC_HOURS` (default 6) by itself, gently (about 1 profile per 1.5 s). Nothing for you to run.

**Design decision (improvement over the brief):** LeetCode/GitHub data is *self-reported and unverifiable*, so it is labelled "unverified", shown separately on the calendar, and **never used for points, ranks or the crown**. Those come only from your own Coding Arena, which you can verify. If LeetCode blocks the endpoint, the dashboard shows a status and nothing else breaks.

**Crown rules (`public/js/crown-core.js`, same file runs in browser and server):** Correctness 40% (tests passed, last 20 graded submissions) + Timeliness 35% (time from first opening the problem to submit, measured by the server, vs the problem's expected time) + Consistency 25% (daily accepted streak, 7 days = full). 100% and the victory effects need Correctness >= 95%, Timeliness >= 90% and Consistency >= 90% together; otherwise the fill is capped at 99. Gems: studs >= 35%, sapphire >= 70%, diamond flare at 100%. Gold rises and drains whenever new results arrive; there are no sliders or test buttons. `public/crown-leaderboard.html` is the standalone single-file version; plug in with `LeaderboardCrown.render(studentId, { pillars: {correctness, timeliness, consistency} })`.

**Scoring:** points = difficulty-weighted UNIQUE accepted problems (Easy 10, Medium 25, Hard 50). Re-submitting earns nothing, so farming is impossible. Judge0/system failures are stored as `INTERNAL_ERROR` and never counted against a student.

### API reference
All responses: `{data: ...}` or `{error: {code, message, fields?}}`. Roles: S student, C coordinator, F faculty (C and F also act as students where noted).
| Endpoint | Who | Does |
|---|---|---|
| POST /api/auth/register, login, logout, change-password; GET /api/auth/me | all | Account + session |
| GET /api/me/dashboard, /api/me/activity | S, C | Stats, crown, calendar |
| GET /api/problems, /:id; POST /:id/run, /:id/submit | S, C | Practice, Run (samples), Submit (all tests) |
| GET /api/problems/manage/list; POST /api/problems; PATCH /:id; POST /:id/publish | C, F | Problem management |
| POST /api/problems/:id/unpublish | F | Audit control |
| GET /api/students, /:id; PATCH /:id/house | C (scoped), F | Students in scope |
| GET /api/submissions, /:id | S own, C scoped, F all | History and source code (staff views logged) |
| GET /api/analytics/overview, /problem/:id/audit | C scoped, F | Failure intelligence, uploaded / not uploaded |
| POST/GET /api/interventions, PATCH /:id | C scoped, F | Support notes with before/after view |
| GET /api/leaderboard?period=week\|month\|semester\|all | all | Points, crowns, house cup, programmer of week/month |
| GET/POST /api/integrations, /link, /sync | S, C | LeetCode / GitHub link |
| /api/manage/invites, assignments, coordinators, users, audit-logs | F | Administration |

## MODULE 6: Deploy free (Render + Atlas) and daily habits
1. Push to GitHub (Module 2). 2. render.com -> New Web Service -> your repo; Build `npm install`; Start `npm start`; Node 22.
3. Environment tab: `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET`, `JUDGE0_API_URL`, `JUDGE0_API_KEY`, optional `GITHUB_TOKEN`. (Same values as `.env`; never in code.)
4. Health check path `/api/health`. 5. Atlas Network Access: `0.0.0.0/0` with a strong DB password (free tier).
6. Create the first faculty: run `npm run seed:faculty` once on your computer with the same `MONGODB_URI` (it writes to the same Atlas database), then open the Render URL. Free Render sleeps when idle; the first load can take about a minute.
Landing page and API share one address, so there is no CORS or URL to configure.

**Memorize:** `npm install` · `npm start` · `npm run dev` · `npm test` · `git status` · `git add .` · `git commit -m ""` · `git push` · `git pull` · Ctrl+C (stop server).  
**Look up when needed:** `npm run seed:faculty` (once) · `git init / remote add / branch -M main` (once per project) · the secret generator.

**Troubleshooting:** `Missing required environment variable` -> `.env` missing/misnamed. `MongooseServerSelectionError` -> Atlas IP not allowed or wrong password. `EADDRINUSE :3000` -> another server running (Ctrl+C it). `INVALID_INVITE` -> code used, expired, or wrong role. `EXECUTION_NOT_CONFIGURED` -> set `JUDGE0_API_URL`. Student cannot see problem -> not published, or its target semester differs.

**Build your next project alone:** (1) write the data shapes (models), (2) one route per action with validation + permission check first, (3) one test per rule, (4) frontend calls `/api/...`, (5) commit after every working step. This project follows exactly that order.

---
## Honest status
**Built and tested here** (unit 23/23; integration 21/21 against a MongoDB-compatible server, with a local Judge0 *test double*; UI smoke test of all pages for all 3 roles, no JS or server errors; live GitHub API call OK): auth, invites, section scoping, IDOR protection, problems, Run/Submit pipeline, scoring, crown maths, leaderboard, house cup, analytics, audit, interventions, integrations code.
**Not verified (cannot be from the build sandbox):** your real Atlas cluster; real Judge0 (only the test double); live LeetCode endpoint (blocked there); Monaco from the CDN and the crown's visual look in a real browser (logic and thresholds are tested; please look and report).
**Not built:** emailed verification and password reset (needs an email provider), stored leaderboard snapshots (computed live), "excused absence" status, a separate Weekend Challenge entity (use problems with a deadline and target semester), semester-promotion history, TypeScript conversion. Memory-limit detection depends on what Judge0 reports.
