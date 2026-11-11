// The client entry of @arvo/signup-funnel: the Sign-up funnel page's body,
// its range control and skeleton, and the note a screen sends. Mount the page
// inside the app's own QueryClientProvider. The calls go to
// /api/signup-funnel unless SignupFunnelReport's basePath prop says
// otherwise. Screens can import the note alone from
// @arvo/signup-funnel/notes, which brings no React with it.

export { SignupFunnelRange } from './client/range';
export { SignupFunnelReport, SignupFunnelSkeleton } from './client/report';
export type { SignupFunnelReportProps } from './client/report';
export { noteStep } from './notes';
export type { StepNote } from './notes';
