# Ctrl+Alt+Steal: updated event guide

For the club heads and volunteers running the event. This builds on the original volunteer guide and explains what the website now does for you. No spoilers here: the answers are in [HOST-ANSWER-KEY.md](HOST-ANSWER-KEY.md).

## What changed, and why

| Original plan | Now | Why it's better |
| --- | --- | --- |
| Paper slips collected after each round | Crews answer on their phones. Answers save as they type and lock automatically at 00:00. Paper slips are the backup. | No 2–4 minute collection windows, no lost slips, no late-submission arguments. |
| Clues read out on the projector | Clues also unlock on every phone and stay in a **Case file** tab. | Nobody has to copy clues down. Quiet crews stay in the game. |
| One pattern puzzle in Round 2 | Three questions with partial credit, **paid hints**, and a **speed bonus** for the first 3 crews to lock in all-correct answers. | Every crew scores something; fast crews get a thrill; stuck crews can buy their way back in. |
| Vault: private gamble per team | **Game-show vault.** Six doors, each crew picks one and wagers. Doors open one by one on the big screen. | The whole hall watches the same doors open. Biggest cheer of the night. |
| Final bet: right ×, wrong loses | Same idea, with a cushion: 3/3 right pays ×3, 2/3 gets the bet back, 1 or 0 loses it. | Rewards good-but-not-perfect reasoning, still very dramatic. |
| Final reveal read out | Step-by-step reveal on the projector with drumrolls, how many crews named each suspect, then final standings and a podium. | A proper climax. |
| — | **Leaderboard blackout** after the Vault. Crews still see their own credits. | Nobody can play safe by watching the board. The reveal really is a reveal. |
| — | **Shared deduction board** on every phone in a crew (cross out suspects, star the prime suspect, crew notes). | Gets the whole crew discussing, not just the person with the phone. |
| — | **Badges** at the podium: Oracle, Speed Demon, Codebreaker, Deepfake Hunter, Jackpot, High Roller, Safe Hands, Mastermind, Diamond Hands, Comeback Crew. | More crews get a moment on the big screen, not just the top 3. |
| — | Live ticker on the projector ("Byte Bandits locked in", "Door D: JACKPOT!"). | The room feels alive between big moments. |

## Credits and payouts

All numbers can be changed in **Admin → Case & content**.

- **Start:** 1,000 credits per crew.
- **Round 1 · Trading Floor:** stake up to **600** in total across eight leads. A real lead returns stake × its odds (×1.5 to ×4). A rumour loses its stake. Unstaked credits are safe.
- **Round 2 · Training Log:** Q1 +100, Q2 +150, Q3 +200. Hints cost 75, 75 and 100. Speed bonus +150 / +100 / +50 for the first three crews to **lock in** all three correct.
- **Round 3 · The Lineup:** eight pieces of evidence. +80 per correct Real/Fake call, −40 per wrong call, 0 if left blank.
- **Round 4 · The Vault:** bank (keep everything) or wager **100 up to 50%** of your credits on one door. Behind the six doors: 1 Jackpot (×3), 2 Gold (×2), 2 Dud (×0.5), 1 Alarm (×0). Jackpot and Gold also unlock a **bonus clue** for that crew only.
- **Finale:** bet anything from 0 to all your credits. 3/3 right → bet ×3, 2/3 → bet back, 1 or 0 → bet lost.
- **Winner:** most credits after the final bet. Speed only matters for the Round 2 bonus.

## The rounds, as the room experiences them

Each round has four beats, all driven from the control room: **Explain** (rules on screen, answers closed) → **GO** (timer runs, phones open) → **Lock** (automatic at 00:00) → **Reveal** (answers, payouts, clue).

1. **The Trading Floor (10 min).** Eight leads with odds, like a betting market. After it locks, the projector shows how much the whole room bet on each lead, then stamps each one REAL or RUMOUR.
2. **The Training Log (15 min).** A corrupted log on screen and phones. Crews can buy hints. The projector shows how many crews have locked in. At the reveal: answers, the speed-bonus podium, Clue 2.
3. **The Lineup (12 min).** Evidence styled as WhatsApp chats, Instagram posts, emails, logs and notes. The projector cycles through each piece. At the reveal, each is stamped REAL or AI FAKE with the "tell" explained, plus how the room voted. *Optional:* add real and AI-generated photos in the content editor.
4. **The Vault (7 min).** Bank or pick a door. When it locks, every crew's name appears under its door. The host opens doors one by one (save the jackpot for last). Payouts land on each phone as its door opens.
5. **Connect the dots (15 min).** All clues on the big screen and phones. Crews use their deduction board. No hints from volunteers.
6. **Name the Thief (8 min).** Pick three answers and place a bet.
7. **The Reveal.** "The answers are in" with the total credits on the line → the thief → the hideout → the recovery method → epilogue → final standings → podium and badges.

## Run of show with the website

Times are minutes from when check-in opens, same as the original guide. The control room lists every step with a **Run** button, and the big **▶ Next** button always does the next one.

| Time | Step | What the host presses |
| --- | --- | --- |
| 0:00 | Check-in | Lobby is on by default. Desk volunteers check crews in. |
| 0:15 | Briefing | Next → Briefing |
| 0:25 | Round 1 | Next → Explain, Next → GO (10:00), locks itself, Next → Reveal |
| 0:48 | Leaderboard | Next |
| 0:50 | Round 2 | Explain → GO (15:00) → Reveal |
| 1:15 | Round 3 | Explain → GO (12:00) → Reveal |
| 1:38 | Leaderboard | Next |
| 1:40 | Break | Next (starts a 10:00 break timer) |
| 1:50 | Round 4 | Explain → GO (7:00) → Reveal, then open doors one by one |
| 2:09 | Blackout | Next (hides the leaderboard until the reveal) |
| 2:10 | Connect the dots | Next (15:00 timer) |
| 2:25 | Finale | Next → GO (8:00), locks itself |
| 2:37 | The Reveal | Next for each beat |
| 2:47 | Podium | Next |

The old collection windows are now spare minutes. Use them for paper slips, host banter, and keeping the projector on the leaderboard longer.

**Timer controls** are on every admin page: pause, −30s, +30s, +1 min. If time already ran out, **+1 min reopens the round** (handy if the host needs to give extra time).

## Who does what

| Role | Admin login | Main page |
| --- | --- | --- |
| Host / Event Director | Club head | **Control room**: Next button, announcements, timers, vault doors, reveal |
| Floor Manager | Club head | **Rounds & answers** on a phone: who hasn't answered, disputes |
| Tech Head 1: Scorer | Club head | **Scores & fixes**: check totals, add adjustments, export CSVs |
| Tech Head 2: Projector & content | Club head | Projector laptop on `/screen`; **Case & content** before the event |
| Ops Head 1: Registration | Volunteer | **Teams & check-in**: search, one-tap check-in, walk-ins |
| Ops Head 2: Logistics | Volunteer | **Print kit** (before), **Rounds & answers → Enter** for paper slips |
| Social media & design | Volunteer | Help at the desk and with paper slips; capture the podium |

Volunteers can check crews in, add walk-ins and enter paper answers until a round is revealed. They never see answer keys. Once the first round starts, only club heads can undo a check-in.

## Before the event

- [ ] Put it online: Supabase, Render and UptimeRobot, with both passwords set (see the README).
- [ ] Run the load test against the real server (`npm run load-test`) and check it reports no errors.
- [ ] The day before and on the morning of the event: the Supabase project isn't paused (click **Restore** if it is), and `https://<render>/api/health` shows `"ok":true`.
- [ ] Fill in the date, venue, start time and Instagram in **Settings & data**. Open registration.
- [ ] Read the case in **Case & content**. Change anything you like. If the repository will ever be public, change the solution and clues here.
- [ ] Optional: add real and AI-generated photos to Round 3.
- [ ] Do the dry run with **demo crews** (Settings & data), then press **Reset after dry run** and delete the demo crews.
- [ ] Print team code cards and a set of answer slips for every round (Print kit).
- [ ] Download a backup.

## If something goes wrong

- **Wi-Fi or mobile data dies:** hand out paper slips. Volunteers enter them in **Rounds & answers**. The projector keeps working on the laptop's connection.
- **A phone can't sign in:** check the code on the Teams page. Use **New code** if a code leaked (it logs out everyone using the old one).
- **A wrong answer key or a dispute:** fix the key in Case & content or the crew's answer in Rounds & answers. Totals recalculate. For anything else, add an adjustment with a reason.
- **Projector laptop crashes:** open `/screen` again. Nothing is lost; the game lives on the server.
- **"Reconnecting…" on every screen:** the game server is restarting (Render can do this at any time). Wait a few seconds: screens reconnect by themselves and every saved answer is still there. If a red "not being saved" bar appears in the admin panel, download a backup.
- **The game server is down for good:** run Plan B from the README (`npm run laptop`) and restore your latest backup on it.
- **Fake or joke registrations:** delete them on the Teams page, and switch registration off in Settings & data once sign-ups close. Walk-ins can still be added at the desk.
- **"Too many wrong attempts" at sign-in:** someone on the same Wi-Fi typed a lot of wrong codes or passwords. It clears in 5 minutes, or switch that phone to mobile data.
- **Total disaster:** restore the last backup from **Settings & data**.

## Still to decide

- Event date, time slot and expected number of crews (sets how many desk volunteers you need).
- Prizes and certificates for the top three and the badge winners.
- Whether to add photo evidence to Round 3.
