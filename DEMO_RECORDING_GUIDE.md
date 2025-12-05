# SnapBack YC Demo Recording Guide

**"Code Breaks. SnapBack."**

This guide provides step-by-step instructions for recording the perfect YC demo video.

---

## 🎯 Demo Goals

**Primary Message:** SnapBack provides AI-safe code snapshots with intelligent risk detection.

**Key Points to Demonstrate:**
1. **3-level protection** (🟢 Watch, 🟡 Warn, 🔴 Block)
2. **AI detection** (detects 9 popular AI assistants)
3. **Session tracking** (multi-file atomic rollback)
4. **Zero friction** (sub-100ms overhead)

**Target Audience:** Developers using AI coding assistants (Copilot, Claude, Cursor, etc.)

---

## ⏱️ Demo Timing

**Total Duration:** 2-3 minutes

**Act 1 - Problem (30s):**
- Hook: "AI writes code fast. But what happens when it breaks?"
- Show rapid AI edits → introduce bugs
- Demonstrate Git's limitations (commit-based, slow)

**Act 2 - Solution (90s):**
- Introduce SnapBack's 3-level protection
- Demonstrate WATCH (silent auto-snapshot)
- Demonstrate AI detection
- Show instant rollback

**Act 3 - Closing (30s):**
- Highlight session tracking
- Performance budgets
- Call to action

---

## 🎬 Pre-Recording Checklist

### Environment Setup

- [ ] **VS Code version:** Stable (latest)
- [ ] **SnapBack installed from VSIX** (not dev mode)
- [ ] **Font size:** 16-18pt (readable on recording)
- [ ] **Theme:** Dark theme with high contrast
- [ ] **Zoom level:** 150% (for visibility)
- [ ] **Hide distractions:**
  - [ ] Close all other extensions panels
  - [ ] Disable notifications (Do Not Disturb)
  - [ ] Hide bookmarks bar
  - [ ] Close unnecessary panels (terminal, debug, etc.)

### Demo Workspace

```
demo-workspace/
├── .snapbackrc           # Pre-configured protection rules
├── api/
│   ├── auth.ts          # Demo file 1
│   ├── users.ts         # Demo file 2
│   └── database.ts      # Demo file 3
├── .env                 # Protected env file
└── package.json
```

**Pre-populate files with realistic code:**
- Use TypeScript for syntax highlighting
- Include functions, classes, API calls
- Add intentional bugs to fix during demo

### Recording Software

**Recommended:** Loom, QuickTime (Mac), OBS Studio

**Settings:**
- Resolution: 1920x1080 (Full HD)
- Frame rate: 30fps minimum
- Audio: Clear mic (no background noise)
- Cursor highlighting: ON (makes it easier to follow)

---

## 📝 Demo Script

### Opening (0:00 - 0:30)

**Narration:**
> "Hey! I'm [Name] from SnapBack. We solve a critical problem for developers using AI assistants like Copilot or Claude."

**Action:**
- Show VS Code with GitHub Copilot installed
- Show status bar: "SnapBack: AI Detected 🤖"

**Narration:**
> "AI writes code incredibly fast—but when it breaks something, you're stuck. Git commits are too slow and too coarse-grained. SnapBack gives you instant, file-level rollbacks with AI-aware protection."

---

### Demo Act 1: Protection Levels (0:30 - 1:30)

#### WATCH Level (Silent Auto-Snapshot)

**Narration:**
> "Let's start with WATCH level protection. This creates automatic snapshots on every save—completely silent, zero friction."

**Action:**
1. Right-click `auth.ts`
2. Select "Set Protection: Watch (Silent) 🟢"
3. Notice green indicator in file explorer
4. Make edits (add authentication function)
5. Save (Cmd+S)
6. **Emphasize:** "Notice the save? Less than 100 milliseconds. No delay at all."
7. Show snapshot in SnapBack tree view

**Performance callout:**
> "That snapshot was created in under 50 milliseconds. You don't even notice it."

#### WARN Level (Confirmation)

**Narration:**
> "For more critical files, use WARN level. This asks for confirmation before saving."

**Action:**
1. Change `auth.ts` to WARN level (🟡)
2. Make edits (modify API endpoint)
3. Save
4. Dialog appears: "Confirm snapshot creation"
5. Click "Create Snapshot & Continue"
6. File saves

**Timing callout:**
> "Dialog appears in under 300 milliseconds. Fast confirmation, not a roadblock."

#### BLOCK Level (Required Note)

**Narration:**
> "For mission-critical files like .env or production configs, use BLOCK level."

**Action:**
1. Show `.env` file (already BLOCK protected via .snapbackrc)
2. Edit: Add `API_KEY=sk_test_...`
3. Save
4. Dialog with note field appears
5. Enter: "Adding test API key for development"
6. Click "Create Snapshot & Continue"
7. Show snapshot with attached note

**Security callout:**
> "Notice the audit trail? Every change to sensitive files is logged with justification."

---

### Demo Act 2: AI Detection & Sessions (1:30 - 2:15)

#### AI Detection

**Narration:**
> "SnapBack automatically detects when you're using AI assistants. Watch what happens when I accept a Copilot suggestion..."

**Action:**
1. Start typing in `users.ts`
2. Trigger Copilot suggestion (or manually simulate)
3. Accept suggestion (large code block appears)
4. Save
5. Show snapshot with AI indicator 🤖

**Narration:**
> "See that AI icon? SnapBack detected the burst pattern—rapid, large insertions typical of AI completions. This snapshot is marked as AI-assisted."

#### Session Tracking

**Narration:**
> "But here's the real magic: SnapBack groups related changes into sessions."

**Action:**
1. Edit 3 files in quick succession: `auth.ts`, `users.ts`, `database.ts`
2. Save all 3
3. Wait for session finalization (show 2-minute timer in UI)
4. Session appears in Sessions tree view
5. Click session → shows all 3 files

**Narration:**
> "Now I can roll back this entire feature—all three files—with one click. Atomic rollback across your whole codebase."

**Action:**
1. Right-click session
2. Select "Restore Session"
3. Diff view opens showing all 3 files
4. Click "Restore All"
5. All 3 files revert instantly

**Performance callout:**
> "Session finalized in under 100 milliseconds. Three files restored in under 200 milliseconds total."

---

### Demo Act 3: Closing & CTA (2:15 - 2:45)

**Narration:**
> "So why SnapBack? Three reasons:"

**Action - Show quick montage:**

1. **Speed:** Flash WATCH save (<100ms overlay)
2. **Intelligence:** Show AI detection dashboard
3. **Safety:** Show BLOCK level protection on .env

**Narration:**
> "One: It's faster than Git. Sub-100 millisecond saves, instant rollbacks."
>
> "Two: It's AI-aware. Detects nine popular AI assistants and tracks AI-generated code."
>
> "Three: It prevents disasters. Block-level protection for sensitive files with full audit trails."

**Final hook:**
> "SnapBack is in private beta for YC companies. Visit snapback.dev to request access. Thanks!"

**Action:**
- Show URL: `https://snapback.dev`
- Fade to end card with:
  - Logo
  - Tagline: "Code Breaks. SnapBack."
  - CTA: "Request Beta Access → snapback.dev"

---

## 🎥 Recording Best Practices

### Do's ✅

- **Rehearse 3-5 times** before final recording
- **Use keyboard shortcuts** (looks professional)
- **Keep cursor visible** (viewers follow your actions)
- **Pause briefly** between sections (easier to edit)
- **Speak clearly** and at moderate pace
- **Show performance metrics** (millisecond counters)
- **Emphasize key points** with vocal inflection

### Don'ts ❌

- **Don't rush** - let actions breathe
- **Don't apologize** for mistakes (just re-record)
- **Don't read from script** word-for-word
- **Don't use filler words** ("um", "uh", "like")
- **Don't show errors** unless demonstrating error handling
- **Don't pan/zoom rapidly** (nauseating)

---

## 🎞️ Post-Recording Checklist

### Editing

- [ ] **Cut dead air** and long pauses
- [ ] **Add captions** (for accessibility and clarity)
- [ ] **Add performance overlays** (millisecond counters)
- [ ] **Add callout arrows** for key UI elements
- [ ] **Zoom in** on important details
- [ ] **Add transitions** between sections (subtle)
- [ ] **Background music** (optional, keep quiet)

### Export Settings

- [ ] **Resolution:** 1920x1080 (1080p)
- [ ] **Format:** MP4 (H.264)
- [ ] **Bitrate:** 8-10 Mbps (high quality)
- [ ] **Audio:** AAC, 128 kbps stereo

### Final Checks

- [ ] **Watch full video** (QA pass)
- [ ] **Check audio levels** (no clipping)
- [ ] **Verify all text readable** (font size)
- [ ] **Test on mobile** (viewport sizing)
- [ ] **Share with team** for feedback

---

## 📊 Success Metrics

After posting demo, track:

- **View count** (goal: 1000+ in first week)
- **Completion rate** (goal: >70%)
- **Click-through rate** to snapback.dev (goal: >10%)
- **Beta signup conversion** (goal: >5%)

---

## 🚀 Distribution Channels

Where to post demo:

1. **YC Company Directory** (primary)
2. **Twitter/X** (@snapbackdev)
3. **LinkedIn** (personal + company page)
4. **Hacker News** (Show HN: SnapBack)
5. **Reddit** (/r/programming, /r/vscode)
6. **Dev.to** (with blog post)
7. **YouTube** (unlisted, for embedding)
8. **Product Hunt** (on launch day)

---

## 📝 Demo Variations

### 30-Second Version (Social Media)

- Skip Act 1 (problem)
- Show only WATCH + instant rollback
- End with "Learn more at snapback.dev"

### 5-Minute Version (Deep Dive)

- Add technical details
- Show .snapbackrc configuration
- Demonstrate session manifest JSON
- Show performance benchmarks
- Include Q&A slide

---

## 🎯 Backup Plans

If something goes wrong during recording:

1. **Extension crashes:** Have backup VSIX ready, reinstall
2. **AI assistant not available:** Use pre-recorded AI completion
3. **Performance issues:** Close other apps, restart VS Code
4. **Audio problems:** Record voiceover separately
5. **Demo workspace corrupted:** Have backup workspace ready

---

## ✨ Polish Tips

- **Add cursor trail** effect (helps viewers follow)
- **Use hotkeys** instead of clicking (faster, cleaner)
- **Add "SnapBack:" prefix** to terminal commands (branding)
- **Show file tree** briefly before each action
- **Use **consistent code style** (Prettier/Biome)
- **Add "Powered by VS Code" credit** (community goodwill)

---

**Good luck with your demo! 🎬**

**Remember:** Authenticity > perfection. Show real value, solve real problems.
