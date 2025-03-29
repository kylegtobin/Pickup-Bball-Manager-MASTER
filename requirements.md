# Pickup Basketball App Requirements

## 1. UI Overview & Interaction

### 1.1 Main Screen Layout

#### Player Addition
- A prominent input field at the top labeled "Enter New Player"
- A corresponding "Add Player" button is available
- Keyboard Interaction: After entering a player name, the user can either click the "Add Player" button or press the Enter key to add the player
- Duplicate Name Prevention: If a user attempts to add a player whose name is already in the system, a pop-up notification appears stating: "[Player Name] is already in the system, please include a last initial or last name if needed"
- The pop-up includes a single "Ok" button to dismiss the message
- When a player is added (and passes validation), they immediately join the Waiting Queue at the end

#### Player Removal (General)
- A separate input box allows users to type a player's name and click "Remove Player" to remove them
- Keyboard Interaction: After entering a player name for removal, the user can either click the "Remove Player" button or press the Enter key to execute the removal
- Validation Pop-Up: If the name entered in the remove player box does not match any player currently in the system, a pop-up notification appears: "[Player Name] is not currently in the system"
- The pop-up includes a single "Ok" button to dismiss the notification
- Right-Click Context Menu (Removal): Right-clicking on a player's name anywhere in the app—including in the Champions box, Challengers box, or the Waiting Queue—opens a context menu near the cursor
- This context menu includes a "Remove Player" option
- Selecting "Remove Player" removes the player from the system (removal is not automatic until the user confirms by clicking this option)
- Replacement Behavior: When a player is removed from the Champions or Challengers team, the system fills the vacancy with an individual from the Waiting Queue, with replacement behavior logic detailed in Section 6.1

### 1.2 Drag-and-Drop Behavior for Teams and Waiting Queue

#### Applicability
- Drag-and-drop functionality is enabled only in Manual Mode (see Section 5)

#### Champions/Challengers Boxes
- Ordering: The order of players within these boxes is irrelevant
- When a player is dropped into either box, they are automatically appended to the bottom
- Temporary Capacity (0–10): Each box can temporarily hold between 0 and 10 players in Manual Mode
- If a user attempts to move an 11th player into a box, the drag/drop is rejected, and the player remains in their original location
- User Interaction: Players can be dragged into these boxes from other areas (e.g., from the Waiting Queue or between teams)

#### Waiting Queue
- Spacing & Layout for Drag-and-Drop: The Waiting Queue should include clear spacing ("drop zones") between individuals and Previous Teams, allowing the user to insert a dragged entity at the very top, between existing entries, or at the end
- UI Grouping for Previous Teams: Each Previous Team (a group of players that arrived together) is visually grouped in a box to indicate they arrived together
- This grouping box should have an empty slot if the team has fewer than 5 players, allowing an individual to be dragged in without exceeding 5
- Ordering Flexibility: In Manual Mode, any team (i.e., an entire Previous Team) or individual can be dragged to any position in the Waiting Queue
- Handling Groups (Previous Teams): A Previous Team can be dragged as a unit
- If a user drags an individual out of a Previous Team, that individual is highlighted to indicate they are being separated from the group
- The system ensures that a Previous Team never exceeds 5 players
- Team Splitting: If a Previous Team is reduced to a single player (via removals), that player remains in the "Previous Team" bucket in Manual Mode
- Once Manual Mode is turned off, if a Previous Team has only one player, that player is reclassified as an individual, preserving its original queue position
- Contextual Removal: Right-clicking on a player in the Waiting Queue opens a context menu with a "Remove Player" option

### 1.3 In-Game UI Elements
- Game Start: The game automatically starts when there are 10 players in the Waiting Queue
- The first 5 players become Champions, and the next 5 become Challengers
- Manual Mode Toggle & Game End Controls: A visible toggle labeled "Manual Mode" is present on the main UI (typically near the top)
- Two buttons labeled "Champions Won" and "Challengers Won" are always visible on the main UI to trigger the end-of-game logic
- 3-Point Shootout Pop-Up: When a 3-point shootout is required, a modal pop-up labeled "3-POINT SHOOTOUT" appears (for full details on the shootout mechanics, refer to Section 3)

## 2. Game Flow & Team Rotation

### 2.1 Initial Game Formation
- Automatic Trigger: When the Waiting Queue reaches 10 players, the system automatically forms:
  - Champions: The first 5 players from the Waiting Queue
  - Challengers: The next 5 players
- UI Update: The Champions and Challengers boxes update accordingly

### 2.2 Post-Game Rotation
- Winning & Losing Teams: The winning team remains on the court as Champions
- The losing team (always a full 5-player team) is appended to the Waiting Queue as a Previous Team
- New Challengers Formation: The new Challengers team is formed by processing the Waiting Queue in order (top to bottom) until 5 players are assembled
- Processing Details:
  - Individuals: Single players are taken directly
  - Previous Teams:
    - If a Previous Team exactly fills the remaining spots, it is used in full
    - If a Previous Team has more players than required, a 3-point shootout is triggered to select exactly the number needed
  - Post-Shootout:
    - The selected winners join the new Challengers
    - The non-selected (losing) subset is moved to the top of the Waiting Queue
    - If the shootout leaves only one player, that player is treated as an individual

## 3. 3-Point Shootout Mechanics

### 3.1 Trigger Conditions
- A shootout is triggered when:
  - A Previous Team must contribute only a portion of its members to complete a 5-player team
  - A 3-Point Shootout or Random Selection is triggered if the Waiting Queue consists solely of Previous Teams (or if a vacancy is filled solely by Previous Teams) and the required number of individuals to fill the vacancy is exactly 1

### 3.2 Selection Requirements
- Exact Number Needed: The required number is calculated as: Required = 5 – (number of individuals already selected)
- User Selection Enforcement:
  - Users cannot select more than [X] players. If [X] is reached, further clicks on unselected players are ignored until one of the selected players is unselected
  - The Confirm Selection button lights up to a brighter color when exactly [X] players are selected
  - If the user attempts to confirm without exactly [X] players selected, a pop-up appears stating: "Please select [X] players"
  - This pop-up includes a single "Ok" button to dismiss it

### 3.3 Post-Shootout Processing
- Winners: The selected winners join the new Challengers team
- Losers: The losing subset is moved to the top of the Waiting Queue
- Single Remaining Player: If the shootout leaves only one player, that player is treated as an individual (not as a one-player Previous Team)

## 4. Waiting Queue & Previous Teams – Order and Fairness

### 4.1 Queue Order
- The Waiting Queue follows a first-come, first-served principle
- New players are appended at the end
- Previous Teams: Losing teams are appended as full 5-player Previous Teams
- If players later leave a Previous Team, the group shrinks but remains a Previous Team if it has between 2 and 5 players
- Single Player Exception: If a Previous Team is reduced to a single player (upon exiting Manual Mode), that player is then treated as an individual in the Waiting Queue

### 4.2 Processing for New Teams
- When forming a new team (e.g., new Challengers):
  - Priority: The system processes the Waiting Queue in order
  - Individuals vs. Previous Teams:
    - Individuals are used directly
    - For Previous Teams:
      - If the entire Previous Team is needed, it is used in full
      - If only part of a Previous Team is needed, a shootout is triggered for that team
    - The shootout losers are moved to the top of the Waiting Queue (or treated as individuals if only one remains)
- Guarantee of Participation: This ensures that players—and groups that have waited together—are prioritized for the next game

## 5. Manual Mode

### 5.1 Activation and Behavior
- Toggle Mechanism: Manual Mode is toggled via a visible switch or button (typically near the top of the screen)
- By default, Manual Mode is Off
- When Manual Mode is On:
  - Drag-and-Drop Enabled:
    - Drag-and-drop functionality is enabled for:
      - Champions Box and Challengers Box:
        - Up to 10 players can temporarily reside in these boxes (0–10)
        - The order within these boxes is irrelevant; new players dropped here are appended to the bottom automatically
      - Waiting Queue: Refer to Section 1.2 for detailed drag-and-drop behavior in the Waiting Queue
  - Exiting Manual Mode:
    - Manual Mode can only be turned off if both the Champions and Challengers boxes contain exactly 5 players
    - If a user attempts to exit Manual Mode with an invalid team size, a pop-up or modal appears stating: "Both teams must have exactly five players before turning manual mode off"
    - The user must correct the team sizes before Manual Mode can be turned off

## 6. Additional Edge Cases

### 6.1 Player Removal During Game

When a player is removed from either the Champions or Challengers team during a game:

1. The application will automatically enable Manual Mode
2. A notification will appear informing the user to:
   - Drag a replacement player from the waiting queue to the team that lost a player
   - Turn off Manual Mode once the replacement is complete

3. The game will remain in Manual Mode until:
   - A replacement player has been dragged to the appropriate team
   - Both teams have exactly 5 players
   - The user turns off Manual Mode

4. If the user attempts to turn off Manual Mode before both teams are complete:
   - A notification will appear indicating that teams must be complete
   - Manual Mode will remain enabled

5. Once a valid replacement is made and Manual Mode is turned off:
   - The game will return to its normal state
   - Play can continue with the new team composition

This approach gives users direct control over team replacements while ensuring teams remain properly balanced.

## 7. Summary of Game Rotation Scenarios (Test Cases)

### Scenario 1: Enough Individuals
- Before Game End:
  - Champions: [1, 2, 3, 4, 5]
  - Challengers: [6, 7, 8, 9, 10]
  - Waiting Queue: Individuals [11, 12, 13, 14, 15, 16, 17]
- Event: Champions win; losing Challengers (6–10) are appended as a Previous Team
- After Formation:
  - New Champions: [1, 2, 3, 4, 5]
  - New Challengers: [11, 12, 13, 14, 15]
  - Waiting Queue: Individuals [16, 17] followed by Previous Team [6, 7, 8, 9, 10]

### Scenario 2: Insufficient Individuals, Shootout Needed
- Before Game End:
  - Champions: [1, 2, 3, 4, 5]
  - Challengers: [6, 7, 8, 9, 10]
  - Waiting Queue: Individuals [11, 12] and Previous Team [13, 14, 15, 16, 17]
- Event: Champions win; losing Challengers (6–10) are appended as a Previous Team
- After Formation:
  - New Champions: [1, 2, 3, 4, 5]
  - New Challengers: Formed from Individuals [11, 12] plus 3 winners selected via shootout from the Previous Team [13, 14, 15, 16, 17]
  - Waiting Queue: The shootout losers (2 players) are moved to the top, followed by Previous Team [6, 7, 8, 9, 10]

### Scenario 3: Mixed Waiting Queue with Previous Teams
- Before Game End:
  - Champions: [1, 2, 3, 4, 5]
  - Challengers: [6, 7, 8, 9, 10]
  - Waiting Queue (top to bottom):
    - Individual: 11
    - Previous Teams: [12, 13]
    - Individual: 14
    - Previous Teams: [15, 16, 17]
    - Individual: 18
- Event: Champions win; losing Challengers (6–10) are appended as a Previous Team
- After Formation:
  - New Champions: [1, 2, 3, 4, 5]
  - New Challengers: Take Individual 11, then the entire Previous Team [12, 13] (totaling 3 players), add Individual 14 (totaling 4), and trigger a shootout on Previous Teams [15, 16, 17] for exactly 1 winner (e.g., player 15) to complete 5 players
  - Waiting Queue: The shootout losers (e.g., [16, 17]) are moved to the top (if more than one remains, they stay as a Previous Team; if only one remains, it is treated as an individual once Manual Mode is off), followed by any remaining individuals (e.g., 18), then Previous Team [6, 7, 8, 9, 10]

### Scenario 4: Challengers Win
- Before Game End:
  - Champions: [1, 2, 3, 4, 5]
  - Challengers: [6, 7, 8, 9, 10]
  - Waiting Queue (top to bottom):
    - Individual: 11
    - Previous Team: [12, 13, 14, 15, 16]
    - Individuals: [17, 18]
- Event: Challengers win, so they become the new Champions. Losing Champions ([1, 2, 3, 4, 5]) are appended as a Previous Team at the bottom
- After Formation:
  - New Champions: [6, 7, 8, 9, 10]
  - New Challengers: Formed by taking Individual 11, then processing Previous Team [12, 13, 14, 15, 16]. Since 4 spots are needed, a shootout selects exactly 4 winners. The shootout leaves one remaining player (treated as an individual once Manual Mode is off) who is moved to the top
  - Waiting Queue: Top: The leftover individual from the shootout (e.g., player 16), followed by Individuals [17, 18], then Previous Team [1, 2, 3, 4, 5]
