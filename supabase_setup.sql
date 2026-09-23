-- ==========================================
-- SAFE & IDEMPOTENT Supabase Schema Setup
-- Preserves existing data. Safe to run multiple times.
-- ==========================================

-- 1. Ensure projects table exists, then dynamically add missing columns
DO $$ 
BEGIN 
    -- If projects table does not exist at all, create a minimal base
    CREATE TABLE IF NOT EXISTS public.projects (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY
    );

    -- Conditionally add columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'title') THEN
        ALTER TABLE public.projects ADD COLUMN title TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'description') THEN
        ALTER TABLE public.projects ADD COLUMN description TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'category') THEN
        ALTER TABLE public.projects ADD COLUMN category TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'media_url') THEN
        ALTER TABLE public.projects ADD COLUMN media_url TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'type') THEN
        ALTER TABLE public.projects ADD COLUMN type TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'project_link') THEN
        ALTER TABLE public.projects ADD COLUMN project_link TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'published') THEN
        ALTER TABLE public.projects ADD COLUMN published BOOLEAN DEFAULT true;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'created_at') THEN
        ALTER TABLE public.projects ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;


-- 2. Ensure clients table exists, then dynamically add missing columns
DO $$ 
BEGIN 
    CREATE TABLE IF NOT EXISTS public.clients (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY
    );

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'name') THEN
        ALTER TABLE public.clients ADD COLUMN name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'website_link') THEN
        ALTER TABLE public.clients ADD COLUMN website_link TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'logo_url') THEN
        ALTER TABLE public.clients ADD COLUMN logo_url TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'published') THEN
        ALTER TABLE public.clients ADD COLUMN published BOOLEAN DEFAULT true;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'created_at') THEN
        ALTER TABLE public.clients ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;


-- 3. Create the settings table safely
CREATE TABLE IF NOT EXISTS public.settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    profile_photo_url TEXT
);

-- Ensure there is a single row for settings
INSERT INTO public.settings (id, profile_photo_url)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;


-- 4. Set up Row Level Security (RLS) safely

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first to prevent "policy already exists" errors
DO $$ 
BEGIN
    -- Projects policies
    DROP POLICY IF EXISTS "Public can view published projects" ON public.projects;
    DROP POLICY IF EXISTS "Admin can view all projects" ON public.projects;
    DROP POLICY IF EXISTS "Admin can insert projects" ON public.projects;
    DROP POLICY IF EXISTS "Admin can update projects" ON public.projects;
    DROP POLICY IF EXISTS "Admin can delete projects" ON public.projects;

    -- Clients policies
    DROP POLICY IF EXISTS "Public can view published clients" ON public.clients;
    DROP POLICY IF EXISTS "Admin can view all clients" ON public.clients;
    DROP POLICY IF EXISTS "Admin can insert clients" ON public.clients;
    DROP POLICY IF EXISTS "Admin can update clients" ON public.clients;
    DROP POLICY IF EXISTS "Admin can delete clients" ON public.clients;

    -- Settings policies
    DROP POLICY IF EXISTS "Public can view settings" ON public.settings;
    DROP POLICY IF EXISTS "Admin can update settings" ON public.settings;
    DROP POLICY IF EXISTS "Admin can insert settings" ON public.settings;
END $$;


-- Recreate policies for projects
CREATE POLICY "Public can view published projects" 
ON public.projects FOR SELECT 
USING (published = true);

CREATE POLICY "Admin can view all projects" 
ON public.projects FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admin can insert projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin can update projects" ON public.projects FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admin can delete projects" ON public.projects FOR DELETE TO authenticated USING (true);


-- Recreate policies for clients
CREATE POLICY "Public can view published clients" 
ON public.clients FOR SELECT 
USING (published = true);

CREATE POLICY "Admin can view all clients" 
ON public.clients FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admin can insert clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin can update clients" ON public.clients FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admin can delete clients" ON public.clients FOR DELETE TO authenticated USING (true);


-- Recreate policies for settings
CREATE POLICY "Public can view settings" 
ON public.settings FOR SELECT 
USING (true);

CREATE POLICY "Admin can update settings" 
ON public.settings FOR UPDATE 
TO authenticated 
USING (true);

CREATE POLICY "Admin can insert settings" 
ON public.settings FOR INSERT 
TO authenticated 
WITH CHECK (true);


-- 5. Setup Storage Bucket safely

-- Insert the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('portfolio-media', 'portfolio-media', true)
ON CONFLICT (id) DO NOTHING;

-- Safely drop and recreate storage policies
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Public can read portfolio-media" ON storage.objects;
    DROP POLICY IF EXISTS "Admin can insert portfolio-media" ON storage.objects;
    DROP POLICY IF EXISTS "Admin can update portfolio-media" ON storage.objects;
    DROP POLICY IF EXISTS "Admin can delete portfolio-media" ON storage.objects;
END $$;

-- Public can read files in portfolio-media
CREATE POLICY "Public can read portfolio-media"
ON storage.objects FOR SELECT
USING (bucket_id = 'portfolio-media');

-- Admin can upload files
CREATE POLICY "Admin can insert portfolio-media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'portfolio-media');

-- Admin can update files
CREATE POLICY "Admin can update portfolio-media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'portfolio-media');

-- Admin can delete files
CREATE POLICY "Admin can delete portfolio-media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'portfolio-media');
