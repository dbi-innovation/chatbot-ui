ALTER TABLE chats
ADD COLUMN application_id UUID;

ALTER TABLE chats
ADD CONSTRAINT fk_workspaces_applications
FOREIGN KEY (application_id) REFERENCES applications (id);
