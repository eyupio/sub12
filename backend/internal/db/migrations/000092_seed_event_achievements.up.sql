-- Live Events achievement definitions. Tiered milestones (Veteran 10/25/50,
-- Host 1/5/25) are seeded as separate rows so each tier can be earned
-- individually. Evaluation is wired into AchievementService.EvaluateForEventCompletion.

INSERT INTO achievement_defs (id, name, description, icon) VALUES
    ('event_first_join',    'First Live Event',    'Completed your first live event',                'flag'),
    ('event_podium',        'Podium',              'Finished top 3 in an event category',            'medal'),
    ('event_clean_card',    'Clean Card',          '100% hits in a live event',                      'check-circle'),
    ('event_veteran_10',    'Veteran of the Line', 'Completed 10 live events',                       'shield'),
    ('event_veteran_25',    'Seasoned Campaigner', 'Completed 25 live events',                       'shield-check'),
    ('event_veteran_50',    'Iron Discipline',     'Completed 50 live events',                       'shield-plus'),
    ('event_host_1',        'Host',                'Owned and ran 1 live event',                     'crown'),
    ('event_host_5',        'Match Director',      'Owned and ran 5 live events',                    'megaphone'),
    ('event_host_25',       'Range Master',        'Owned and ran 25 live events',                   'tower-control')
ON CONFLICT (id) DO NOTHING;
