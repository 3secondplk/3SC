-- Migration: Add week5Target column to Group table
-- Adds Week 5 target (for days 29-31 separated from Week 4)
-- This migration is SAFE: only adds a new column with default value 0, no data loss.

ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "week5Target" FLOAT NOT NULL DEFAULT 0;
