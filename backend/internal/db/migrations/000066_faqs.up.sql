CREATE TABLE IF NOT EXISTS faqs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          TEXT NOT NULL UNIQUE,
    category      TEXT NOT NULL,
    question      TEXT NOT NULL,
    answer_md     TEXT NOT NULL,
    sort_order    INT NOT NULL DEFAULT 0,
    is_published  BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faqs_category_sort ON faqs(category, sort_order);
CREATE INDEX IF NOT EXISTS idx_faqs_published ON faqs(is_published);

INSERT INTO faqs (slug, category, question, answer_md, sort_order, is_published) VALUES
    ('what-is-sub12', 'Getting Started', 'What is sub12?',
     E'sub12 is a target shooting companion for air rifle and precision shooters. It helps you:\n\n- Log **25-shot score cards** with photos, rifle and pellet selection, and weather notes.\n- Track your **rifles and pellets** and see which combinations perform best.\n- Run **pellet tests** with image-based hole detection and MOA calculations.\n- Compete in **leagues** and join shooting **clubs**.\n- Share scores, follow friends, and earn **achievements** as you progress.',
     10, TRUE),

    ('creating-your-first-score', 'Getting Started', 'How do I log my first score card?',
     E'1. Tap **New Score** from the Dashboard or the Scores page.\n2. Enter your 25 shot scores (0-10 per shot).\n3. Pick the rifle and pellet you used.\n4. Optionally add a photo of the card, weather, location, and notes.\n5. Save. Your card appears in your history and contributes to your stats instantly.',
     20, TRUE),

    ('adding-rifles-and-pellets', 'Getting Started', 'How do I add rifles and pellets?',
     E'Go to **Gear** in the menu. You can:\n\n- Create a new rifle or pellet from scratch, or\n- Search the built-in catalog and add it with one tap.\n\nYou can set a **primary rifle** that is auto-selected when logging scores. Pellets can be tagged with lot/batch numbers so you can track how each batch performs over time.',
     30, TRUE),

    ('understanding-the-dashboard', 'Getting Started', 'What does the dashboard show?',
     E'The Dashboard is your home screen. It shows:\n\n- Your **most recent scores** and trend vs. last week\n- **Active leagues** and any open rounds you still need to submit for\n- **Primary rifle** summary and latest pellet performance\n- Quick links to **New Score** and **New Pellet Test**',
     40, TRUE),

    ('logging-a-25-shot-card', 'Score Cards', 'How does the 25-shot card work?',
     E'A standard card is 25 shots scored 0-10 each, for a maximum of 250. The score editor lets you enter shot values quickly and shows a running total. You can attach a card photo, pick the rifle/pellet used, and add range conditions (wind, temp, distance).',
     10, TRUE),

    ('score-visibility', 'Score Cards', 'Who can see my scores?',
     E'Each score has a visibility setting:\n\n- **Public** — appears in the community feed and your public profile.\n- **Followers only** — only people you''ve approved as followers can see it.\n- **Private** — only you can see it.\n\nYou can set a default visibility in **Privacy Center** and override it per-score.',
     20, TRUE),

    ('attaching-photos', 'Score Cards', 'Can I attach a photo to a score?',
     E'Yes. When creating or editing a score, tap the image uploader to attach a photo of the physical card. The photo stays attached to the score and is visible to anyone who can view the score.',
     30, TRUE),

    ('editing-deleting-scores', 'Score Cards', 'Can I edit or delete a score?',
     E'You can edit your own scores at any time. Deleting a score also removes it from leaderboards and league standings. If a league admin has **verified** your score, editing it marks it as "amended" and logs the change in the audit trail.',
     40, TRUE),

    ('verification-and-amendments', 'Score Cards', 'What does "verified" mean on a score?',
     E'In leagues that require verification, a league admin reviews each submitted score. Verified scores count for the standings. If a score needs to change after verification, the admin can **amend** it — the original value stays visible in the audit trail alongside the new value and the reason.',
     50, TRUE),

    ('rejecting-a-score', 'Score Cards', 'Why would a score be rejected?',
     E'A league admin can reject a score if the photo is unreadable, the wrong rifle/pellet was used, or the score otherwise doesn''t meet the league rules. Rejected scores do not count toward standings. The rejection reason is visible to the submitter.',
     60, TRUE),

    ('creating-a-test-group', 'Pellet Testing', 'How do I create a pellet test?',
     E'From **Testing**, tap **New Test**. A test captures:\n\n- Distance (meters or yards)\n- The rifle and pellet being tested\n- Weather/conditions\n- One or more **groups** (typically 5 or 10 shots on a target)\n\nEach group can be measured by photo or manual entry. Group size in MOA is calculated automatically.',
     10, TRUE),

    ('image-hole-detection', 'Pellet Testing', 'How does image-based hole detection work?',
     E'Upload a clear photo of your target. sub12 detects shot holes automatically and overlays them on the image. You can adjust or add holes manually if anything is missed. A **confidence badge** shows how certain the detection is — low confidence usually means poor lighting or off-angle photos.\n\nFor best results: shoot straight on, avoid glare, and include the whole target in frame.',
     20, TRUE),

    ('manual-measurement', 'Pellet Testing', 'Can I measure groups manually?',
     E'Yes. Toggle **Manual Measurement** on any group to enter the center-to-center distance directly in mm or inches. This is useful when you have a caliper measurement from the physical target.',
     30, TRUE),

    ('moa-explained', 'Pellet Testing', 'What is MOA?',
     E'**Minute of Angle (MOA)** is an angular measurement commonly used in shooting. 1 MOA is about **1 inch at 100 yards** (~29 mm at 100 m). sub12 converts your group size and distance to MOA automatically so you can compare groups taken at different distances on equal footing.',
     40, TRUE),

    ('batch-and-lot-tracking', 'Pellet Testing', 'How do batch and lot numbers work?',
     E'Each pellet can be tagged with a batch or lot number. When you run tests, sub12 tracks performance per batch so you can spot differences between production runs and find the tin that shoots best in your rifle.',
     50, TRUE),

    ('leaderboard-opt-in', 'Pellet Testing', 'How does the public pellet leaderboard work?',
     E'If you opt in, your best groups contribute anonymized stats to the **public pellet leaderboard**, which ranks pellets by average group size and consistency per rifle model. You can opt in or out at any time from your test or in Privacy Center. Your name is never shown unless you choose to be public.',
     60, TRUE),

    ('creating-a-league', 'Leagues', 'How do I create a league?',
     E'From **Leagues**, tap **New League**. Pick a name, description, visibility (public/private), scoring rule (highest or average), and join policy (open / invite code / admin approval). You become the league admin.',
     10, TRUE),

    ('scoring-rules-highest-vs-average', 'Leagues', 'Highest vs. average scoring — which should I pick?',
     E'- **Highest** — a shooter''s best card in the round counts. Rewards peak performance.\n- **Average** — the mean of all cards in the round counts. Rewards consistency and participation.\n\nYou can change the scoring rule in League Settings at any time; existing standings recalculate automatically.',
     20, TRUE),

    ('join-policies', 'Leagues', 'What are the different join policies?',
     E'- **Open** — anyone can join instantly.\n- **Invite code** — shooters need a code (shared by admins) to join.\n- **Admin approval** — shooters request to join; admins approve or decline.',
     30, TRUE),

    ('invite-codes', 'Leagues', 'How do invite codes work?',
     E'In League Settings, admins can **generate** or **regenerate** an invite code. Share the code or the full invite link. Regenerating invalidates the old code immediately.',
     40, TRUE),

    ('seasons-and-rounds', 'Leagues', 'What are seasons and rounds?',
     E'- A **season** is a time-bounded competition (e.g., "Winter 2026").\n- A season contains multiple **rounds** — each round is a submission window (e.g., one week).\n\nShooters submit one or more scores per round; standings are computed per round and per season.',
     50, TRUE),

    ('admin-score-verification', 'Leagues', 'How do admins verify scores?',
     E'League admins see a queue of submitted scores in the league view. For each score they can:\n\n- **Verify** — the score counts for standings.\n- **Amend** — change the value and record the reason in the audit trail.\n- **Reject** — the score does not count; a reason is shown to the submitter.',
     60, TRUE),

    ('creating-a-club', 'Clubs', 'How do I create a club?',
     E'From **Clubs**, tap **New Club**. Clubs are longer-lived communities than leagues — a single club can run many leagues over time. Clubs have members, posts, and their own standings that aggregate across the club''s leagues.',
     10, TRUE),

    ('club-vs-league', 'Clubs', 'What''s the difference between a club and a league?',
     E'- A **club** is a community/organization. Members, posts, shared identity.\n- A **league** is a competition with scoring rules, seasons, and rounds.\n\nA club can run multiple leagues. You can be in clubs without being in a league, and you can join leagues without being in a club.',
     20, TRUE),

    ('managing-members', 'Clubs', 'How do I manage club members?',
     E'In **Club Settings**, admins can view members, remove members, change roles (member / admin), and handle join requests. Club admins can also post announcements to the club feed.',
     30, TRUE),

    ('club-standings', 'Clubs', 'How are club standings calculated?',
     E'Club standings aggregate scores from the club''s current leagues. The exact calculation depends on each league''s scoring rule (highest or average). You can view standings per-league or as a rolled-up club view.',
     40, TRUE),

    ('following-users', 'Social', 'How does following work?',
     E'Tap **Follow** on any user profile to see their public activity in your Feed. If their profile is set to private, you''ll send a follow request that they can approve or decline.',
     10, TRUE),

    ('the-activity-feed', 'Social', 'What appears in my feed?',
     E'The Feed has several filters:\n\n- **For you** — activity from people you follow\n- **Public** — all public activity across sub12\n- **League** — activity scoped to a league you''re in\n- **Club** — activity scoped to a club you''re in\n\nActivity includes new scores, pellet tests, league/club posts, and achievements.',
     20, TRUE),

    ('comments-and-likes', 'Social', 'Can I comment on or like scores?',
     E'Yes. Any score or post you can view, you can like or comment on (unless the owner has turned off comments). Replies are threaded. You can edit or delete your own comments at any time.',
     30, TRUE),

    ('sharing-scores', 'Social', 'How do I share a score?',
     E'From any score you can view, tap **Share** to post it to your feed with an optional comment. The shared post links back to the original score and is visible to whoever can see the source.',
     40, TRUE),

    ('reporting-content', 'Social', 'How do I report inappropriate content?',
     E'Any score, post, or comment has a **Report** action. Reports are routed to the league/club admins if the content is scoped to one, and to platform admins otherwise. Reported content stays visible with a banner until an admin decides — authors can clear flags by editing.',
     50, TRUE),

    ('rifle-and-pellet-catalog', 'Gear', 'What is the catalog?',
     E'sub12 ships with a built-in catalog of popular rifles and pellets. Search by brand or model when adding gear — it pre-fills specs like caliber, weight, and typical velocity so you don''t have to type them.',
     10, TRUE),

    ('primary-rifle', 'Gear', 'What is a primary rifle?',
     E'Your **primary rifle** is auto-selected when logging new scores and pellet tests. You can change it any time from **Gear**.',
     20, TRUE),

    ('gear-stats', 'Gear', 'Where do I see stats for my gear?',
     E'Each rifle and pellet shows its own stats page: total shots, average score, best card, and (for pellets) best group size per rifle. Use these to see which gear actually performs for you.',
     30, TRUE),

    ('profile-visibility', 'Privacy & Notifications', 'How do I make my profile private?',
     E'In **Privacy Center** you can set your profile to **Private**. Private profiles are not searchable, and anyone who wants to see your scores or follow you must first send a follow request.',
     10, TRUE),

    ('default-score-visibility', 'Privacy & Notifications', 'Can I set a default visibility for scores?',
     E'Yes. **Privacy Center → Default score visibility** sets the default for every new score. You can still override it per-score when logging.',
     20, TRUE),

    ('notification-preferences', 'Privacy & Notifications', 'How do I control notifications?',
     E'**Notification Settings** lets you toggle each event type — follows, comments, likes, league events, tickets, feature updates — for both in-app and email delivery independently.',
     30, TRUE),

    ('data-export', 'Privacy & Notifications', 'Can I download my data?',
     E'Yes. From **Privacy Center → Export my data**, request a download. We compile your scores, posts, comments, club/league memberships, and profile into a ZIP. You''ll be notified when it''s ready.',
     40, TRUE),

    ('deleting-your-account', 'Privacy & Notifications', 'How do I delete my account?',
     E'From **Privacy Center → Delete account**. This permanently removes your profile, scores, pellet tests, posts, and comments. Records in league standings are removed too. This cannot be undone.',
     50, TRUE),

    ('email-templates', 'Admin', 'How do email templates work? (Admin)',
     E'Admins can edit every transactional email in **Admin → Email Templates**: forgot password, welcome, notifications, ticket updates, feature updates. Each template has a subject, HTML body, and text body. Use `{{.variable_name}}` for placeholders — a live preview renders with test data.',
     10, TRUE),

    ('smtp-settings', 'Admin', 'How do I configure outbound email? (Admin)',
     E'**Admin → Email Settings** holds the SMTP host, port, credentials, and sender address. Click **Send test email** to verify delivery end-to-end before go-live.',
     20, TRUE),

    ('managing-users', 'Admin', 'How do I manage users? (Admin)',
     E'**Admin → Users** lists every account. Click through to view detail, change role (member/admin), or delete. Deleting an account is permanent and cascades the same way as self-deletion.',
     30, TRUE),

    ('community-moderation', 'Admin', 'How does moderation work? (Admin)',
     E'League and club admins see a report queue scoped to their community. Platform admins see every report in **Admin → Reports**. For each report you can **hide** the content, **warn** the author, or **dismiss** the report. Authors can clear auto-flags by editing their content.',
     40, TRUE)
ON CONFLICT (slug) DO NOTHING;
