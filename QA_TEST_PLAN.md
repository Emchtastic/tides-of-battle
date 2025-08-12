# Tides of Battle - QA Test Plan

## Prerequisites
- ✅ Latest module installed to Foundry
- ✅ Module enabled in Foundry VTT
- ✅ Test as GM user
- ✅ Have test scene with tokens available

## Test Scenarios

### 1. Initial Load (No Combat State)
**Expected Behavior:**
- [ ] Combat dock appears immediately on game load
- [ ] Shows "Combat Tracker" title
- [ ] Shows "No active encounter" message
- [ ] Shows blue "Create Encounter" button (GM only)
- [ ] No JavaScript errors in console

**Test Steps:**
1. Restart Foundry VTT
2. Load a world with the module enabled
3. Check browser console for errors
4. Verify dock appearance and content

---

### 2. Create Encounter
**Expected Behavior:**
- [ ] "Create Encounter" button creates new combat
- [ ] Interface switches to "Preparing for Combat" state
- [ ] Shows "Players are selecting their phases..." message
- [ ] Shows green "Begin Combat" button (disabled if players pending)
- [ ] Console shows creation message

**Test Steps:**
1. Click "Create Encounter" button
2. Check console logs
3. Verify UI state change
4. Check that combat was created in sidebar

---

### 3. Add Combatants
**Expected Behavior:**
- [ ] Dragging tokens to combat tracker adds combatants
- [ ] NPCs auto-assigned to phases based on disposition:
  - Hostile → Enemy phase
  - Friendly → Fast phase  
  - Neutral → Fast phase
- [ ] Player characters trigger phase selection dialog
- [ ] Phase selection only shown to token owner (not GM)
- [ ] Pending players list updates correctly

**Test Steps:**
1. Drag a hostile NPC token to combat
2. Drag a friendly NPC token to combat
3. Drag a player character token to combat
4. Verify auto-assignments and dialogs
5. Test phase selection dialog

---

### 4. Phase Selection (Player Characters)
**Expected Behavior:**
- [ ] Only token owner sees phase selection dialog
- [ ] Dialog shows three options: Fast, Enemy, Slow
- [ ] GM doesn't see dialogs for tokens they don't own
- [ ] After selection, player removed from pending list
- [ ] "Begin Combat" button enabled when all players selected

**Test Steps:**
1. As token owner, select phase in dialog
2. Verify GM sees updated pending list
3. Test with multiple player characters
4. Test "Begin Combat" button state

---

### 5. Begin Combat
**Expected Behavior:**
- [ ] "Begin Combat" warns if players still pending
- [ ] When all selected, combat starts successfully
- [ ] Interface switches to active combat tracker
- [ ] Shows current phase (Fast Phase Round 1)
- [ ] Shows phase navigation buttons
- [ ] Combat officially starts in Foundry

**Test Steps:**
1. Try clicking "Begin Combat" with pending players
2. Complete all phase selections
3. Click "Begin Combat" when ready
4. Verify UI transition
5. Check combat state in Foundry

---

### 6. Active Combat Interface
**Expected Behavior:**
- [ ] Shows current phase and round number
- [ ] Shows combatants for current phase only
- [ ] Phase navigation buttons work (Previous/Next Phase)
- [ ] Round navigation buttons work
- [ ] "End Combat" button works
- [ ] Settings button opens configuration

**Test Steps:**
1. Navigate between phases
2. Test round navigation
3. Verify combatant filtering by phase
4. Test all control buttons

---

### 7. Error Handling & Edge Cases
**Expected Behavior:**
- [ ] No errors when switching scenes
- [ ] Dock recreates if accidentally closed
- [ ] No errors when ending combat
- [ ] No errors when deleting combatants
- [ ] Graceful handling of permission issues

**Test Steps:**
1. Switch between scenes
2. Close dock and wait for recreation
3. End combat and verify return to no-combat state
4. Test various error scenarios

---

### 8. Multi-User Testing (If Available)
**Expected Behavior:**
- [ ] Non-GM players don't see management buttons
- [ ] Players only get phase dialogs for their tokens
- [ ] Socket communication works for phase selection
- [ ] Real-time updates across clients

**Test Steps:**
1. Test with multiple connected users
2. Verify permission restrictions
3. Test phase selection communication

---

## Console Commands for Testing

```javascript
// Force dock recreation
if (ui.combatDock) ui.combatDock.close();
new CONFIG.combatTrackerDock.CombatDock(game.combat).render(true);

// Check current combat state
console.log("Combat:", game.combat);
console.log("Combat started:", game.combat?.getFlag("tides-of-battle", "combatStarted"));

// Check combatant phases
game.combat?.combatants.forEach(c => {
    console.log(`${c.name}: ${c.getFlag("tides-of-battle", "phase")}`);
});

// Force phase for testing
game.combat?.combatants.contents[0]?.setFlag("tides-of-battle", "phase", "fast");
```

## Expected Console Messages

```
ensureCombatDockExists: Creating combat dock for encounter creation
Created new encounter: [combat-id]
Processing new combatant: [name]
Auto-assigned [name] ([disposition]) to [phase] phase
GM processed phase choice: [name] -> [phase] (requested by user [user-id])
Combat started! All phases selected.
```

## Common Issues to Watch For

- [ ] Null reference errors
- [ ] V1 Application deprecation warnings (expected, non-breaking)
- [ ] Permission errors when non-owners try to update
- [ ] Missing dock after scene changes
- [ ] Phase selection dialogs shown to wrong users
- [ ] Begin Combat button not enabling properly

---

## Test Results Log

**Date:** [Fill in during testing]
**Foundry Version:** [Fill in]
**Module Version:** [Latest commit]

### Test 1: Initial Load
- Status: [ ] Pass / [ ] Fail
- Notes: 

### Test 2: Create Encounter  
- Status: [ ] Pass / [ ] Fail
- Notes:

### Test 3: Add Combatants
- Status: [ ] Pass / [ ] Fail
- Notes:

### Test 4: Phase Selection
- Status: [ ] Pass / [ ] Fail
- Notes:

### Test 5: Begin Combat
- Status: [ ] Pass / [ ] Fail
- Notes:

### Test 6: Active Combat Interface
- Status: [ ] Pass / [ ] Fail
- Notes:

### Test 7: Error Handling
- Status: [ ] Pass / [ ] Fail
- Notes:

### Test 8: Multi-User Testing
- Status: [ ] Pass / [ ] Fail / [ ] Not Tested
- Notes:

## Overall Assessment
- [ ] All critical functionality working
- [ ] Ready for production use
- [ ] Requires additional fixes
- [ ] Major issues found

**Summary:** [Fill in after testing]
