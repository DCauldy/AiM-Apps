# Tours Data Model

This document summarizes the Tours tables added for listing-media authorization, TourScene source photos, and optional scene enrichment facts.

## `tours_projects`

Tour Project shell for a listing workflow.

| Column | Purpose |
| --- | --- |
| `id` | Primary key for the Tour Project. |
| `user_id` | Agent/user who owns the project. |
| `name` | Human-readable project name. |
| `property_address` | Listing address. |
| `listing_url` | Optional listing URL. |
| `tour_type` | Selected output type: `tour_video`, `tour_video_voice_over`, or `tour_video_avatar`. |
| `status` | Project lifecycle status: `open` or `archived`. |
| `listing_media_acknowledged_at` | Timestamp showing the user acknowledged they can use listing media for this project. |
| `created_at` | When the policy row was created. |
| `updated_at` | When the policy row was last updated. |
| `archived_at` | When the project was archived. |

## `tour_scenes`

Ordered scene records owned by a Tour Project. These are the durable backbone for future script/render workflows.

| Column | Purpose |
| --- | --- |
| `id` | Primary key for the TourScene. |
| `project_id` | Parent Tour Project. |
| `title` | Human-readable scene name using Tours vocabulary, such as `Kitchen` or `Primary bedroom`. |
| `sort_order` | Saved scene order within the project. Unique per project. |
| `included` | Whether the scene participates in downstream script/render workflows. New scenes default to included. |
| `camera_motion` | Camera-motion preset from the controlled set: `auto`, `slow_push`, `slow_pan`, `static_hold`, `hero_reveal`, `detail_glide`, `vertical_rise`, `snap_push`. New scenes default to `auto`, which lets script planning choose the concrete render motion from the scene image. |
| `transition_effect` | Scene-transition preset from the controlled set: `auto`, `swipe-on-top`, `cross-dissolve`, `fade`, `cross-blur`, `cross-zoom`, `iris`, `soft-wipe`, `split-reveal`, `whip-pan`. New scenes default to `auto`, which lets script planning choose the concrete transition effect from scene context. |
| `created_at` | When the scene was created. |
| `updated_at` | When the scene was last updated. |

## `tour_scene_source_photos`

Listing-photo source media attached to TourScenes. The highest-priority source photo is the authoritative visual reference for a scene.

| Column | Purpose |
| --- | --- |
| `id` | Primary key for the source photo row. |
| `project_id` | Parent Tour Project. Duplicated with `scene_id` for authorization and query efficiency. |
| `scene_id` | TourScene this source photo belongs to. |
| `storage_path` | Storage location for the uploaded listing photo. |
| `file_name` | Original/display file name for the uploaded photo. |
| `content_type` | Supported image MIME type: `image/jpeg`, `image/png`, or `image/webp`. |
| `byte_size` | Uploaded file size in bytes. Must be positive. |
| `width` | Optional image width in pixels. |
| `height` | Optional image height in pixels. |
| `priority` | Source photo priority within the scene. Lower numbers are higher priority; `0` is the default authoritative photo. |
| `created_at` | When the source photo row was created. |

## `tour_scene_facts`

Proofed or suggested facts attached to a TourScene. This is the shared model for human-entered scene facts now and optional AI enrichment later, so downstream script generation can read one ordered fact list instead of separate manual/AI surfaces.

| Column | Purpose |
| --- | --- |
| `id` | Primary key for the scene fact row. |
| `project_id` | Parent Tour Project. Duplicated with `scene_id` for authorization and query efficiency. |
| `scene_id` | TourScene this fact belongs to. Deleting the scene deletes its facts. |
| `fact_text` | Short fact about the room, feature, theme, selling point, or scene. Blank facts are rejected. |
| `source_type` | Fact source: `human` for agent-entered facts, or `ai_suggestion` for future photo-only enrichment suggestions. |
| `source_label` | Optional human-readable provenance label, such as `Agent entry` or the enrichment source name. |
| `source_photo_id` | Optional source photo that produced or supports the fact. If that photo is deleted, only this pointer is cleared. |
| `provenance` | JSON provenance payload for source-specific metadata, citations, model names, or prompt/run identifiers. |
| `proof_status` | Review state: `proofed`, `suggested`, or `rejected`. Human-entered facts must be `proofed`. |
| `proofed_at` | Timestamp for when the fact became proofed. Defaults to now for human-entered proofed facts. |
| `proofed_by` | Optional user who proofed the fact. |
| `proof_metadata` | Optional JSON payload for review/edit metadata. |
| `sort_order` | Saved fact order within the scene. Unique per scene. |
| `created_at` | When the fact row was created. |
| `updated_at` | When the fact row was last updated. |

Human-entered facts from the workspace sidebar should insert with `source_type = 'human'` and `proof_status = 'proofed'`, making them immediately available as proofed scene context. Future AI enrichment can insert `source_type = 'ai_suggestion'` facts as `suggested` with `source_photo_id` and provenance metadata, then update the same rows to `proofed` or `rejected` during review.

## Authorization notes

- Row-level security ties scenes, source photos, and facts back to the owning `tours_projects.user_id`.
- Scene, source-photo, and fact writes are allowed only for open Tour Projects owned by the current user.
- Listing-media acknowledgement is stored on the owning `tours_projects` row.
