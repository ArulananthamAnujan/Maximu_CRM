-- Adds "deferred" to the case pipeline.
--
-- This file contains nothing but the new enum value, and deliberately has no
-- BEGIN/COMMIT. PostgreSQL will not let a newly added enum value be used by
-- other statements in the same transaction, so everything that uses it lives in
-- 0014_defer_stage.sql. Apply this file first, on its own, then that one.
--
-- Placed before 'completed' so the stored order still reads as the pipeline.
alter type public.case_lifecycle_stage
  add value if not exists 'deferred' before 'completed';
