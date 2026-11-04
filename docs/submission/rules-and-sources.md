# Submission rules and source review

Checked 4 November 2026. This review covers public organizer pages. The enrolled event form and later organizer announcements can add requirements.

## Event and media requirements

| Item | Public guidance | Submission action |
| --- | --- | --- |
| Track | Challenge 02 requires an enterprise workflow and Vultr backend/web deployment | Select Future of Work; show the actual multi-step finance/receiving workflow |
| Inference | Vultr Serverless Inference is optional for Challenge 02 | State the actual Anthropic worker integration and Vultr backend |
| Sandboxing | The explicit isolated-execution requirement belongs to Challenge 01 | Do not claim a sandbox that this product does not use |
| Timing | Public event dates are 3–8 November; detailed schedule remains unannounced | Verify the exact cutoff and timezone in the enrolled dashboard |
| Judging | Technology, presentation, business value, originality | Show execution, buyer hypothesis, source evidence, and a defensible comparison |
| Submission | Official entry must reach LabLab | A repository push or community post alone is insufficient |

Source: [Vultr event](https://lablab.ai/ai-hackathons/vultr-hackathon).

Standard guidance requests MP4/MOV video up to 300 MB and recommends under five minutes. It requests PDF slides and a public repository/demo URL. The cover is optional in the generic guide; prepare a 16:9 cover because the event lists it among submission assets. The generic presentation rubric treats a video under three minutes as weak; target about four minutes with problem, demonstration, business context, and next steps. This is a scoring consideration, not a three-minute eligibility cutoff. [Submission guide](https://lablab.ai/delivering-your-hackathon-solution) · [Rule book](https://lablab.ai/hackathon-rules)

The guide states: “The submission form and the event page always take priority over this guide.” [Submission guide](https://lablab.ai/delivering-your-hackathon-solution)

## Synthetic narration finding

The reviewed event page, rule book, submission guide, and terms do **not explicitly address synthetic narration**. They do not state a narration-specific ban, permission, or disclosure requirement. This finding is absence of a stated rule, not affirmative organizer approval.

Use a licensed preset voice and do not imitate an identifiable person's voice or represent generated audio as live microphone speech. If the final form asks about media creation, answer accurately. A short “Synthesized narration” credit would describe the audio truthfully, but the reviewed pages do not mandate that label.

The organizer requires original, open-source, MIT-compliant work unless the event says otherwise, and its terms address intentionally misleading content and third-party rights. Keep the presentation accurate about execution, synthetic records, and the internal ledger. [Terms](https://lablab.ai/terms-of-use)

## Defensible comparison

| Primary source | What it supports | What it does not establish |
| --- | --- | --- |
| [Ramp three-way matching](https://support.ramp.com/3-way-match-with-ramp-procurement) | Ramp matches bills, POs, and item receipts and displays receiving information | That Shortfall alone can handle late receipts or review current evidence |
| [Zip Superagents](https://zip.com/capabilities/superagents) | Zip describes procurement/AP agents, controlled actions, approvals, audit history, and deterministic critical actions | That Shortfall invented governed execution or that Zip lacks a particular stale-approval control |

Positioning inference: an inspectable short-shipment workflow is a coherent scope for this prototype. The demo makes changing evidence and its effect on approval visible. That focus does not prove a market gap or exclusive feature.

Buyer and $99/month pilot pricing are hypotheses. No customer interviews, adoption, savings, recovered cash, or willingness-to-pay data have been established.

## Final checklist

- [ ] Confirm enrollment, exact deadline/timezone, and any event-form changes.
- [x] Verify public demo and repository access without the presenter's session.
- [x] Verify fresh onboarding, sample documents, a new independent case, and documented limits.
- [x] Provide the MP4/MOV presentation and cover.
- [ ] Export the presentation as PDF and attach it to the submission.
- [x] Verify media duration, file size, narration clarity, and readable source amounts.
- [ ] Keep the frozen baseline, targeted CSV regression, and fresh CSV holdout separate in presented results.
- [ ] Use actual form options for track and technology tags.
- [ ] Check all required fields and final public media URLs before submitting.
- [ ] Confirm the LabLab dashboard records the submission.

The text fields in [entry.json](entry.json) fit the generic guide's stated limits: title 38 characters, summary 216, and description 1,811. The actual form remains authoritative.
