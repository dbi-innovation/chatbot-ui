CREATE TABLE applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    description TEXT
);

ALTER TABLE workspaces
ADD COLUMN application_id UUID,
ADD CONSTRAINT fk_workspaces_applications
FOREIGN KEY (application_id) REFERENCES applications (id);