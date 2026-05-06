# Digital Scrum Board — Frontend

A React + TypeScript single-page application providing a real-time agile workspace UI built on Vite. It delivers drag-and-drop Kanban boards, sprint planning with live updates via SignalR, a structured auth flow with multi-step verification gates, and role-differentiated UI rendering. Every board change, comment, and notification is reflected across all connected clients instantly without page refreshes.

---

## Table of Contents

- [Application Purpose & UX Goals](#application-purpose--ux-goals)
- [Architecture & State Management](#architecture--state-management)
- [Integration with Backend API](#integration-with-backend-api)
- [Security Considerations](#security-considerations)
- [User Workflows](#user-workflows)
- [Performance & UX Optimizations](#performance--ux-optimizations)
- [Key Highlights](#key-highlights)

---

## Application Purpose & UX Goals

The frontend is the primary interface through which development teams plan sprints, track work items, and collaborate in real time. It surfaces three distinct workspace areas — a planning view for managing the backlog and assigning work to sprints, a Kanban board for active sprint execution, and an admin panel for user and audit management — each tailored to specific role-based workflows. The UX prioritizes minimal friction: drag-and-drop assignment, inline editing, optimistic UI updates, and real-time sync mean users rarely need to reload or navigate away to see the current state.

---

## Architecture & State Management

The application is component-driven with a clear separation between page-level orchestration and reusable UI primitives. Page components (`BacklogsV2`, `BoardsPage`, `AdminPage`) own data fetching, local state, and event wiring. Sub-components (`WorkItemCard`, `EpicsDrawer`, `SprintWorkItemsList`, `BacklogRow`) are pure or near-pure presentational components receiving typed props.

State management is intentionally kept local to avoid the complexity of a global store for data that is inherently scoped to a page or session. `useAuth` (a React Context) is the one piece of genuinely global state, providing the current user profile and a `setUser` updater to all descendants. API data is fetched on mount and on relevant SignalR events, with optimistic local state mutations applied immediately before API calls resolve — and rolled back on failure.

Custom hooks (`useDebounced`) handle cross-cutting timing concerns. `useMemo` and `useCallback` are applied consistently to derived data and event handlers that would otherwise cause unnecessary re-renders in deeply nested trees.

---

## Integration with Backend API

All HTTP communication is routed through a typed `apiClient` service that wraps `fetch` with `credentials: 'include'` (required for HttpOnly cookie auth), response parsing, and structured error extraction into typed `ApiError` instances. `ApiError` exposes semantic properties (`isUnauthorized`, `isPasswordChangeRequired`, `isEmailVerificationRequired`, `isAccountLocked`, `retryAfterSeconds`) that page components use to branch routing and UI state without parsing raw HTTP status codes throughout the codebase.

API modules (`authApi`, `boardsApi`, `workItemsApi`, `sprintsApi`, `lookupsApi`) provide typed async functions that return domain DTOs. This layer is the only place raw `fetch` calls appear, keeping page components free of network-level concerns.

Real-time communication runs through two persistent SignalR connections — a `boardHub` for board and sprint events, and a `notificationHub` for user-scoped notifications and session events. Hub connection management is centralized in service modules (`boardHub.ts`, `notificationHub.ts`) that expose singleton connections and an `ensureBoardHubStarted` guard. Pages register event handlers in `useEffect` cleanup pairs, ensuring no listener leaks occur on unmount or sprint selection changes.

---

## Security Considerations

Session management relies entirely on the HttpOnly cookie set by the backend. The frontend never stores, reads, or transmits tokens — there is no `localStorage` or `sessionStorage` usage for auth state, removing the entire class of XSS-based session theft.

Session invalidation is handled reactively. The `notificationHub` listens for `UserSessionInvalidated` and `UserPermissionsChanged` events; when received, a non-dismissible blocking modal is rendered, and the user is forced to re-authenticate. This propagates across all open tabs simultaneously because each tab maintains its own hub connection subscribed to the same user group.

Role-based UI rendering is enforced throughout. The `isAdminOrSM` flag (derived from `user.roleName`) gates the display of "New Item," "New Sprint," delete actions, and the admin sidebar navigation link. Work item edit forms conditionally expose fields based on role — the priority selector, team picker, and title field are hidden from developers viewing a work item detail modal. Card draggability on the Kanban board is computed per-card via `canMoveWorkItem`, which mirrors the backend permission model (role, sprint manager, assignee).

Client-side validation is layered before API calls using the same rule set as the backend: password strength is evaluated against all five criteria (length, uppercase, lowercase, digit, symbol) with per-rule indicator UI, and email format is validated with a shared utility. This reduces unnecessary round-trips without creating a false sense of security — the backend always validates independently.

---

## User Workflows

**Sprint planning** uses a two-panel layout with a collapsible Epics drawer at the top. The backlog panel displays stories and their child tasks as expandable rows; the sprints panel displays sprint rows with inline expand/collapse to show assigned work items. Drag-and-drop from backlog rows onto sprint drop zones triggers assignment — with a confirmation dialog when dragging a Story (which cascades assignment to all child Tasks) and a team-mismatch warning when the item's assignee belongs to a different team than the sprint.

**Kanban boards** present four columns per active sprint. Cards show assignee, team, priority, due date, and type. Dragging a card to a new column performs an optimistic status update immediately, calls the backend API, and rolls back only the moved card on failure — leaving other concurrent moves undisturbed. SignalR `WorkItemMoved` and `WorkItemStatusChanged` events apply live updates to all other connected clients without a fetch.

**Work item detail modal** supports inline editing with field-level permission gates (Active sprint locks all fields except due date), comment threading with optimistic comment insertion, real-time comment sync via SignalR, and cascading delete confirmation requiring the user to type "Delete" before proceeding.

**Auth flows** implement multi-step gates: login → password change required → email verification → main app. Each gate is a dedicated page that probes the backend state on mount and redirects forward or backward based on the response code. The email verification page polls the backend every five seconds, automatically advancing when verification completes in another tab.

---

## Performance & UX Optimizations

Debounced search inputs (`useDebounced`) prevent API calls on every keystroke. The epic cards section uses a `ResizeObserver` to dynamically compute how many cards fit per page, enabling a responsive card grid without fixed breakpoints. Sprint work items for expanded rows are loaded lazily on expand and cached in state, with targeted cache invalidation when SignalR events indicate changes to a specific sprint.

Error states are surfaced inline near their point of failure (per-form banners) rather than as modal interruptions. Loading states use skeleton cards that match the final card dimensions, preventing layout shift. Optimistic updates remove the perceived latency of API calls for the most frequent interactions (card moves, comment posting, sprint assignment).

---

## Key Highlights

- Real-time board and notification sync via dual SignalR hub architecture with automatic group join/leave on navigation
- Optimistic UI with targeted rollback — only the affected item reverts on failure, not the entire board
- Permission-aware UI that mirrors the backend model exactly, including sprint manager detection and active sprint field locks
- Multi-step auth gate architecture with automatic polling-based progression for email verification
- Reactive session invalidation propagated across all open browser tabs via SignalR
- Typed API client with semantic error properties enabling clean branching logic in page components
- ResizeObserver-driven responsive epic card pagination without CSS breakpoints
