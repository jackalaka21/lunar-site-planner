# 30-Second Demo Video Script — Ridgeline

**Challenge:** NASA Space Apps Challenge Singapore 2026 — *Lunar Landing Site Navigator*
**Live URL:** https://lunar-site-planner.vercel.app
**Repository:** https://github.com/jackalaka21/lunar-site-planner
**Target Duration:** 30 seconds (approx. 75 words at 150 wpm)

---

## Shot List & Narration

| Time | Visual on Screen | Voiceover Narration |
|---|---|---|
| **0:00 – 0:06** | Open `https://lunar-site-planner.vercel.app`. The sleek 3D rotating Moon hero and the default **Scenario A** card (`Artemis III Mons Mouton`, landing `14 Jan 2027 06:00 UTC`) appear immediately. Highlight the **Good** verdict (`317 h` with both Sun and Earth) and the interactive **3D Lunar Terrain & Sky View** built from NASA LOLA elevation data and JPL DE440 ephemerides. | *"At the Moon's south pole, the Sun skims just one-and-a-half degrees above the horizon—so a single ridge decides whether a lander gets solar power and a direct radio link to Earth. Ridgeline lets mission planners test sites and dates in seconds using real NASA LOLA topography and JPL DE440 ephemeris data."* |
| **0:06 – 0:14** | Click **`Add scenario +14 d`** (or the **2-week launch slip** preset). **Scenario B** (`28 Jan 2027 06:00 UTC`) appears side by side with a red **Poor** verdict (`0 h`, `−317 h vs A`, landing in darkness). Rotate the 3D terrain view to show the Sun sightline beam blocked by the Mons Mouton ridge. | *"Suppose our launch slips two weeks. Adding Scenario B at plus fourteen days flips the same site from Good to Poor—losing all 317 usable hours because the Sun drops behind a mountain ridge."* |
| **0:14 – 0:22** | On Scenario B, click **`Find next good date`** (or open **`Landing calendar`**). Three recovery windows appear; click **`Add as scenario`** on `10 Feb 2027 06:00 UTC`, recovering a **Good** window (`317 h`). Then open the **Map** tab, toggle the **20 km nearby heatmap**, and drag the pin onto a neighboring ridge. | *"One click on 'Find next good date' scans a full year of libration and seasonal drift to recover a viable window—or we can drag the landing pin across the LOLA terrain grid to find a sunlit ridge nearby."* |
| **0:22 – 0:30** | Press **Play** on the global time bar (`T+0 d` → `T+14 d`) as shadows and the phase-lit Earth move across the cards, then click **`Copy link`** (`Link copied` toast). | *"Press Play to scrub the fourteen-day mission, check tip-over resilience and DSN station coverage, or copy the link to share the exact comparison. Everything runs offline-ready in your browser."* |

---

## Pre-Recording Checklist
1. Set browser viewport to `1440 × 900` in Dark mode (`https://lunar-site-planner.vercel.app`).
2. Verify Scenario A shows `Artemis crewed landing candidate: Mons Mouton`, `14 Jan 2027 06:00 UTC`, `Good`, `317 h (208–327)`.
3. Keep mouse movements smooth: `Add scenario +14 d` → `Find next good date` → `3D Terrain orbit` → `Play` → `Copy link`.
