-- Messenger schema notes: guide ito sa table structure ng chat module.
DROP TABLE IF EXISTS `attachments`;
DROP TABLE IF EXISTS `call_sessions`;
DROP TABLE IF EXISTS `messages`;
DROP TABLE IF EXISTS `conversationparticipants`;
DROP TABLE IF EXISTS `user_presence`;
DROP TABLE IF EXISTS `friends`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `conversations`;

CREATE TABLE `conversations` (
  `ConversationID` int(11) NOT NULL AUTO_INCREMENT,
  `ConversationName` varchar(100) DEFAULT NULL,
  `IsGroup` tinyint(1) DEFAULT '0',
  `CreatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ConversationID`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE `conversationparticipants` (
  `ConversationID` int(11) NOT NULL DEFAULT '0',
  `UserID` int(11) NOT NULL DEFAULT '0',
  `JoinedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `LastReadAt` datetime DEFAULT NULL,
  PRIMARY KEY (`ConversationID`,`UserID`),
  KEY `UserID` (`UserID`),
  CONSTRAINT `conversationparticipants_ibfk_1` FOREIGN KEY (`ConversationID`) REFERENCES `conversations` (`ConversationID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE `messages` (
  `MessageID` int(11) NOT NULL AUTO_INCREMENT,
  `ConversationID` int(11) NOT NULL,
  `SenderID` int(11) NOT NULL,
  `MessageText` text NOT NULL,
  `SentAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`MessageID`),
  KEY `ConversationID` (`ConversationID`),
  KEY `SenderID` (`SenderID`),
  CONSTRAINT `messages_ibfk_1` FOREIGN KEY (`ConversationID`) REFERENCES `conversations` (`ConversationID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE `attachments` (
  `AttachmentID` int(11) NOT NULL AUTO_INCREMENT,
  `MessageID` int(11) DEFAULT NULL,
  `Type` varchar(50) NOT NULL,
  `URL` varchar(255) NOT NULL,
  `FileName` varchar(255) DEFAULT NULL,
  `FileSize` int(11) DEFAULT NULL,
  `CreatedAt` datetime NOT NULL,
  PRIMARY KEY (`AttachmentID`),
  KEY `MessageID` (`MessageID`),
  CONSTRAINT `attachments_ibfk_1` FOREIGN KEY (`MessageID`) REFERENCES `messages` (`MessageID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE `call_sessions` (
  `CallID` int(11) NOT NULL AUTO_INCREMENT,
  `ConversationID` int(11) NOT NULL,
  `CallerID` int(11) NOT NULL,
  `CallType` varchar(20) NOT NULL,
  `Status` varchar(20) NOT NULL DEFAULT 'active',
  `StartedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `EndedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`CallID`),
  KEY `ConversationID` (`ConversationID`),
  KEY `CallerID` (`CallerID`),
    CONSTRAINT `call_sessions_ibfk_1` FOREIGN KEY (`ConversationID`) REFERENCES `conversations` (`ConversationID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE `user_presence` (
  `UserID` int(11) NOT NULL,
  `LastSeenAt` datetime NOT NULL,
  PRIMARY KEY (`UserID`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
