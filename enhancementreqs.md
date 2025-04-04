# New Features for Waiting Queue (Final Version)

## Overview

You have a pickup basketball app with:

- Champions and Challengers boxes (5 players each).
- A Waiting Queue (with individuals or Previous Teams).
- End-of-game triggers (“Champions Won” / “Challengers Won”) plus 3-Point Shootouts when required.
- Manual Mode for drag-and-drop queue changes.

### Two New Features:

1. **Left-Side Estimated Wait Time**  
   - Displays how many minutes until a player can expect to play (each game lasts up to 12 minutes).  
   - Dynamically recalculates after each game start/end, queue changes, or manual mode toggles.

2. **Right-Side Color + Games-Behind Indicator**  
   - Shows how many games a player is behind (or partial ranges like “1–2,” “2–3”).  
   - Color-coded from Green (next game) to Red (3+ games away).

---

## Manual Mode Impact

- Both left/right indicators disappear while Manual Mode is On.
- When turned Off, both features recalc from the new queue arrangement, continuing the current game timer unless a new game started.

---

## 1. Estimated Wait Time (Left Side)

### 1.1 Placement & UI

- Each Waiting Queue entry (individual or Previous Team) has a small box/label on the **left**.
- This box is aligned vertically with the queue entry and **colored to match** the “games behind” category on the right side.
- **Manual Mode:** When On, hide these boxes. When Off, recalc and show them again.

---

### 1.2 Base Wait Times

At the start of a new game cycle (after a previous game ends early or completes a full 12 minutes):

| Games Behind | Base Wait Time |
|--------------|----------------|
| 1            | 12 minutes     |
| 1/2          | 18 minutes     |
| 2            | 24 minutes     |
| 2/3          | 30 minutes     |
| 3            | 36 minutes     |
| 3/4          | 42 minutes     |
| 4            | 48 minutes     |
| 4/5          | 54 minutes     |
| 5 or above   | 1 Hour+ (60+)  |

---

### 1.3 Minute-by-Minute Decrement

During an ongoing game (up to 12 minutes):

- Subtract elapsed minutes from the player’s category base time.
- Example: If 2 behind (24 min) and 4 minutes have elapsed, display 20.
- After 12 minutes, wait times are capped until the next game starts.

---

### 1.4 New Players & Removals Mid-Game

#### 1.4.1 New Players Arriving Mid-Game

1. **Determine Games Behind**
   - Count total players or team members ahead.
   - Assign full (e.g., 2) or partial category (e.g., 2–3) from Section 2.2.

2. **Lookup Base Time**
   - From 1.2, e.g., 2–3 → 30 minutes base.

3. **Subtract Elapsed Time**
   - If 6 min elapsed, 30 – 6 = 24 shown.

4. **Edge Handling**
   - System recalculates only on queue changes or game transitions.

---

#### 1.4.2 Player Removals Mid-Game

- When a player is removed:
  - Everyone behind shifts up.
  - If someone moves from 2 → 1 game behind:
    - Rebase from 24 → 12, then subtract elapsed time.

---

### 1.5 Game End & Reset

When a game ends – which could in theory take any amount of time to complete – the system uses **12 minutes (which is an average game time)** as a cap for the game’s internal timer.

In other words:

- A new game cycle begins only when the user clicks **"Champions Won"** or **"Challengers Won"** (after any required 3-Point Shootout).
- Once triggered, everyone's estimated wait times are re-assigned based on their updated queue position using the table from 1.2.

**Key Point:**  
In practice, a real pickup game could last any amount of time, but the system uses up to 12 minutes as its game cycle time for wait time logic. Anything beyond 12 minutes, and the system assumes the game is likely near completion, and once the user triggers game end a new cycle begins with the baselines times reset to 12 minutes again.

---

### 1.6 Manual Mode Edge Case

- **Manual Mode = On:** Hide the left-side wait time boxes entirely. Timer still runs internally.
- **Manual Mode = Off:** Recalc wait times using (base – elapsed time). Do not reset the game timer unless a new game started.

---

## 2. Color + Games-Behind Indicator (Right Side)

### 2.1 Placement & UI

- Each entry has a color-coded box on the **right** side.
- Indicates games behind (integer or partial like 1–2).
- **Colors match** the left-side wait time box.

---

### 2.2 Categories & Colors

| Games Behind | Color        | Description                                  |
|--------------|--------------|----------------------------------------------|
| 1            | Green        | Guaranteed next game                         |
| 1–2          | Light Green  | Shootout or partial for game 1               |
| 2            | Light Yellow | Exactly 2 behind                             |
| 2–3          | Medium Yellow| May be in 2 or 3                              |
| 3            | Light Red    | Exactly 3 behind                             |
| 3–4          | Red          | Partial or shootout between 3 and 4          |
| 4            | Darker Red   | Exactly 4 behind                             |
| 4–5          | Darkest Red  | Between 4 and 5                              |
| 5+           | Solid Red    | 1 Hour+                                      |

---

### 2.3 Determining “Games Behind” (Formula & Detailed Logic)

#### 2.3.1 Individuals: Simple Formula

Let `n =` total number of “spots” (individuals + sum of members in previous teams) **ahead** of this individual in the queue.

- **Formula:**  
  `gamesBehind = 1 + floor(n / 5)`

#### 2.3.2 Previous Teams: Partial Fill / Shootout Logic

A **previous team** of size `k` (2 ≤ k ≤ 5) may fit entirely or cross boundaries in the queue.

1. **Compute** `n =` total spots ahead (sum of individuals + earlier teams’ members).
2. **Positions:** They occupy `{n+1,...,n+k}`.
3. `alpha = 1 + floor(n / 5)` → earliest block they might fully occupy (positions 5·(alpha–1)+1 to 5·alpha).

- If `(n + k) ≤ 5*alpha`, they fully fit → label `alpha` (integer).
- Else if `(n + k) ≤ 5*(alpha+1)`, they cross that boundary → label “`alpha–(alpha+1)`”.
- If bridging two entire blocks (rare), “`alpha–(alpha+2)`”.

**Examples:**

- 8 ahead + team of 5 → positions 9–13 → partial bridging for 2nd block (6–10) → “2–3.”
- 10 ahead + team of 4 → positions 11–14, which fits block 3 (11–15) → “3.”

##### Pseudo-Logic

```bash
gamesBehind_individual(n):
    return 1 + floor(n / 5)

gamesBehind_team(n, k):
    alpha = 1 + floor(n / 5)

    if (n + k) <= 5*alpha:
        return alpha
    else if (n + k) <= 5*(alpha+1):
        return str(alpha) + "-" + str(alpha+1)
    else:
        return str(alpha) + "-" + str(alpha+2)  # bridging 2 blocks, rare
```

---

### 2.4 Manual Mode Edge Case

- **Manual Mode = On:** The right-side color boxes vanish.
- **Manual Mode = Off:** The system recalculates “games behind” for each queue entry; no new 12-min cycle unless the user triggers a new game.

---

## 3. Implementation Notes

- **Early Ends:** If a game ends at e.g. 8 minutes, a new game starts. Everyone’s left side re-base (12, 18, 24…) and the right side re-check from Section 2.
- **Storing the Timer:** Use `currentGameStartTime` or elapsed minutes. Decrement each player’s wait estimate accordingly.
- **One Hour+ Cap:** If someone is 5+ games behind, display “1 Hour+” and color with solid red.
- **Arrivals & Departures:** Summarized in Section 1.4. Always recalc when new players enter or someone is removed.

---

## 4. Example Flow

1. **Game Start:** Everyone gets a base from 1.2 (12, 18, 24, 30…).
2. **4 Min In:** New player arrives, determined “2 behind” → 24 – 4 = 20. Right side = yellow “2.”
3. **Manual Mode On:** Left/right indicators vanish. Timer keeps ticking.
4. **Manual Mode Off:** Recalculate everyone’s times with (base – 7), colors update.
5. **Game Ends @ 10 min:** Queue shifts, timer resets to 0, base times reassigned from 1.2.

---

## 5. Final Summary

This document fully covers:

- Estimated wait logic (baseline times and decrements).
- Game start/end triggers.
- Manual Mode rules and timer continuation.
- Full logic for calculating and updating “games behind.”
- Visual/UI behavior to ensure clarity and fairness for all players.
