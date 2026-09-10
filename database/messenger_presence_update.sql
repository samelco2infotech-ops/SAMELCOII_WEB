-- Messenger SQL notes: guide ito sa presence flag at online tracking.
CREATE DATABASE IF NOT EXISTS `messenger` DEFAULT CHARACTER SET latin1;
USE `messenger`;

CREATE TABLE IF NOT EXISTS `user_presence` (
  `UserID` int(11) NOT NULL,
  `LastSeenAt` datetime NOT NULL,
  PRIMARY KEY (`UserID`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
