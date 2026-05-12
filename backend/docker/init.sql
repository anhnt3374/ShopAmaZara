-- Runs once on first MySQL container start (mounted into /docker-entrypoint-initdb.d).
-- Creates an extra schema for e2e tests and grants the application user access to it.
CREATE DATABASE IF NOT EXISTS `amazara_test`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON `amazara_test`.* TO 'amazara'@'%';
FLUSH PRIVILEGES;
