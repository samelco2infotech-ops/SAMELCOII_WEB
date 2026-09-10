# SAMELCII Web System

## Project Framework (Folder Arrangement)

- `index.html` -> app entry (redirects to login)
- `assets/`
- `assets/css/style.css` -> shared styles
- `assets/js/script.js` -> shared scripts
- `assets/images/samelco-main.svg` -> project logo
- `pages/auth/index.html` -> login/register page
- `pages/dashboard/index.html` -> dashboard starter page
- `components/` -> reusable HTML parts (future use)
- `OTHER/` -> legacy paths with redirects

## How to Build Faster

1. Put new pages inside `pages/`.
2. Put all CSS in `assets/css/` and JS in `assets/js/`.
3. Keep reusable pieces in `components/`.
4. Link assets with relative paths from each page.

## Notes

- Old files in `OTHER/` now redirect to the new structure.
- Current login/register effects are handled by `assets/js/script.js`.
- Local mode (no database): auth uses browser `localStorage`.
- Default test user: `admin` / `admin123`.

## Modern Module File Mapping (Aligned to SAMELCO II)

- `pages/modules/it-equipment/index.html`
- `pages/modules/membership/index.html`
- `pages/modules/dtr/index.html`
- `pages/modules/warehouse/index.html`
- `pages/modules/employees-profile/index.html`
- `pages/modules/fuel/index.html`
- `pages/modules/soa/index.html`
- `pages/modules/messenger/index.html`
- `pages/modules/billing/index.html`
- `pages/modules/forms/index.html`

Shared module assets:
- `pages/modules/module.css`
- `pages/modules/module.js`

## Node API Setup (`usertb` Compatible)

1. Copy `backend/.env.example` to `backend/.env` and set the DB/JWT values.
2. Run `npm install` and `npm start` inside `backend/`.
3. Serve the frontend with Apache or the desktop app, then open `pages/auth/index.html`.

### Implemented behavior

- Login validates `username` + `password` from `usertb`.
- Register does not create duplicate users:
1. Employee ID (`usercode`) must exist.
2. Existing employee with a non-empty `username` cannot register again.
3. `username` must be unique.
- Employee input supports dropdown search (by `usercode` or `name`).
