-- Store ratings. Apply with:
--   npx wrangler d1 execute kodama-ratings --remote --file=ratings-schema.sql
--
-- `voter` is sha256(install id + ":" + entry id), computed on the device. The install id itself
-- never arrives here, and the token differs per entry, so one device's ratings cannot be joined
-- to each other. One row per entry and voter: rating again replaces, it does not add.
CREATE TABLE IF NOT EXISTS ratings (
  entry   TEXT    NOT NULL,
  voter   TEXT    NOT NULL,
  stars   INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  updated INTEGER NOT NULL,
  PRIMARY KEY (entry, voter)
);
