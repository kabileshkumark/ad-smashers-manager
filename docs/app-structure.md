# AD Smashers Manager - App Structure for Review

## Product Intent

AD Smashers Manager is a private admin app for running the AD Smashers Tamil Club badminton community from one place.

The app should help manage:

- Friday and Saturday weekly sessions
- FlexiDay sessions when they become operational
- Court directory with phone, WhatsApp, location, rates, and notes
- Player list, guests, racket needs, attendance, and payment status
- Poll templates and weekly message templates for WhatsApp groups
- Court allocation, waiting list, booking decisions, and settlement tracking
- Manual admin workflows first, with room for automation later

The app should feel like an operations dashboard, not a marketing site. It should prioritize speed, clarity, and repeat weekly actions.

## Target Platform

The app should be built as a mobile-first Progressive Web App for iPhone 16/17 Pro usage.

PWA expectations:

- Installable to the iPhone home screen
- App-like launch with branded icon and splash behavior
- Local-first data storage so weekly operations work even with weak venue connectivity
- Export and backup support for session, court, player, and payment data
- Fast load time on mobile data
- Works well in Safari and as an installed iOS web app
- No required desktop-only interactions
- Reminder-ready, with in-app reminders in local-first mode and optional push notifications when the app is hosted with push support

Mobile design requirements:

- Design for one-handed use during WhatsApp/admin workflows.
- Primary actions should sit near the thumb zone, especially Copy Poll, Copy Final List, Mark Paid, Add Player, and Promote from Waitlist.
- Use a bottom tab bar or bottom action rail for core navigation on mobile.
- Keep forms short and split long workflows into steps.
- Use large touch targets, with at least 44 px height for tappable controls.
- Respect iPhone safe areas using `viewport-fit=cover` and `env(safe-area-inset-*)`.
- Avoid hover-only interactions.
- Avoid dense desktop tables on mobile; use compact cards, grouped rows, filters, and drill-in detail screens.
- Use sticky session actions at the bottom of the screen.
- Keep generated WhatsApp message previews readable without horizontal scrolling.
- Support dark-mode-ready contrast decisions, even if v1 ships with a light theme.

Mobile technical requirements:

- Web app manifest with club name, short name, theme color, icons, and display mode.
- Service worker for app-shell caching.
- Use IndexedDB or another reliable browser storage layer for local data.
- Use responsive CSS with dynamic viewport units where needed for iOS browser chrome.
- Use correct mobile input types: telephone for phone numbers, number/decimal for AED amounts, date/time controls for sessions.
- Provide copy-to-clipboard with a fallback manual select flow if browser permissions are limited.
- Provide WhatsApp deep links where useful, while keeping manual copy as the dependable default.
- Treat WhatsApp direct-send and direct-poll creation as best-effort only; the app must always provide a reliable copy-and-open fallback.
- Provide notification permission onboarding only after the user enables reminders.
- Use in-app reminders and overdue badges as the baseline.
- Treat background push notifications as an enhanced mode that may require hosting, service worker push support, and user permission.

## Brand Assets

Logo:

- Source file: `assets/ad-smashers-logo.png`
- Format: PNG
- Dimensions: 1024 x 1024
- Usage: app header, compact sidebar identity, empty states, printable/exported session summaries, and optional splash/loading state

Reference screenshots:

- WhatsApp poll sample: `assets/examples/whatsapp-poll-sample.png`
- Use this as the source for poll-builder layout, copy tone, and option labels.

Brand cues from the logo:

- Deep teal base
- Slightly lighter teal surface accents
- Gold ornamental/accent details
- Warm cream primary text/icon color
- Amber-gold Tamil text accent

Design use:

- The logo should appear clearly in the app chrome, but the working screens should stay practical and uncluttered.
- Use the full circular logo in the dashboard and settings/about areas.
- Use a smaller cropped or simplified logo treatment in dense navigation if needed.
- Avoid placing large repeated logo watermarks behind tables or forms, because the app is primarily an admin tool.

## Community Structure

Groups represented in the app:

- Announcements - admin-only community-wide updates
- AD Smashers - Saturday - Saturday registration and updates
- AD Smashers - Friday - Friday registration and updates
- AD Smashers - Automation - reusable templates, reminders, and admin utilities
- AD Smashers - FlexiDay - future extra or weekday games
- Arattai Arangam - general discussion, memes, and non-game conversation

Each group should store:

- Group name
- Purpose
- WhatsApp group URL
- Default session type, if applicable
- Default template category
- Active/inactive status
- Notes

## WhatsApp Publishing Flow

The app should support one-tap publishing helpers for group messages, while respecting WhatsApp's limits from a PWA.

Supported reliable behavior:

- Generate the message text inside the app.
- Copy the generated message to clipboard.
- Open the relevant WhatsApp group URL stored in settings.
- Show a clear fallback if clipboard copy fails, so the admin can manually select and copy.
- Keep a "last copied" timestamp for each message type.

Best-effort behavior:

- Offer a "Share to WhatsApp" action using a WhatsApp text/share URL where supported.
- This may open WhatsApp with text prefilled, but may still require the admin to select the target group manually on iPhone.
- The app should never assume a message was sent unless the admin marks it as sent.

Important limitation:

- The app should not rely on automatically creating a WhatsApp poll from a PWA link.
- For polls, the dependable flow is: copy poll intro, open the group, create the WhatsApp poll manually, and use the app-provided option labels.
- If WhatsApp later supports direct poll creation through a public URL/API, the app can add it as an enhancement.

Publish actions:

- Copy and Open Group
- Copy Only
- Open Group Only
- Share Text to WhatsApp
- Mark as Sent

Recommended publish flow for final list and reminders:

1. Admin taps "Publish".
2. App copies the generated message.
3. App opens the configured WhatsApp group URL.
4. Admin pastes and sends.
5. Admin returns to the app and taps "Mark as Sent".

Recommended publish flow for polls:

1. Admin taps "Prepare Poll".
2. App shows the poll intro and poll option labels.
3. App copies the poll intro.
4. App opens the configured WhatsApp group URL.
5. Admin creates a WhatsApp poll manually using the listed options.
6. Admin returns to the app and taps "Poll Published".

## Reminder and Notification Flow

The app should support a configurable weekly operations schedule for each session type.

Reminder types:

- Issue poll
- Check poll response count
- Close poll
- Confirm or book courts
- Publish final list
- Send payment reminder
- Mark attendance
- Close session
- Backup data

Reminder rule fields:

- Rule name
- Session type: Friday, Saturday, FlexiDay, or all
- Trigger timing: exact day/time or relative to session start
- Target action: Copy Poll, Close Poll, Copy Final List, Open Payments, Open Booking, Backup
- Default WhatsApp group
- Notification channel: in-app, browser notification, or both
- Enabled/disabled
- Snooze duration
- Notes

Reminder event fields:

- Linked session
- Due date and time
- Status: upcoming, due, overdue, done, skipped, snoozed
- Completed date and time
- Completed by, future multi-admin mode
- Related message/template

PWA notification behavior:

- Baseline v1 should show reminders inside the app, dashboard badges, and sticky "next action" prompts.
- If browser notifications are enabled, the app should request permission from the installed PWA and show reminders when supported.
- A local-only PWA should not promise guaranteed background notifications at exact times if the app is closed.
- Reliable background notifications should be treated as an optional hosted enhancement using Web Push or a backend scheduler.
- Every notification should open the relevant session/action when tapped.

Default reminder examples, to be finalized after schedule is provided:

- Friday session: issue poll, close poll, publish list, payment reminder
- Saturday session: issue poll, close poll, publish list, payment reminder
- FlexiDay session: interest check, confirm court, publish list

Dashboard reminder behavior:

- Show the next due action at the top.
- Show overdue actions before upcoming actions.
- Let the admin mark a reminder as done without leaving the dashboard.
- Let the admin jump directly to the relevant message/template.
- Keep a simple reminder history for each session.

## Core Workflow

1. Create a weekly session for Friday, Saturday, or FlexiDay.
2. Select court, date, time, expected courts, capacity, and booking status.
   - Usual Friday/Saturday flow: pre-book 2 courts before issuing the poll.
   - Some weeks may pre-book 3 courts before issuing the poll.
   - Occasional flow: publish the poll first, then book courts after enough responses.
3. Generate reminder events for the session from the configured schedule.
4. Generate/copy the compact WhatsApp poll intro for the relevant group.
5. Open the configured WhatsApp group link from the app.
6. Create the WhatsApp poll with standard options: I'm in, I'm in +1, I'm in +2, and I need a racket.
7. Mark the poll as published in the app.
8. Record poll responses in voting order after checking the WhatsApp vote list.
9. Treat "I need a racket" as a support tag, not as a separate player by itself.
10. Auto-allocate first 12 players into Court 1 and Court 2 when 2 courts are planned.
11. Place remaining players on Waiting List.
12. Add Court 3 or more when available and promote waitlisted players in voting order.
13. Capture guests using +1 and +2 options.
14. Mark racket requests for players who need a racket.
15. Publish confirmed player list and waiting list message.
16. Track court booking cost, shuttle cost, per-player split, payments, and pending members.
17. Close the session with attendance, no-shows, cost summary, and notes for future planning.

## Poll Publishing Pattern

The actual weekly WhatsApp poll is short and direct. The app should generate the message text and show the exact poll options to create in WhatsApp.

Booking wording:

- If courts are already reserved, show "{{court_count}} Courts pre-booked".
- If courts will be booked after poll response is enough, show "{{court_count}} Courts planned".
- If the court is fully booked and confirmed, show "{{court_count}} Courts booked".
- Friday and Saturday should default to 2 courts pre-booked, with a quick option for 3 courts.

Observed poll style:

```text
Hi Makkalae [wave], Please vote here to join us on [calendar] {{short_day}}, {{date}}.
[clock] {{start_time}} to {{end_time}} - {{court_count}} Courts pre-booked
[lightning] {{court_name}}
[pin]

{{location_link}}
```

WhatsApp poll settings:

- Poll type: multiple choice, "Select one or more"
- Option 1: I'm in
- Option 2: I'm in +1
- Option 3: I'm in +2
- Option 4: I need a racket

Interpretation rules:

- "I'm in" means the player is joining alone.
- "I'm in +1" means the player plus one guest, total 2 slots.
- "I'm in +2" means the player plus two guests, total 3 slots.
- "I need a racket" means racket support is required and should be combined with one of the attendance options.
- If a voter selects only "I need a racket", the app should flag the response as incomplete until the admin confirms whether they are playing.
- If a voter selects more than one attendance option, the app should warn the admin and use the highest selected guest count only after confirmation.
- Internally the app should use the spelling "racket". The outgoing poll option label should remain editable in case the group wants the exact current WhatsApp wording.
- Poll publishing should use copy-and-open by default because direct poll creation from a PWA is not reliable.

## Final List Publishing Pattern

After the poll ends and courts are confirmed, the app should generate a WhatsApp-ready final list message in the community's current format.

The final list should include:

- Session day and date
- Time range
- Court name
- Location link
- Total amount paid to venue or booking provider
- Per-person amount
- Confirmed courts with numbered players
- Waiting list with numbered empty slots if there are no waitlisted players yet
- Court charge note
- Shuttle charge note

Formatting rules:

- Use the same short, visually scannable WhatsApp style as the current community posts.
- Court sections should be generated dynamically from the number of booked courts.
- Each court should show up to 6 numbered players by default.
- Waiting List should show actual waiting players first, then optional empty numbered slots.
- If there is no waiting list, the admin can choose either "No waiting list" or blank numbered slots.
- Per-person amount should be editable before copying, because final rounding may be manual.

## Navigation

Primary navigation:

- Dashboard
- Sessions
- Courts
- Players
- Templates
- Payments
- Reminders
- Reports
- Settings

Secondary quick actions:

- New Friday Session
- New Saturday Session
- New FlexiDay Session
- Copy Poll
- Copy Player List
- Copy Payment Reminder
- Copy and Open WhatsApp Group
- Mark Reminder Done
- Snooze Reminder
- WhatsApp Court
- Open Map

Mobile navigation:

- Bottom tabs: Dashboard, Sessions, Courts, Players, More
- Session detail should use horizontal tabs or a segmented control: Overview, Poll, Courts, Payments, Messages
- High-frequency actions should appear in a sticky bottom action bar inside each session
- Less frequent areas such as Reports, Settings, Templates, and Backups can live under More
- Reminders should surface through Dashboard and session sticky actions; full reminder settings can live under More.

## Screen Design

### 1. Dashboard

Purpose: the weekly command center.

Key sections:

- Upcoming sessions: Friday, Saturday, FlexiDay
- Session stage: Draft, Poll Live, Booking Pending, Booked, List Published, Payment Pending, Completed
- Quick stats: confirmed players, waitlist, racket requests, unpaid amount, court count
- Urgent actions: publish poll, book court, publish list, chase payments
- Due reminders: issue poll, close poll, publish list, collect payments
- Recent activity: players added, payments marked, court contacted

Primary actions:

- Create session
- Continue latest Friday session
- Continue latest Saturday session
- Copy next message

Mobile behavior:

- Show the next Friday/Saturday session first.
- Use compact status cards with one primary action each.
- Keep urgent action buttons fixed near the lower part of the screen when scrolling.
- Avoid dashboard charts in the first viewport; operational actions come first.
- Show the most urgent reminder as the first actionable item.

### 2. Sessions

Purpose: manage every game session from poll to settlement.

Session fields:

- Session type: Friday, Saturday, FlexiDay
- Date
- Time slot
- Court venue
- Court count planned
- Court count booked
- Players per court, default 6
- Max confirmed capacity, derived from court count
- Booking status
- Poll status
- Payment status
- Reminder status
- Notes

Session stages:

- Draft
- Poll Live
- Poll Closed
- Booking In Progress
- Booked
- Player List Published
- Payment Collection
- Completed
- Cancelled

Session detail tabs:

- Overview
- Poll Responses
- Court Allocation
- Booking
- Payments
- Messages
- Reminders
- Notes

Mobile behavior:

- The session detail screen should feel like a step-by-step control room.
- Use a sticky footer for the next best action: Copy Poll, Close Poll, Copy Final List, Mark Payments, or Complete Session.
- Keep date, time, court, and status visible at the top while moving across tabs.
- For editing many players, use add/search rows and quick toggles instead of wide spreadsheets.
- Session reminders should appear as a compact checklist inside the session.

### 3. Poll Responses

Purpose: enter WhatsApp poll results in the correct order and convert multi-select votes into clean session data.

Fields per response:

- Vote order
- Player
- Attendance choice: I'm in, I'm in +1, I'm in +2, incomplete, or not playing
- Guest count
- Racket needed
- Raw selected poll options
- Time voted, optional
- Notes

Behavior:

- First confirmed players are allocated by vote order.
- +1 adds one guest under the same main player.
- +2 adds two guests under the same main player.
- Guests count toward court capacity.
- Racket-needed players are highlighted in the session.
- "I need a racket" does not count as attendance unless paired with an attendance option or confirmed by the admin.
- Duplicate player entries are warned before saving.
- Conflicting multi-select responses are flagged for admin review.

Mobile behavior:

- Add response flow should be optimized for repeated entry from the WhatsApp vote screen.
- Use player search with quick create.
- Guest count and racket-needed should be one-tap controls.
- Vote order should auto-increment but remain editable.

### 4. Court Allocation

Purpose: build a clean player list for posting.

Rules:

- Each court supports maximum 6 players.
- First 12 players go to Court 1 and Court 2 when 2 courts are available.
- Remaining players go to Waiting List.
- If Court 3 is added, waitlisted players move in voting order.
- Admin can manually move a player for practical reasons, but the app should show the original vote order.

Views:

- Court 1
- Court 2
- Court 3+
- Waiting List
- Racket Needed
- Guests Summary

Useful controls:

- Add court
- Remove court
- Move to waitlist
- Promote from waitlist
- Copy allocation message

Mobile behavior:

- Courts should appear as stacked sections rather than side-by-side columns.
- Player movement should support simple actions: Move, Swap, Waitlist, Promote.
- The waiting list should remain easy to access after Court 1 and Court 2.
- Copy Final List should be visible without requiring the admin to scroll back to the top.

### 5. Courts Directory

Purpose: keep every known badminton venue and contact in one place.

Court fields:

- Venue name
- Contact person, optional
- Phone number
- WhatsApp number, default same as phone
- Location link
- Area
- Number of courts available
- Indoor/outdoor
- Typical rate
- Preferred time slots
- Booking method: call, WhatsApp, app, walk-in
- Cancellation policy
- Parking notes
- Court quality notes
- Last contacted date
- Last booked date
- Active/inactive

Actions:

- Call
- Open WhatsApp chat
- Open location
- Copy booking request
- Mark as preferred

Mobile behavior:

- Court rows should prioritize name, area, last booked, rate, and quick action icons.
- Phone, WhatsApp, and map actions should be one tap.
- Location links should open in the default maps app when possible.

### 6. Players

Purpose: maintain member records and make weekly management easier.

Player fields:

- Name
- Display name for WhatsApp messages
- Phone
- WhatsApp number
- Preferred days: Friday, Saturday, FlexiDay
- Skill level, optional
- Racket owned: yes/no/unknown
- Usually needs racket: yes/no
- Payment method preference
- Attendance count
- No-show count
- Pending balance
- Notes
- Active/inactive

Player profile sections:

- Contact details
- Attendance history
- Payment history
- Session notes
- Guest history

### 7. Templates

Purpose: generate consistent WhatsApp-ready messages.

Template types:

- WhatsApp poll intro
- WhatsApp poll option labels
- Booking process
- Confirmed player list
- Waiting list update
- Court booked confirmation
- Payment request
- Payment reminder
- Cancellation message
- FlexiDay interest check
- Court booking request to venue

Template behavior:

- Select session and court.
- App fills date, time, venue, location, court count, capacity, shuttle cost, and player list.
- Admin can edit before copying.
- One-click copy for WhatsApp.
- Publish actions should use the session's configured WhatsApp group URL.
- The app should support copy-only, open-only, and copy-and-open flows.

### 8. Payments

Purpose: settle court and shuttle costs without confusion.

Payment fields per session:

- Court cost total
- Total paid to venue or booking provider
- Shuttle cost per player, default 5 AED
- Other costs, optional
- Discount/adjustment, optional
- Total players
- Equal split amount
- Published per-person amount
- Amount paid by each player
- Pending amount
- Payment method
- Paid date
- Notes

Behavior:

- Calculate per-player amount from confirmed players.
- Add shuttle charge to each confirmed player.
- Track partial payments.
- Show who paid and who is pending.
- Generate payment reminder message.

Mobile behavior:

- Payment status should be a fast checklist: Paid, Pending, Partial.
- Amount entry should use numeric keypad.
- Pending players should be easy to copy into a WhatsApp reminder.
- Show total collected, total pending, and expected total in a sticky summary.

### 9. Reminders

Purpose: keep weekly operations on time.

Reminder views:

- Today
- Upcoming
- Overdue
- By session
- Rules/settings

Core controls:

- Mark done
- Snooze
- Skip
- Open related session
- Open related template
- Enable browser notifications

Reminder rule examples:

- Friday issue poll
- Friday close poll
- Friday publish final list
- Friday payment reminder
- Saturday issue poll
- Saturday close poll
- Saturday publish final list
- Saturday payment reminder
- FlexiDay interest check

Mobile behavior:

- Reminders should be one-tap actionable.
- The main reminder screen should avoid calendar complexity in v1.
- Use a simple chronological list grouped by Due, Today, Tomorrow, and Later.
- Show the related group and publish action beside each reminder.

### 10. Reports

Purpose: learn from repeated sessions.

Useful reports:

- Attendance by player
- Payment pending list
- Court usage history
- Average players per Friday/Saturday
- No-show list
- Racket request frequency
- Monthly court spend
- Shuttle cost summary
- Most-used venues

### 11. Settings

Purpose: keep operational defaults editable.

Settings:

- Club name
- Default players per court: 6
- Default shuttle cost per player: 5 AED
- Default shuttle type: Yonex Mavis 350 Green Cap
- Default Friday group name
- Default Saturday group name
- Default FlexiDay group name
- Friday WhatsApp group URL
- Saturday WhatsApp group URL
- FlexiDay WhatsApp group URL
- Announcements WhatsApp group URL
- Automation WhatsApp group URL
- Arattai Arangam WhatsApp group URL
- Admin name/signature
- Currency: AED
- Default session stages
- PWA install status/help
- Backup and restore location
- Reminder schedule defaults
- Browser notification permission status
- Default reminder snooze duration
- Reminder quiet hours

## Data Model

Suggested entities:

- `Group`
- `CourtVenue`
- `Player`
- `Session`
- `PollResponse`
- `CourtAllocation`
- `Payment`
- `MessageTemplate`
- `ReminderRule`
- `ReminderEvent`
- `InventoryItem`
- `SessionNote`

Important relationships:

- A session belongs to one group and optionally one court venue.
- A session has many poll responses.
- A poll response belongs to one player and may include guest count.
- A session has many court allocations.
- A payment belongs to one session and one player.
- A template can be global or session-specific.
- A reminder rule can generate many reminder events.
- A reminder event belongs to one session and optionally one message template.

## Message Templates

### WhatsApp Poll Intro Template

```
Hi Makkalae 👋🏻, Please vote here to join us on 🗓️ {{short_day}}, {{session_date}}.
⏱️ {{start_time}} to {{end_time}} - {{court_count}} Courts {{court_status}}
⚡ {{court_name}}
📍

{{location_link}}
```

Poll options to create in WhatsApp:

```text
I'm in
I'm in +1
I'm in +2
I need a racket
```

### Booking Process Template

```text
AD Smashers - Booking Process

1. We will publish a poll in the respective day group every week.
2. Once we receive enough participants, we will share the player list and proceed with court bookings.
3. Based on availability, we will try to pre-book {{court_count}} courts.
4. Each court can accommodate a maximum of {{players_per_court}} players.
5. The first {{confirmed_capacity}} players will be added to confirmed courts based on the time of voting in the poll.
6. Remaining players will be added to the Waiting List.
7. If additional courts become available, players from the Waiting List will be moved to the next court in voting order.
8. If you are bringing additional players, choose +1 or +2 in the poll.
9. Please bring your own racket if you have one. If you need a racket, select "I need a racket" in the poll.
10. Once the player list is published, please ensure your name is included before coming to the venue.

Court charges will be split equally among all confirmed players.
Shuttlecock charge: {{shuttle_cost}} AED per player.
Shuttlecock: {{shuttle_type}}.
```

### Final Player List Template

```
🏸 {{short_day}}, {{session_date}} 🏸
🕗 {{start_time}} to {{end_time}} 🕗

⚡{{court_name}}
📍{{location_link}}

Total Paid: {{total_paid}} AED
💳 {{per_person_amount}} AED / Person

✅ Final List
━━━━━━━━━━━━━━━
{{court_sections}}
━━━━━━━━━━━━━━━
🏸 Waiting List
{{waiting_list_slots}}
━━━━━━━━━━━━━━━
💰 Court Charges: To be split equally among confirmed players
🏸 Shuttle Charges: +{{shuttle_cost}} AED per player
```

Generated court section format:

```text
🏸 Court {{court_number}}
1. {{player_1}}
2. {{player_2}}
3. {{player_3}}
4. {{player_4}}
5. {{player_5}}
6. {{player_6}}
```

### Court Booking Request Template

```
Hi {{court_contact_name}},

We would like to check badminton court availability.

Date: {{session_date}}
Time: {{session_time}}
Courts needed: {{court_count}}
Duration: {{duration}}

Please confirm availability and total cost.

Thank you.
```

### Payment Reminder Template

```
Payment Reminder - AD Smashers {{session_day}}

Date: {{session_date}}
Amount pending: {{amount_due}} AED

Pending players:
{{pending_players}}

Please complete the payment when possible.
```

## Proposed Build Phases

### Phase 1 - Review and App Shell

Goal: clickable local PWA app structure with mobile navigation and placeholder data.

Includes:

- Dashboard
- Sessions list
- Courts directory
- Players list
- Templates page
- Payments page
- Reminders page
- Web app manifest
- Mobile bottom navigation
- Branded app icon and theme color
- Responsive iPhone-first layout

### Phase 2 - Real Session Management

Goal: create and manage Friday/Saturday sessions end to end.

Includes:

- New session flow
- Poll response entry
- Auto court allocation
- Waiting list handling
- Copyable WhatsApp messages
- Court booking fields
- Sticky mobile session actions
- Copy-to-clipboard fallback
- WhatsApp group URL routing
- Mark as sent/published status
- Reminder events generated from session schedule

### Phase 3 - Payments and History

Goal: close the loop after each game.

Includes:

- Cost calculator
- Paid/pending tracking
- Payment reminder template
- Attendance and no-show history
- Session archive
- Reminder completion history

### Phase 4 - Polish and Admin Utilities

Goal: make the app feel fast and dependable for weekly use.

Includes:

- Search and filters
- CSV/JSON import and export
- Data backup
- Court preference ranking
- Reports
- FlexiDay readiness
- Offline-ready app shell
- Backup and restore
- Add-to-home-screen guidance
- Optional browser notification support

### Phase 5 - Optional Future Automation

Goal: support more automation only after manual workflows are stable.

Options:

- Reminder scheduling inside the app
- Hosted push notification scheduler
- WhatsApp deep links with prefilled text
- Calendar export
- Player self-registration form
- Cloud sync
- Multi-admin access

## Design Direction

Visual tone:

- Clean, fast, sports-operations dashboard
- Dense enough for repeated admin work
- Friendly but not playful to the point of slowing use
- Mobile-first, because weekly management likely happens near WhatsApp
- Desktop-friendly for bulk player/payment updates
- Branded around the AD Smashers logo without letting decoration overpower weekly operations

Layout principles:

- Dashboard first, not a landing page
- Use tabs for session details
- Use compact mobile cards and grouped rows for players, payments, and courts
- Use clear status colors for session stage and payment status
- Keep message preview and copy action close together
- Keep WhatsApp and map actions visible wherever court details appear
- Use bottom navigation and sticky action bars for the iPhone PWA experience
- Design desktop as an expansion of the mobile app, not the other way around
- Surface due reminders as actions, not passive alerts.

Suggested palette:

- Logo teal as the primary brand color
- Gold/amber for highlights, waiting list, and payment-pending states
- Warm cream for text or icons on dark teal surfaces
- Blue for neutral admin actions where a separate action color improves clarity
- Red only for cancellation, overdue, or blocked states
- White/light gray content surfaces with strong table readability

## Key Approval Questions

Please review and confirm:

- Should the first build be a local browser app in this folder?
- Should data be stored locally first, with export/backup, before adding any cloud login?
- Is the Friday/Saturday flow the correct MVP priority?
- Do you want FlexiDay visible from day one as inactive/draft, or hidden until needed?
- Should player skill level be tracked, or should the app stay strictly operational?
- Should payments track only paid/pending, or also exact amount, partial amount, and payment method?
- Should court allocation be fully automatic by poll order, or allow manual adjustments with audit notes?
- Should the outgoing poll option be spelled "I need a racket" or kept exactly as the current group wording if different?
- Should the PWA be optimized only for your admin use, or should it later support other admins on their phones too?
- Should v1 store everything only on your iPhone/browser, or should it include manual backup/restore from the start?
- Should publishing default to "copy and open group", with "share to WhatsApp" as an optional best-effort action?
- What is the weekly reminder schedule for Friday and Saturday?
- Should v1 use in-app reminders only, or include browser notification permission and best-effort PWA notifications?
- Are quiet hours needed so reminders do not appear late at night?

## Recommended MVP

Build first:

- Dashboard
- Court directory
- Player directory
- Create Friday/Saturday session
- Add poll responses manually in vote order
- Auto-allocate courts and waiting list
- Generate poll and confirmed-list templates
- Track paid/pending status
- Mobile PWA shell with installable app icon
- Local-first storage with backup/export
- Store WhatsApp group URLs and open the correct group for each publish action
- Reminder rules for issue poll, close poll, publish list, and payment follow-up

Hold for later:

- Cloud sync
- Multi-admin login
- Automatic WhatsApp posting
- Player self-service registration
- Advanced reports
