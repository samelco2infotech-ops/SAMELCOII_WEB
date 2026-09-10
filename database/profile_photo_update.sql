-- Profile photo SQL notes: guide ito sa user photo field at storage path.
USE `it_program`;

SET @column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usertb'
    AND COLUMN_NAME = 'profile_photo_url'
);

SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE usertb ADD COLUMN profile_photo_url varchar(255) DEFAULT NULL',
  'SELECT ''Column profile_photo_url already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
