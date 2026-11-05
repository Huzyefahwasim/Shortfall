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

The 6 November recording passed 54 cue checks, verified 15 exact live source quotes, and matched the expected reconciled ledger and export. It shows deployed release 34bba3a with separate Overview, Documents, and Activity views, Home navigation, and End session. The business explanation describes the manual review steps, expected time benefits, and financial goals without claiming measured savings. Action footage retains its original speed. Narration was normalized separately; the only removed footage was 4.84 seconds of idle capture close time. Presentation timing is not a latency benchmark.

## Asset status

| Asset | Location | Status |
| --- | --- | --- |
| Presentation page | [Watch the demonstration](https://shortfall.95.179.254.189.sslip.io/submission/) | Public; browser playback and caption/readability review passed |
| Narrated MP4 | [demo.mp4](https://shortfall.95.179.254.189.sslip.io/submission/demo.mp4) | Published; delivery, technical metadata, playback, and nine seek points verified |
| 16:9 cover | [cover.png](https://shortfall.95.179.254.189.sslip.io/submission/cover.png) | Published |
| Captions | [captions.vtt](https://shortfall.95.179.254.189.sslip.io/submission/captions.vtt) | Published |
| Slide content and speaker notes | [slide-content.md](slide-content.md) | Available; export the presentation as PDF for submission |
| Submission text | [entry.json](entry.json) | Public video and cover URLs included; presentation PDF remains to be supplied |

## Published MP4 metadata

Verified 6 November 2026:

| Property | Value |
| --- | --- |
| Duration | 261.04 seconds, approximately 4:21 |
| Dimensions and frame rate | 1600 × 900, 25 fps |
| Video codec | H.264 |
| Audio | AAC, 48 kHz, mono |
| File size | 13,021,718 bytes, approximately 13.0 MB |
| Audio level analysis | Mean −17.4 dBFS; maximum −1.3 dBFS; integrated −16.40 LUFS |
| SHA-256 | `3584c6ca59b0dd67f847cb8d45939413f2a4c361de42f20a7e2fbd5f6ae86d4e` |

The file is below the generic 300 MB submission limit and recommended five minute duration. Browser review confirmed successful page/MP4/VTT delivery, advancing playback, all nine seek points, 54 caption cues, and no JavaScript or media errors. Inspected frames showed readable captions, the receipt quote, the $800 obsolete and $400 current proposal amounts, $4,400 net invoice, ten open PO units, business goals, and the closing disclosure. This playback check made no application API calls.

Application code retains its MIT license. The narration model's license is separate from the application's license. Retain relevant third-party notices when redistributing dependencies or model files.
