-- Auth SQL notes: guide ito sa duplicate checks at register flow.
-- Optional hardening for duplicate prevention (run only after cleaning duplicate usernames):
-- ALTER TABLE usertb ADD UNIQUE KEY uq_usertb_username (username);

-- Register by updating existing employee record:
-- UPDATE usertb SET username = ?, password = ? WHERE Id = ?;

-- Check duplicate employee:
-- SELECT Id, username FROM usertb WHERE usercode = ? LIMIT 1;

-- Check duplicate username:
-- SELECT Id FROM usertb WHERE username = ? LIMIT 1;

-- Employee search for dropdown:
-- SELECT usercode, name, department
-- FROM usertb
-- WHERE usercode LIKE CONCAT('%', ?, '%')
--    OR name LIKE CONCAT('%', ?, '%')
-- ORDER BY name ASC
-- LIMIT 10;
