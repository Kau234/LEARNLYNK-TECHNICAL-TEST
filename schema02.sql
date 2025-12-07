-- Enable RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Helper: function to extract role from JWT (supabase provides auth.jwt() in policies)
-- Policies use auth.jwt() and auth.uid()

-- SELECT policy: counselors can read if owner OR assigned to their team; admins can read all
CREATE POLICY leads_select_policy ON leads
FOR SELECT
USING (
  (
    (current_setting('request.jwt.claims.role', true) = 'admin')
    OR (owner_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM user_teams ut
      WHERE ut.user_id = auth.uid()
        AND ut.team_id = leads.team_id
    )
  )
);

-- INSERT policy: allow counselors and admins to insert leads,
-- but ensure that a counselor can only insert leads assigned to themselves or to their team
CREATE POLICY leads_insert_policy ON leads
FOR INSERT
WITH CHECK (
  (
    current_setting('request.jwt.claims.role', true) = 'admin'
  )
  OR (
    current_setting('request.jwt.claims.role', true) = 'counselor'
    AND (
      owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM user_teams ut
        WHERE ut.user_id = auth.uid()
          AND ut.team_id = leads.team_id
      )
    )
  )
);

-- OPTIONAL: you may want an UPDATE/DELETE policy depending on your app:
-- e.g., allow admins or owner to update / delete
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
