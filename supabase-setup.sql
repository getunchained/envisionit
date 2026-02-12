-- ============================================================
-- Envisionit RFP Analyst — Supabase Setup
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Create the reports table
CREATE TABLE IF NOT EXISTS reports (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT 'Untitled',
  org        TEXT DEFAULT '',
  deadline   TEXT DEFAULT '',
  recommendation TEXT DEFAULT '',
  results    JSONB NOT NULL,
  file_name  TEXT,
  file_path  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable Row Level Security (required by Supabase)
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- 3. Allow all operations without auth (team-wide, no login required)
--    Since we chose "shareable link, no login" and "team-wide by default",
--    these policies allow open read/write via the anon key.
CREATE POLICY "Allow public read"  ON reports FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON reports FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON reports FOR DELETE USING (true);

-- 4. Create the storage bucket for uploaded RFP files
INSERT INTO storage.buckets (id, name, public)
VALUES ('rfp-files', 'rfp-files', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage policies — allow public upload, read, and delete
CREATE POLICY "Allow public upload"   ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'rfp-files');
CREATE POLICY "Allow public download" ON storage.objects FOR SELECT USING (bucket_id = 'rfp-files');
CREATE POLICY "Allow public delete"   ON storage.objects FOR DELETE USING (bucket_id = 'rfp-files');
