INSERT INTO achievement_defs (id, name, description, icon) VALUES
    ('double_century',    'Double Century',   'Scored 200+ in a single card',            'medal'),
    ('x_machine',         'X Machine',        '15+ X''s in a single card',               'crosshair'),
    ('range_regular',     'Range Regular',    'Logged 50 score cards',                   'calendar'),
    ('century_club',      'Century Club',     'Logged 100 score cards',                  'trophy'),
    ('league_regular',    'League Regular',   'Competed in 10 league rounds',            'shield'),
    ('well_known',        'Well Known',       '25 shooters follow you',                  'users'),
    ('discussion_leader', 'Discussion Leader','Posted 25 comments',                      'message-circle'),
    ('pellet_master',     'Pellet Master',    'Completed 10 pellet test sessions',       'flask-conical'),
    ('tastemaker',        'Tastemaker',       'Liked 50 items',                          'thumbs-up'),
    ('in_the_spotlight',  'In the Spotlight', 'Your content received 50 likes',          'heart')
ON CONFLICT (id) DO NOTHING;