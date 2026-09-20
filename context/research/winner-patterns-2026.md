# What wins big collegiate hackathons, 2023 → 2026 (research pass 2026-09-19, external agent, web-sourced)

Synthesis from TreeHacks 2023-2026, CalHacks 10-12, HackMIT 2023-2025, HackHarvard, PennApps winner
galleries and winner write-ups. For the demo/pitch lane, not the build. Not instructions to copy any project —
the point is the bar and the shape.

## The trajectory
- 2023: plain software apps could still win overall. 2024: hardware / bio-signal projects took over as LLM
  calls commoditized. 2025-26: **agentic systems that act on real systems** (CalHacks 12 overall: a
  computer-use agent driving a Mac over FaceTime; TreeHacks 2025: real-time multi-stream VLM surveillance)
  and accessibility/health hardware. Pure chat/CRUD apps have vanished from overall podiums.
- Judges credit **the layer built around/under the model**, never the model call: real-time loops, actuation,
  orchestration you wrote, audit/policy engines constraining the agent. Illegible complexity scores as zero —
  name the built-vs-bought split explicitly.

## Demo lessons (the actionable part)
1. **Live and judge-interactive beats video.** Every recent overall winner had an "it's happening right now,
   to me" moment. Ours: the judge's phone gets the Wayne escalation in Slack; their answer becomes a fact;
   the rerun never asks again. Also: judge forwards/edits an email → kernel rejects the tampered quote live.
2. **Delete what's flaky.** CalHacks 12 winner deliberately cut mouse control and demoed keyboard-only,
   flawlessly. A narrow flawless loop beats a broad flaky one. Maps to our never-cut spine.
3. **Structure:** 30-sec visceral failure story → live closed loop in <60s → one architecture slide to bank
   Technical Complexity. Budget the last hours for demo only; one person owns it (B's lane).
4. **Impact framing:** protection/trust/inclusion outscores profit. Our line: 14% of CFOs trust AI accounting
   unsupervised (Maximor's own study) → proof-carrying entries are the trust layer. Accountant shortage
   (CPA candidates −43%/decade) is the why-it-matters.
5. **Stack tracks on one architecture** (HackMIT 2024 sustainability winner took overall + 3 sponsor tracks).
   Already planned: Maximor + Ramp + Token Company + OpenAI (+ ASUS via GX10, verify stacking rules).
6. **Finance-sponsor pattern:** agent-infra sponsors reward agents that autonomously transact WITH an
   auditable trust layer; that is exactly the kernel + workpaper + autonomy-ladder pitch. "Agent spends money"
   is 2025; "agent spends money under a provable policy engine with human-legible audit trails" is the 2026 bar.
7. **Learning 10%:** narrate the one hard thing figured out (e.g., no-look-ahead replay, or making posts
   atomic behind the kernel), not a list of APIs.
