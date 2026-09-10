-- Complaints hybrid workflow: persistent priority, cross-computer ownership,
-- activity history, and transfer notifications. Safe to run more than once.
CREATE DATABASE IF NOT EXISTS `complaint` DEFAULT CHARACTER SET utf8;
USE `complaint`;

ALTER TABLE `complaints`
  ADD COLUMN IF NOT EXISTS `AssignedUsercode` varchar(50) DEFAULT NULL AFTER `ReceivedBy`,
  ADD COLUMN IF NOT EXISTS `Latitude` decimal(10,7) DEFAULT NULL AFTER `Location`,
  ADD COLUMN IF NOT EXISTS `Longitude` decimal(10,7) DEFAULT NULL AFTER `Latitude`;

ALTER TABLE `complaints`
  ADD INDEX IF NOT EXISTS `idx_complaints_assigned_usercode` (`AssignedUsercode`),
  ADD INDEX IF NOT EXISTS `idx_complaints_coordinates` (`Latitude`,`Longitude`);

CREATE TABLE IF NOT EXISTS `personnel_location` (
  `UserCode` varchar(50) NOT NULL,
  `CompID` int(11) NOT NULL,
  `Latitude` decimal(10,7) NOT NULL,
  `Longitude` decimal(10,7) NOT NULL,
  `Accuracy` decimal(10,2) DEFAULT NULL,
  `UpdatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`UserCode`),
  KEY `idx_personnel_location_complaint` (`CompID`),
  KEY `idx_personnel_location_updated` (`UpdatedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- House markers keep their employee-selected map color across computers.
ALTER TABLE `system_map_db`.`houses_tb`
  ADD COLUMN IF NOT EXISTS `marker_color` varchar(20) NOT NULL DEFAULT '#10b981' AFTER `longitude`;

CREATE TABLE IF NOT EXISTS `complaint_workflow` (
  `CompID` int(11) NOT NULL,
  `Priority` varchar(20) NOT NULL DEFAULT 'Normal',
  `OwnerUserCode` varchar(50) DEFAULT NULL,
  `OwnerName` varchar(200) DEFAULT NULL,
  `LastActivityAt` datetime DEFAULT NULL,
  `LeaseExpiresAt` datetime DEFAULT NULL,
  `Version` int(11) NOT NULL DEFAULT '0',
  `CreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `UpdatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`CompID`),
  KEY `idx_complaint_workflow_owner` (`OwnerUserCode`,`LeaseExpiresAt`),
  KEY `idx_complaint_workflow_priority` (`Priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `complaint_activity` (
  `ActivityID` bigint(20) NOT NULL AUTO_INCREMENT,
  `CompID` int(11) NOT NULL,
  `ActorUserCode` varchar(50) DEFAULT NULL,
  `ActorName` varchar(200) DEFAULT NULL,
  `ActionType` varchar(50) NOT NULL,
  `Details` varchar(500) NOT NULL,
  `CreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ActivityID`),
  KEY `idx_complaint_activity_record` (`CompID`,`CreatedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `complaint_notifications` (
  `NotificationID` bigint(20) NOT NULL AUTO_INCREMENT,
  `CompID` int(11) NOT NULL,
  `RecipientUserCode` varchar(50) NOT NULL,
  `RecipientName` varchar(200) DEFAULT NULL,
  `SenderUserCode` varchar(50) DEFAULT NULL,
  `SenderName` varchar(200) DEFAULT NULL,
  `NotificationType` varchar(50) NOT NULL DEFAULT 'TRANSFER',
  `Message` varchar(500) NOT NULL,
  `IsRead` tinyint(1) NOT NULL DEFAULT '0',
  `CreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ReadAt` datetime DEFAULT NULL,
  PRIMARY KEY (`NotificationID`),
  KEY `idx_complaint_notification_recipient` (`RecipientUserCode`,`IsRead`,`CreatedAt`),
  KEY `idx_complaint_notification_record` (`CompID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Backfill workflow rows without changing legacy complaint status.
INSERT IGNORE INTO `complaint_workflow` (`CompID`, `Priority`)
SELECT `CompID`, 'Normal' FROM `complaints`;

UPDATE `complaints` c
JOIN `complaint_workflow` w ON w.`CompID` = c.`CompID`
SET c.`AssignedUsercode` = w.`OwnerUserCode`
WHERE w.`OwnerUserCode` IS NOT NULL
  AND TRIM(w.`OwnerUserCode`) <> '';

-- Small verification query: all three tables must be returned.
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'complaint'
  AND TABLE_NAME IN ('complaint_workflow','complaint_activity','complaint_notifications','personnel_location')
ORDER BY TABLE_NAME;

SELECT COLUMN_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'system_map_db'
  AND TABLE_NAME = 'houses_tb'
  AND COLUMN_NAME = 'marker_color';
