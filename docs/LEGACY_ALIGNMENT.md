# Legacy Alignment Notes

Source legacy path scanned:
- `C:\Users\EC1\Documents\SAMELCO II`

Scanned on:
- 2026-03-24

## Legacy system structure found
- `SAMELCO II.sln` (WinForms/C# desktop system)
- `SAMELCO II/` core desktop code
- `WEB/` separate lightweight PHP/HTML pages

## Confirmed login process in legacy desktop app
File:
- `C:\Users\EC1\Documents\SAMELCO II\SAMELCO II\OTHERS\SAMELCOII_LOGIN_FORM.cs`

Behavior:
1. Login checks `usertb` by `username` + `password`.
2. On success, sets session values (`name`, `usercode`, `department`, `bioUID`).
3. Opens dashboard form `SAMELCOII_DASHBOARD(userName, userCode)`.
4. Has Remember Me (`Properties.Settings`) storing username and password.
5. Register updates existing employee row in `usertb`:
   - checks duplicate username
   - `UPDATE usertb SET username=@username, password=@password WHERE usercode=@id`

## Confirmed dashboard/modules in legacy desktop app
File:
- `C:\Users\EC1\Documents\SAMELCO II\SAMELCO II\OTHERS\SAMELCOII_DASHBOARD.cs`

Modules and forms referenced across project:
- IT EQUIPMENT (`ITS_SYSTEM` forms)
- MEMBERSHIP (`MEMBERSHIP` forms)
- DTR (`ITS_SYSTEM` + `PROFILE` DTR forms)
- WAREHOUSE (`WAREHOUSE` forms)
- FUEL (`FUEL` forms)
- SOA (`SOA` forms)
- MESSENGER (`OTHERS/SAMELCOII_MESSENGER_FORM.cs`)
- BILLING / FORMS style modules appear in UI mocks and resources

## Current web version alignment rules (this repo)
1. Keep login/register flow same as legacy:
   - Register updates/creates credentials from employee identity
   - Duplicate username prevention
   - Remember Me support
2. Keep dashboard module names aligned to legacy naming.
3. Keep session model aligned: `username`, `usercode`, optional `department`/`bioUID` for future.
4. Keep forgot-password easy and fast for user recovery.

## Current implementation status in this web repo
- Login + Register + Remember Me: implemented (localStorage mode, no DB)
- Forgot Password panel and reset flow: implemented
- Dashboard with legacy-like module tiles: implemented

## Next migration targets (when DB mode is restored)
1. Switch auth storage from localStorage to `usertb` API.
2. Preserve same UX and field names.
3. Add module routing based on `privilage` / `privilagemenu`.
4. Add employee search (`usercode`/name) from DB.
