-- Adds Help articles for the Events feature and other recent additions.
-- Idempotent: ON CONFLICT (slug) DO NOTHING.

-- Slot the new "Events" category between Leagues (typically 50) and Clubs (typically 60)
-- by giving it 55. Pellet Testing wizard and Events feed items reuse existing categories.
INSERT INTO faqs (slug, category, question, answer_md, sort_order, category_order, is_published) VALUES

    ('events-overview', 'Events', 'What are Events?',
     E'**Events** are one-off matches and competitions, separate from leagues. Where leagues are recurring series with seasons and rounds, events are discrete shoots — a club open day, an FT or HFT match, a benchrest competition.\n\nAn event can be standalone or attached to a club. Anyone with permission can register, score, and watch the live scoreboard while the event is live.',
     10, 55, TRUE),

    ('creating-an-event', 'Events', 'How do I create an event?',
     E'From **Events**, tap **New Event**. The create form asks for:\n\n- **Name, dates, and location**\n- **Discipline** — pick a preset like **HFT** (Hunter Field Target), **FT** (Field Target), benchrest, or build a custom course\n- **Format** — *shot grid* (live per-shot tap entry) or *card submission* (benchrest 25-shot card)\n- **Categories** — e.g. weight class, age group, junior/senior\n- **Club** — optional; attaches the event to a club and changes the visibility default\n- **Visibility** — public, club only, or unlisted (link-only)\n\nDrafts can be edited before you promote the event to *Open for Entries*.',
     20, 55, TRUE),

    ('event-formats-shot-grid-vs-card', 'Events', 'Shot grid vs. card submission — which format should I use?',
     E'Two scoring formats are supported:\n\n- **Shot grid** — each shooter taps in scores per shot as they go round the course. Best for FT, HFT, and any lane-based discipline. The scoreboard updates in real time.\n- **Card submission** — each shooter submits a complete 25-shot card, the same as the standard score card. Best for benchrest, where shooters score whole cards rather than per-shot. Cards can be photographed, verified by an admin, and amended with an audit trail.\n\nThe format is set when the event is created and can''t be changed once scoring begins.',
     30, 55, TRUE),

    ('event-visibility', 'Events', 'Who can see an event?',
     E'Each event has one of three visibility settings:\n\n- **Public** — listed on the public Events page and shown in the activity feed.\n- **Club only** — visible to members of the attached club. Selecting a club on the create form switches the default to *club only* automatically.\n- **Unlisted** — only people with the link can see it. Useful for private competitions or invite-only matches.\n\nYou can change visibility at any time before the event archives.',
     40, 55, TRUE),

    ('joining-an-event', 'Events', 'How do I join an event?',
     E'Open the event and tap **Register**. While the event is *Open for Entries*, anyone matching the visibility rules can register.\n\nOrganisers can also add **guest participants** on behalf of shooters who don''t have a sub12 account — useful for club open days. Each participant has a display name shown on the scoreboard.',
     50, 55, TRUE),

    ('event-states', 'Events', 'What do the event states mean?',
     E'Events move through five states:\n\n1. **Draft** — being set up. Not visible to participants yet.\n2. **Open for Entries** — registration is open; scoring hasn''t started.\n3. **Live** — scoring is in progress; the scoreboard updates in real time.\n4. **Complete** — scoring is locked and the final results are published.\n5. **Archived** — the event is read-only and tucked away from active listings.\n\nThe owner promotes the event between states. Owners can also reopen a completed event if a correction is needed.',
     60, 55, TRUE),

    ('event-verification-benchrest', 'Events', 'How does verification work for benchrest events?',
     E'Card-submission events have optional verification controls:\n\n- **Require score verification** — every submitted card needs admin sign-off before it counts.\n- **Required confirmations** — how many admins must confirm a card (1 or more).\n- **Require image upload** — every card must include a photo of the physical target.\n- **Lock edits after verification** — once verified, the shooter can''t edit; only an admin amend will change the score.\n\nAdmins can **confirm**, **amend** (with a reason), or **reject** (with a reason) each card. Every change is logged in the audit trail.',
     70, 55, TRUE),

    ('event-scoreboard-and-standings', 'Events', 'How is the live scoreboard calculated?',
     E'The scoreboard reads live as scores come in. It groups shooters by category (e.g. weight class) and shows total points and any tiebreakers.\n\nScoring rules are set on the event:\n\n- **210 mode** — standard FT/HFT scoring out of 60 lanes (or whatever the course defines).\n- **XO mode** — bullseye/X-count tiebreaks for benchrest.\n\nWhen the event moves to *Complete*, the scoreboard freezes and becomes the final result.',
     80, 55, TRUE),

    ('my-events-on-dashboard', 'Events', 'What is the "My Events" section on my dashboard?',
     E'**My Events** on the Dashboard shows events you''re involved in — events you created, plus events you''ve registered for. Upcoming and live events appear first.\n\nIf you''re the organiser, an *Owner* badge appears next to the event name. Tap any event to jump straight to its page.',
     90, 55, TRUE),

    ('event-feed-items', 'Social', 'Why am I seeing events in my activity feed?',
     E'Events you follow — events at your club, events you''ve registered for, or events your friends are scoring in — surface in your **activity feed** as they go live, finish, or hit milestones. Tap any feed item to jump to the event page or scoreboard.\n\nYou can mute event activity for a specific event from its page if you don''t want updates.',
     35, COALESCE((SELECT MIN(category_order) FROM faqs WHERE category = 'Social'), 0), TRUE),

    ('pellet-testing-wizard', 'Pellet Testing', 'What is the new pellet test wizard?',
     E'The pellet test wizard walks you through a test in three short steps: **setup** (rifle, pellet, distance, conditions), **groups** (one or more groups, photo or manual), and **review** (MOA, mean radius, batch confidence).\n\nYou can leave at any step and finish later from the Testing page — the wizard keeps your draft until you submit.',
     65, COALESCE((SELECT MIN(category_order) FROM faqs WHERE category = 'Pellet Testing'), 0), TRUE)

ON CONFLICT (slug) DO NOTHING;
