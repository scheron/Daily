# Optional release feature media

Read this reference only after the user opts into release media in step 6. Produce an 8–15-second silent feature story: a 1920×1080, 30 fps MP4 and a looping GIF targeting 960×540 at 15 fps. Use English for questions, briefs, captions, alt text, project documentation, and source comments; translate any non-English stock prompts from installed skills into English.

At any blocked stage, if the owner chooses to release without media, record media as skipped for this release and stop this workflow. Return to the ordinary step 9 release approval without a preview requirement, and omit the step 10 media attachment.

## 1. Brief the feature

Read the available `agent-motion` and `design-motion-principles` skills, using the latter's Create workflow. Follow the installed `agent-motion` role and model policy, including its available Codex creative and technical defaults; keep that policy authoritative instead of copying a second model profile here. If a required skill, model, permission, or renderer is unavailable, report the specific limitation and ask whether to fix it or continue the release without media.

Choose one user-visible outcome from the approved release scope. Give the director the actual feature behavior, relevant source files, current UI references, duration, silent output formats, and English copy. Create a fresh scene plan and assets for this feature; reuse production mechanics rather than the story or composition of an earlier release. Preserve earlier projects and outputs in a new release-specific project folder.

**Done:** the brief identifies the feature, truthful UI references, story, output contract, and available production roles.

## 2. Produce and check the clip

Use the repository's [release-media runtime README](../../../../scripts/release-media/README.md) as the authoritative CLI and project contract. Pass the project path explicitly; do not copy a private runtime or add app dependencies for rendering. For example, after creating a compliant project:

```bash
node scripts/release-media/render.mjs --project /absolute/path/to/project --out /absolute/path/to/new-output
```

Use its part-render and assembly commands when the story has independent parts. Save the source project, final files, render status, metadata, and SHA-256 digests with the project.

Check representative frames and motion at the story's critical moments: opening a surface, scrolling, searching, selecting, saving, and the end-to-start loop, wherever those actions appear. Compare them with current app behavior and source references. Use truthful demo data and identify a staged reconstruction as a demo; never call a reconstruction an app recording. Verify labels, selection, scroll position, and saved state from those references rather than letting hand-authored scenes drift. Fix clipping, overlap, unreadable copy, incorrect state transitions, and loop discontinuities. These focused checks establish a finished, faithful feature preview; they are not a new full-app QA qualification or an additional artistic acceptance cycle.

**Done:** both files are complete, silent, within 8–15 seconds, have verified dimensions/frame rates, and have passed the applicable critical-moment checks with recorded digests. Report any departure from the GIF target before review.

## 3. Show the completed preview

Display the actual completed GIF and MP4 using the host's media preview support, with local paths as downloadable artifacts. If playback cannot be displayed, hand off a usable preview and wait until the owner can review it. A storyboard, sampled stills, progress estimate, or file-exists check does not replace the completed preview.

Combine approval to attach the previewed GIF with the step 9 release approval whenever possible. Recognize prior explicit approval for the same completed files and release scope. If the owner requests edits, revise the affected parts and show the new completed result before attachment. If production or preview delivery is blocked, state the cause and let the owner choose whether the release proceeds without media.

**Done:** the owner has seen the completed preview, and approval identifies the exact GIF digest and release. Creation consent alone cannot satisfy this gate.

## 4. Attach and verify after publication

After step 10, wait for the app's GitHub Release to exist and be published for the approved tag. Use available GitHub tools or `gh` to inspect its repository, tag, draft status, body, and assets. A pushed tag or a running build is not a published release. If CI fails, report the failure rather than creating a competing release.

1. Read and retain the existing release body and asset list. Give the approved GIF a descriptive release-specific filename; avoid overwriting existing assets. An existing identical asset may be reused after digest verification.
2. Upload that GIF to the published release. Add one Markdown image with English alt text and the returned asset download URL to the existing body, preserving all other notes and assets. Re-read the body before editing if it may have changed; avoid duplicate image embeds on retry.
3. Fetch the release again. Verify the correct tag, published status, original notes and assets, and the exact image embed. Compare the uploaded asset's SHA-256 digest with the approved file; if the service supplies no digest, download that asset into a new temporary directory and hash the downloaded bytes.

**Done:** the release body embeds the approved GIF, its digest matches, prior notes and assets are preserved, and the final response includes the verified release URL and local GIF/MP4 paths. An upload or body-edit failure remains incomplete and must be reported accurately.
