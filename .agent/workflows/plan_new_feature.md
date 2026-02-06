---
description: Plan a new feature using the writing-plans skill
---

1. Analyze the project structure to understand context.
   Run: `list_dir server`
   Run: `list_dir client`

2. Search for existing implementation plans to identify patterns.
   Run: `find_by_name *plan*.md`

3. Draft the implementation plan.
   Prompt: "@writing-plans I need to add a new feature. Please draft a detailed implementation plan following the standard headers and task granularity. Please ask me for the feature name and requirements if I haven't provided them."
