# SAM AI Implementation Status

This file tracks what is actually implemented from the SAM AI upgrade roadmap.

## Implemented

1. Privilege 10 superadmin read/report access.
2. Chat delete/update/drop restrictions.
3. Flexible Excel report generation.
4. Downloadable report attachments.
5. Manual save picker for supported browsers.
6. AI conversation retention cleanup.
7. Employee name/usercode targeting.
8. DTR image generation for selected employee.
9. All-data combined Excel report.
10. Fuel analytics by department.
11. DTR late analytics by employee or department.
12. EPASS pending analytics by department.
13. Leave analytics by department.
14. Employee headcount analytics by department.
15. IT job order analytics by department.
16. Material/warehouse movement analytics.
17. Status report analytics.
18. Turnover analytics.
19. Kind exact-request response style.
20. Local fallback answers when AI API is not configured.
21. SAM audit log table for AI requests and generated reports.
22. Superadmin audit lookup from SAM chat.
23. Audit logging for both local fallback and external AI reply paths.
24. Anomaly detection router for warning/risk requests.
25. Large fuel request anomaly detection.
26. Repeated DTR late pattern detection.
27. EPASS pending backlog anomaly detection.
28. High material outflow anomaly detection.
29. SAM management briefing across Fuel, DTR, EPASS, Leave, and IT job orders.
30. Briefing risk hint that points users to anomaly details.
31. Shared natural-language date parser for SAM analytics and reports.
32. Date range support for `from YYYY-MM-DD to YYYY-MM-DD` and `YYYY-MM-DD to YYYY-MM-DD`.
33. Week and year date support for `this week`, `last week`, `this year`, and `last year`.
34. Month abbreviation support such as `apr 2026` for report generation.
35. DTR monthly report generation now recognizes full and abbreviated month names.
36. Relative range support for `last N days`, `past N days`, `last N weeks`, and `past N months`.
37. `between YYYY-MM-DD and YYYY-MM-DD` range support.
38. Live SAM verification for date parsing through management briefing, fuel analytics, and DTR Excel generation.
39. Operational recommendation router for diagnostic/action-plan questions.
40. Fuel recommendations with top department, requested liters, and approval-rate guidance.
41. DTR recommendations with top late employee and supervisor validation guidance.
42. EPASS recommendations for pending backlog prioritization.
43. Warehouse/material recommendations for high outflow review.
44. Module intent filtering so fuel, DTR, EPASS, and warehouse recommendations stay scoped to the user request.
45. Leave recommendations with pending count, total leave days, and approval guidance.
46. Travel recommendations with department volume, pending count, destination, and approval checklist.
47. IT job order recommendations with open job count, department priority, and problem sample.
48. Status report recommendations with account count and validation checklist.
49. Turnover recommendations with item count, account count, and condition review guidance.
50. Recommendation/report intent guard so `recommend status report` answers in chat instead of generating an Excel file.
51. Live SAM verification for leave, travel, IT, status report, and turnover recommendation prompts.
52. In-chat SAM table report payload for report/list/table requests.
53. Messenger frontend renderer for designed SAM table cards.
54. File generation narrowed to explicit Excel, export, download, image, or picture requests.
55. DTR image generation narrowed to explicit image/picture requests.
56. Table report row limiting with note to request Excel for full downloadable data.
57. Live SAM verification for DTR table report, all-employee table report, Excel generation, and image generation.
58. Messenger message reply references stored in the database.
59. Messenger message forward references stored in the database.
60. Hover/focus message actions for Reply and Forward.
61. Composer reply preview with cancel action.
62. Forward-to-conversation picker modal.
63. Forwarded message label and copied attachments.
64. Live API verification for reply metadata and forwarded message/attachment retrieval.
65. Messenger-style floating Reply/Forward action pill on message hover/focus.
66. Messenger-style quoted reply rail inside replied messages and composer preview.
67. Forward modal source-message preview before selecting a conversation.
68. Message reaction table with per-user persistent reactions.
69. Reaction smile icon and emoji picker on message hover/focus.
70. Reaction chips rendered under message bubbles with user-selected state.
71. Three-dot message options icon added beside reply/forward/reaction controls.
72. Messenger bubble color values moved to CSS theme variables.
73. New-message ringtone using Web Audio when unread messages increase.
74. Browser-safe audio unlock after user interaction.

## Next Batches

1. Add anomaly detection for unusual fuel, DTR, EPASS, leave, and inventory patterns.
2. Add scheduled daily, weekly, and monthly report generation.
3. Add AI training/admin panel for knowledge management.
4. Add audit log viewer for every SAM data request.
5. Add chart generation inside Excel reports.
6. Add fiscal/payroll period aliases and holiday-aware date ranges.
7. Add notification and reminder actions.
8. Add feedback buttons for SAM answers.
9. Add long-running report progress states.
10. Add sortable/paginated SAM table cards in Messenger.

## Rule

The 1000-item roadmap is not considered finished until each item has a matching code feature, test, or documented implementation entry here.
