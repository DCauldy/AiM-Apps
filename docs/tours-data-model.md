# Tours Data Model

This document summarizes the Tours tables added for listing-media authorization and the first TourScene source-photo model.

## `tours_projects`

Tour Project shell for a listing workflow.

| Column | Purpose |
| --- | --- |
| `id` | Primary key for the Tour Project. |
| `user_id` | Agent/user who owns the project. |
| `name` | Human-readable project name. |
| `property_address` | Listing address. |
| `listing_url` | Optional listing URL. |
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
| `camera_motion` | Initial safe camera-motion preset from the controlled set: `slow_push`, `slow_pan`, `static_hold`. |
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

## Authorization notes

- Row-level security ties scenes and source photos back to the owning `tours_projects.user_id`.
- Scene and source-photo writes are allowed only for open Tour Projects owned by the current user.
- Listing-media acknowledgement is stored on the owning `tours_projects` row.
