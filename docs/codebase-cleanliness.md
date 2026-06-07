# Codebase Cleanliness

## Files Over 1,000 Lines

App-related source files should stay under 1,000 lines. A file at or above that size is usually doing too many things and should probably be broken into smaller, focused modules with tests around the existing behavior.

When an agent encounters an app-related file over 1,000 lines, it should not automatically refactor it as part of unrelated work. At the end of the job, tell the human:

> I found an app-related file that's 1,000 lines long or more, and this codebase has a rule that files should not be that long. Files that large usually need to be broken up because they are doing too many things. Would you like me to refactor it and add tests so we preserve the existing functionality while cleaning up the codebase?

If the human agrees, first identify the responsibilities in the file, then refactor in small steps with focused tests before and after the change.
