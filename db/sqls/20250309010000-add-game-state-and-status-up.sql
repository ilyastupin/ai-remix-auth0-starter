ALTER TABLE games
  ADD COLUMN status ENUM('not_started', 'started', 'finished') NOT NULL DEFAULT 'not_started',
  ADD COLUMN game_state JSON NOT NULL DEFAULT (JSON_OBJECT());
