-- Development seed data
-- Run with: make seed
-- Password for all accounts: password123

INSERT INTO users (id, email, display_name, password_hash, bio, location, club)
VALUES
  (
    'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    'dev@sub12.local',
    'Dev User',
    '$2a$10$QhEUGN1nA5kRjb/J0zYQCuWY2KDnfemdmpDbfqSZPdXLbU63aN7x.',
    'Test account for development',
    'Yorkshire',
    'Test Range'
  ),
  (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'admin@sub12.local',
    'Admin',
    '$2a$10$QhEUGN1nA5kRjb/J0zYQCuWY2KDnfemdmpDbfqSZPdXLbU63aN7x.',
    'Platform administrator',
    'Yorkshire',
    NULL
  )
ON CONFLICT (email) DO NOTHING;
