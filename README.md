# NEXORA: university coding platform

Student -> Student coordinator -> Faculty coordinator, each with their own dashboard and permissions.
Express + MongoDB (Mongoose) backend that also serves the landing page, dashboards, Coding Arena and crown leaderboard.

## Run it (5 steps; full explanation in GUIDE.md)
1. Install Node 22+ and `npm install`
2. Copy `.env.example` to `.env`; set `MONGODB_URI` and `JWT_SECRET`; fill the four `FACULTY_*` lines
3. `npm run seed:faculty` once, then delete the `FACULTY_*` lines
4. `npm start` and open http://localhost:3000 (health check: /api/health)
5. Log in as the faculty account, change the password when asked, then create invites on the **Team** tab

## Roles
| Role | How the account is created | Can see / change |
|---|---|---|
| Student | Join the Club (no code) | Own data only: practice, arena, leaderboard, crown, LeetCode/GitHub link |
| Student coordinator | Join the Club + a faculty-issued invite code | Everything a student has, plus students of assigned sections only: view, inspect code, problems, interventions, houses |
| Faculty coordinator | First one: `npm run seed:faculty`. More: Join the Club + faculty invite code | Everything: all students and coordinators, assignments, invites, suspend / reset / revoke, audit log |

Nobody can promote themselves: a role is granted only by redeeming a single-use, expiring, role-bound invite stored as a hash.

## Commands
`npm start` run · `npm run dev` auto-restart · `npm run test:unit` (no database) · `npm run test:integration` (needs MongoDB; set `MONGODB_TEST_URI` or let it download an in-memory one) · `npm run build:crown` rebuild the single-file crown demo

## Files that matter
`src/server.js` start-up · `src/app.js` middleware and routes · `src/routes/*` the API · `src/models/*` the database shapes · `src/lib/*` scoring, scope, Judge0, LeetCode, GitHub, sync · `public/index.html` landing · `public/dashboard.html` + `public/js/app.js` dashboards · `public/arena.html` + `public/js/arena.js` Coding Arena · `public/js/crown*.js` crown · `public/crown-leaderboard.html` standalone crown demo
