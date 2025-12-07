-- schema.sql
-- Assumes Postgres on Supabase.
-- Creates leads, applications, tasks with constraints, FK, indexes, triggers for updated_at.

-- Enable uuid-ossp if you prefer uuid generation (optional)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- optionally a tenants table (not required but helpful)
-- CREATE TABLE tenants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);

-- 1) leads
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  owner_id uuid,               -- counselor user id
  team_id uuid,                -- team assignment (nullable)
  stage text NOT NULL DEFAULT 'new', -- e.g., new, contacted, qualified, etc.
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) applications
CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  application_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_app_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

-- 3) tasks
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  related_id uuid NOT NULL, -- references applications(id)
  related_type text NOT NULL DEFAULT 'application', -- flexible for polymorphism
  type text NOT NULL,
  title text,
  status text NOT NULL DEFAULT 'pending', -- pending, completed, cancelled
  due_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_task_application FOREIGN KEY (related_id) REFERENCES applications(id) ON DELETE CASCADE,
  -- constraint: due_at >= created_at
  CONSTRAINT tasks_due_after_created CHECK (due_at >= created_at),
  -- check constraint on type
  CONSTRAINT task_type_check CHECK (type IN ('call','email','review'))
);

-- TRIGGERS: auto-update updated_at on row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_leads ON leads;
CREATE TRIGGER trg_set_updated_at_leads
BEFORE UPDATE ON leads
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_applications ON applications;
CREATE TRIGGER trg_set_updated_at_applications
BEFORE UPDATE ON applications
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_tasks ON tasks;
CREATE TRIGGER trg_set_updated_at_tasks
BEFORE UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- INDEXES for common queries

-- fetch leads by owner, stage, created_at
CREATE INDEX IF NOT EXISTS idx_leads_owner_stage_created_at ON leads(owner_id, stage, created_at DESC);

-- fetch applications by lead
CREATE INDEX IF NOT EXISTS idx_applications_lead_id ON applications(lead_id);

-- fetch tasks due today (index on due_at + status)
CREATE INDEX IF NOT EXISTS idx_tasks_due_at_status ON tasks(due_at, status);

-- Helpful partial index for "pending" tasks (common)
CREATE INDEX IF NOT EXISTS idx_tasks_due_at_pending ON tasks(due_at) WHERE status = 'pending';

-- OPTIONAL: FK/index on tenant_id for multi-tenant filtering
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_applications_tenant ON applications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks(tenant_id);

-- Sample auxiliary tables referenced by RLS (create if not present)
CREATE TABLE IF NOT EXISTS teams (
  team_id uuid PRIMARY KEY,
  name text
);

CREATE TABLE IF NOT EXISTS user_teams (
  user_id uuid NOT NULL,
  team_id uuid NOT NULL,
  PRIMARY KEY (user_id, team_id),
  FOREIGN KEY (team_id) REFERENCES teams(team_id) ON DELETE CASCADE
);

-- End of schema.sql
