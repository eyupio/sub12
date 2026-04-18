INSERT INTO achievement_defs (id, name, description, icon) VALUES
    ('first_follow',      'First Follow',       'Followed your first shooter',        'user-plus'),
    ('social_butterfly',  'Social Butterfly',   '10 shooters follow you',             'users'),
    ('conversationalist', 'Conversationalist',  'Posted 10 comments',                 'message-circle'),
    ('club_member',       'Club Member',        'Joined your first club',             'flag'),
    ('pellet_scientist',  'Pellet Scientist',   'Logged your first pellet test',      'flask-conical'),
    ('pb_crusher',        'PB Crusher',         'Set a new personal best',            'trending-up')
ON CONFLICT (id) DO NOTHING;
