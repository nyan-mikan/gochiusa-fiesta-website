-- Freeze the selected speakers, segment assignment and preset used by each new review.
-- Existing review identifiers and results remain unchanged and are never redispatched.
ALTER TABLE script_language_reviews ADD COLUMN speaker_context TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(speaker_context) AND length(speaker_context)<=100000);
CREATE TRIGGER script_language_speakers_fixed BEFORE UPDATE OF speaker_context ON script_language_reviews
BEGIN SELECT RAISE(ABORT,'review_input_fixed'); END;
