-- Help articles aimed squarely at somebody who signed up five minutes ago:
-- what to do first, what the jargon means, and how to get a human to answer.
-- Idempotent: ON CONFLICT (slug) DO NOTHING.

-- Existing "Getting Started" articles start at sort_order 10, so the two
-- orientation pieces below claim 5 and 6 to sit ahead of them.
INSERT INTO faqs (slug, category, question, answer_md, sort_order, category_order, is_published) VALUES

    ('first-things-to-do', 'Getting Started', 'I have just signed up — what should I do first?',
     E'Five short steps and the app starts working for you. Your Dashboard tracks them for you as a checklist.\n\n1. **Add your rifle** — go to **Gear**, search the built-in catalog, and the specs fill themselves in.\n2. **Log a score card** — 25 shots, the rifle and pellet you used. That is all a card is.\n3. **Finish your profile** — an avatar and a location help club mates recognise you.\n4. **Join a club or league** — a club is your local community, a league ranks your cards against other shooters.\n5. **Run a pellet test** — photograph a group and sub12 measures it, so you can find the tin your rifle likes.\n\nNone of it is compulsory and nothing is locked behind it. You can log cards forever without joining anything.',
     5, COALESCE((SELECT MIN(category_order) FROM faqs WHERE category = 'Getting Started'), 10), TRUE),

    ('what-do-i-need-to-start', 'Getting Started', 'What do I need before I can use sub12?',
     E'A rifle, some pellets and paper targets. That is genuinely it.\n\nEverything else is optional:\n\n- A **phone camera** if you want photo-based group measurement or card photos. Any modern phone is fine.\n- A **chronograph** if you want to record muzzle velocity — it is a field you can leave blank.\n- A **club membership** if you want to shoot in leagues or events. Solo logging needs nothing.\n\nYou do not need to measure anything by hand. Distances can be entered in metres or yards, and sub12 converts group sizes to MOA for you.',
     6, COALESCE((SELECT MIN(category_order) FROM faqs WHERE category = 'Getting Started'), 10), TRUE),

    ('getting-started-checklist', 'Getting Started', 'What is the checklist on my dashboard?',
     E'The **Getting started** panel at the top of your Dashboard tracks the five setup steps a new account benefits from — adding a rifle, logging a card, finishing your profile, joining a club or league, and running a pellet test.\n\nEach step ticks itself off as you complete it. The panel disappears on its own once all five are done, or once you have logged enough cards that you clearly do not need it.\n\nIf it is in your way, tap the **×** in its corner and it will not come back.',
     25, COALESCE((SELECT MIN(category_order) FROM faqs WHERE category = 'Getting Started'), 10), TRUE),

    ('shooting-jargon-glossary', 'Getting Started', 'What do MOA, group size and X-count actually mean?',
     E'The terms you will meet most often in sub12:\n\n- **Sub-12** — an air rifle producing under 12 ft·lb of muzzle energy, the UK limit for holding an air rifle without a firearms certificate.\n- **Group** — a cluster of shots aimed at the same point. Tighter is better; it measures how consistent the rifle, pellet and shooter are together.\n- **Group size** — the distance between the centres of the two furthest-apart holes ("centre-to-centre"), in mm or inches.\n- **MOA** — Minute of Angle, roughly **1 inch at 100 yards**. Because it is an angle, it lets you compare a group shot at 25 m with one shot at 50 m fairly.\n- **Mean radius** — the average distance of every hole from the centre of the group. Less sensitive to one stray shot than group size.\n- **X-count** — on a scored card, how many of your 10s landed in the inner ring. It breaks ties between two cards with the same total.\n- **Card** — a 25-shot scored target, 0–10 per shot, for a maximum of 250.\n- **Lot / batch** — the production run a tin of pellets came from. Two tins of the same pellet can shoot differently, which is why sub12 tracks it.',
     35, COALESCE((SELECT MIN(category_order) FROM faqs WHERE category = 'Getting Started'), 10), TRUE),

    ('who-can-see-what-i-log', 'Getting Started', 'Who can see what I log?',
     E'By default, only you. Nothing you log is published until you choose to publish it.\n\n- Every score card has a **visibility** setting — private, followers only, or public. You pick a default in **Privacy Center** and can override it on any individual card.\n- Your **profile** can be public or private. A private profile is hidden from search and follow requests need your approval.\n- **Pellet test** results only reach the public leaderboard if you opt in, and even then they are anonymised.\n\nIf you would rather look around before deciding, leave everything as it is — the defaults are the cautious ones.',
     45, COALESCE((SELECT MIN(category_order) FROM faqs WHERE category = 'Getting Started'), 10), TRUE),

    ('using-sub12-at-the-range', 'Getting Started', 'Can I use sub12 at the range on my phone?',
     E'Yes — that is what it is built for.\n\n- **Install it to your home screen.** sub12 is a progressive web app: open it in your phone browser and choose *Add to Home Screen*. It then opens full screen with no browser chrome.\n- **Android users** can install the app directly instead — the APK download link is in the sidebar of this Help page.\n- **Patchy signal is fine.** Event scoring queues your entries locally and syncs when you get a bar back, and the **quick capture** button lets you snap a target now and fill in the detail later from the Drafts screen.\n\nPull down on any screen to refresh, or tap the SUB12 logo at the top.',
     55, COALESCE((SELECT MIN(category_order) FROM faqs WHERE category = 'Getting Started'), 10), TRUE),

-- New "Getting Help" category, ordered last so it reads as the fallback.
    ('how-to-get-help', 'Getting Help', 'How do I get help or report a problem?',
     E'Three routes, depending on what you need:\n\n1. **Help & FAQ** (this page) — search it first. Most questions in the first week already have an answer written down.\n2. **Support** — open a ticket for anything the FAQ does not cover, including "I do not understand how this works". A real person reads every one and replies in the thread.\n3. **Feature Board** — for "sub12 should do X". Browse and upvote existing ideas before adding a new one; a well-supported idea carries more weight.\n\nNothing is too basic to ask. Plenty of people are logging their first card this week too.',
     10, 900, TRUE),

    ('what-happens-to-my-ticket', 'Getting Help', 'What happens after I submit a support ticket?',
     E'Your ticket appears under **My support tickets** on the Support page and stays there as a conversation thread.\n\n- Replies from us are added to the thread, and the ticket shows an **unread** badge until you open it.\n- You will be notified in-app, and by email if you have email notifications enabled.\n- The **status** tells you where it is: *Open*, *Being looked at*, *Waiting on you*, *Resolved* or *Closed*.\n- You can reply at any time to add detail — screenshots and the exact screen you were on help enormously.\n\nIf you scoped the ticket to a league or club, it routes to that league or club''s admins rather than the platform team.',
     20, 900, TRUE),

    ('suggesting-a-feature', 'Getting Help', 'How do I suggest a feature?',
     E'Either raise a **Support** ticket with the category set to *Feature request*, or add it straight to the **Feature Board**.\n\nThe Feature Board is the better route for most ideas: everything on it is public and other shooters can upvote. Search it before posting — if your idea is already there, an upvote counts for more than a duplicate.\n\nWhen describing an idea, the *why* matters as much as the *what*. Telling us the problem you are trying to solve usually leads to a better solution than describing the feature alone.',
     30, 900, TRUE)

ON CONFLICT (slug) DO NOTHING;

-- 000067 seeded category_order from each category's lowest sort_order, which
-- tied across most categories and fell back to alphabetical. That left
-- "Getting Started" fourth in the Help sidebar behind "Admin" — the one
-- category a new user has no use for. Pin the ends of the list explicitly.
UPDATE faqs SET category_order = 5   WHERE category = 'Getting Started';
UPDATE faqs SET category_order = 900 WHERE category = 'Getting Help';
UPDATE faqs SET category_order = 950 WHERE category = 'Admin';
