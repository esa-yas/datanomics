-- Clear stale Gmail sync errors from before the metadata-scope fix (no `q` param).
UPDATE public.google_connections
SET error_message = NULL
WHERE error_message LIKE '%does not support ''q'' parameter%';
