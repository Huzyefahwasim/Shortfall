# Media notes

The presentation uses real interactions with the deployed Shortfall application and repository documentation. Business records are synthetic; ledger entries, approvals, jobs, and audit history are persisted application records. No payment, ERP update, or supplier message occurs.

## Narration

The voiceover is synthesized with **Kokoro-82M**, using the stock American English **af_heart** preset. It is not a recording or clone of the presenter's voice. The spoken script is available in [narration.txt](narration.txt); [timing cues](narration-timing.json) describe the presentation sequence.

Kokoro's source and model are published under Apache 2.0:

- [Kokoro source repository](https://github.com/hexgrad/kokoro) and [source license](https://github.com/hexgrad/kokoro/blob/main/LICENSE)
- [Kokoro-82M model card and license metadata](https://huggingface.co/hexgrad/Kokoro-82M)
- [Official voice list, including af_heart](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)

The narration does not imply customer endorsement or independent validation. Reviewed organizer pages do not specifically address synthesized narration; that absence is not affirmative organizer approval. [Rule review](rules-and-sources.md)

## Demonstration evidence

The video shows actual source uploads, quote inspection, a rejected obsolete approval, an approved internal hold, and approved supplier-credit reconciliation. The evaluation report distinguishes the frozen baseline from a targeted CSV regression and a fresh CSV holdout. The corpus and expected labels are project-authored; no customer corpus or independent reviewer was used. [Evaluation](../evaluation-results.md)

A source capture of the public workflow passed its checks. Editing targets allow pauses around actual actions; presentation timing is not a latency benchmark. Any elapsed-time cuts should be identified in the final edit.

## Asset status

| Asset | Location | Status |
| --- | --- | --- |
| Narrated MP4 | [demo.mp4](https://shortfall.95.179.254.189.sslip.io/submission/demo.mp4) | Planned public location; playback and delivery not yet verified |
| 16:9 cover | [cover.png](https://shortfall.95.179.254.189.sslip.io/submission/cover.png) | Planned public location; delivery not yet verified |
| Slide content and speaker notes | [slide-content.md](slide-content.md) | Available; export the presentation as PDF for submission |
| Submission text | [entry.json](entry.json) | Prepared; final media URLs remain empty until verified |

Application code retains its MIT license. The narration model's license is separate from the application's license. Retain relevant third-party notices when redistributing dependencies or model files.
