// THE design-system seam: the only place this package's client files get
// their UI primitives and UI helpers. They are the same self-contained
// copies @arvo/traffic ships (./vendor, each file names its source and
// commit), drawn with the shadcn color names that ../styles/tokens.css
// defines. Adapting the page to another design system means editing exactly
// this file: point these exports at your own components with the same names
// and props.

export { Button } from './vendor/button';
export { Card, CardBody, CardHeader } from './vendor/card';
export { cn } from './vendor/cn';
export { errorFromBody, FunnelError } from './vendor/errors';
export { formatDate, formatNumber, plural } from './vendor/format';
export { Segmented } from './vendor/segmented';
export { Skeleton } from './vendor/skeleton';
export { EmptyState, ErrorState } from './vendor/states';
export { Table, TBody, Td, Th, THead, Tr } from './vendor/table';
export { RelativeTime } from './vendor/time';
export { pickParam, useUrlParams } from './vendor/url-state';
