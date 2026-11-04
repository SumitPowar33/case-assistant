-- Case property register (design board 15, session 69): where a seized item is after each hand-over, in a fixed list so the
-- station's register can count what is in the malkhana, what is out at a lab or court and what went back to its owner.
-- The free-text location stays as written; rows before this migration have no place and are shown as "not stated".
-- custody_event stays append-only (forbid_change trigger): adding a column changes no existing row.
ALTER TABLE custody_event ADD COLUMN place text CHECK (place IN ('malkhana', 'lab', 'court', 'owner', 'other'));
